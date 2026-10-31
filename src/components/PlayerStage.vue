<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import videojs from 'video.js';
import 'video.js/dist/video-js.css';
import {
  ChevronLeft,
  ChevronRight,
  Gauge,
  Infinity as InfinityIcon,
  Link2,
  Loader2,
  Pause,
  Play,
  RotateCcw,
  StepForward,
  VideoOff,
} from 'lucide-vue-next';
import {
  canGoNext,
  canGoPrevious,
  currentSlice,
  currentSliceIndex,
  currentSliceProgress,
  goNext,
  goPrevious,
  onVideoEnded,
  onVideoPause,
  onVideoPlay,
  onVideoReady,
  onVideoSeeked,
  onVideoTimeUpdate,
  pauseForNote,
  registerPlayerApi,
  selectSlice,
  setPlaybackRate,
  setPlayMode,
  state,
  togglePlay,
  activeCourse,
} from '../stores/studio.js';
import { formatTime } from '../lib/time.js';
import { requestConfirm } from '../composables/useConfirm.js';
import { notify } from '../composables/useToast.js';

const emit = defineEmits(['reconnect']);
const videoEl = ref(null);
const player = ref(null);
const videoError = ref('');
let unregisterApi = null;
let objectUrl = '';
let loadToken = 0;

const rates = [0.75, 1, 1.25, 1.5, 2];
const currentRate = computed(() => Number(currentSlice.value?.playbackRate) || 1);
const hasVideo = computed(() => Boolean(state.videoFile || state.videoUrl));

const sliceElapsed = computed(() => {
  const slice = currentSlice.value;
  if (!slice) return 0;
  return Math.min(slice.endTime - slice.startTime, Math.max(0, state.currentTime - slice.startTime));
});

const sliceLength = computed(() => {
  const slice = currentSlice.value;
  return slice ? slice.endTime - slice.startTime : 0;
});

const statusLabel = computed(() => (state.playMode === 'step' ? '逐段模式' : '连续模式'));

function playerSeek(seconds, { play = false } = {}) {
  if (!player.value || !state.videoReady) return;
  try {
    player.value.currentTime(Math.max(0, Number(seconds) || 0));
    if (play) {
      const result = player.value.play();
      result?.catch?.(() => {});
    }
  } catch (error) {
    console.warn('[player] seek failed', error);
  }
}

const api = {
  seek: playerSeek,
  play() {
    if (!player.value || !state.videoReady) return;
    player.value.play()?.catch?.(() => {});
  },
  pause() {
    player.value?.pause?.();
  },
  setRate(rate) {
    if (player.value && Number.isFinite(Number(rate))) {
      player.value.playbackRate(Number(rate));
    }
  },
};

function attachEvents(instance) {
  instance.on('loadedmetadata', () => {
    state.videoReady = true;
    videoError.value = '';
    const duration = instance.duration();
    onVideoReady(duration, instance.currentTime());
  });
  instance.on('timeupdate', () => onVideoTimeUpdate(instance.currentTime()));
  instance.on('seeked', () => onVideoSeeked(instance.currentTime()));
  instance.on('play', () => onVideoPlay());
  instance.on('pause', () => onVideoPause());
  instance.on('ended', () => onVideoEnded());
  instance.on('error', () => {
    const error = instance.error();
    videoError.value =
      error?.message || '视频加载失败。请确认文件格式受浏览器支持，或尝试转换为 MP4（H.264）。';
    state.videoReady = false;
  });
  instance.on('loadstart', () => {
    videoError.value = '';
  });
}

function releaseSource() {
  if (objectUrl) {
    URL.revokeObjectURL(objectUrl);
    objectUrl = '';
  }
}

function applyVideoSource() {
  if (!player.value) return;
  const token = ++loadToken;
  player.value.pause();
  releaseSource();
  videoError.value = '';
  state.videoReady = false;

  if (!state.videoFile && !state.videoUrl) {
    try {
      player.value.reset();
    } catch {
      /* Player may already be disposed. */
    }
    return;
  }

  if (state.videoFile) {
    objectUrl = URL.createObjectURL(state.videoFile);
    player.value.src({ src: objectUrl, type: state.videoFile.type || 'video/mp4' });
  } else {
    player.value.src({ src: state.videoUrl, type: 'video/mp4' });
  }
  player.value.load();
  if (token !== loadToken) return;
  player.value.playbackRate?.(currentRate.value);
}

onMounted(() => {
  player.value = videojs(videoEl.value, {
    controls: true,
    autoplay: false,
    preload: 'auto',
    fill: true,
    playsinline: true,
    playbackRates: rates,
    bigPlayButton: true,
    controlBar: {
      pictureInPictureToggle: true,
      remainingTimeDisplay: false,
      playbackRateMenuButton: false,
    },
  });
  attachEvents(player.value);
  unregisterApi = registerPlayerApi(api);
  applyVideoSource();
});

watch(
  () => [state.videoFile, state.videoUrl],
  () => applyVideoSource(),
);

onBeforeUnmount(() => {
  unregisterApi?.();
  releaseSource();
  try {
    player.value?.dispose();
  } catch {
    /* noop */
  }
  player.value = null;
});

function nextSlice() {
  goNext({ play: true });
}

function previousSlice() {
  goPrevious({ play: state.isPlaying });
}

function replaySlice() {
  if (!currentSlice.value) return;
  selectSlice(currentSlice.value.id, { play: true, seek: true });
}

function changeRate(event) {
  setPlaybackRate(Number(event.target.value));
}

function toggleMode() {
  setPlayMode(state.playMode === 'step' ? 'continuous' : 'step');
}

function changeMode(mode) {
  setPlayMode(mode);
  if (mode === 'step' && currentSlice.value && state.currentTime >= currentSlice.value.endTime - 0.1) {
    playerSeek(currentSlice.value.startTime, { play: false });
  }
}
</script>

<template>
  <section class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line/80 bg-surface shadow-card">
    <div class="relative min-h-0 flex-1 bg-[#0b1210]" :class="{ 'player-empty': !hasVideo }">
      <video ref="videoEl" class="video-js study-player" playsinline></video>

      <div
        v-if="!hasVideo"
        class="absolute inset-0 z-20 flex flex-col items-center justify-center bg-[#0b1210] px-6 text-center"
      >
        <div class="pointer-events-none absolute inset-0 opacity-[0.07]" style="background-image: radial-gradient(#f7f4ea 1px, transparent 1px); background-size: 20px 20px"></div>
        <div class="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-paper/10 bg-paper/5 text-paper/55">
          <VideoOff :size="25" :stroke-width="1.4" />
        </div>
        <h3 class="relative mt-4 text-[15px] font-semibold text-paper/90">视频文件未连接</h3>
        <p class="relative mt-1.5 max-w-[330px] text-[11.5px] leading-5 text-paper/45">
          浏览器不会长期保存大体积视频。重新选择原文件后，字幕、标签与笔记都会恢复。
        </p>
        <button
          type="button"
          class="focus-ring relative mt-4 inline-flex items-center gap-2 rounded-lg bg-paper px-4 py-2.5 text-[12px] font-semibold text-pine transition hover:bg-surface-strong"
          @click="emit('reconnect')"
        >
          <Link2 :size="14" />
          连接原视频
        </button>
        <p class="relative mt-3 text-[9.5px] text-paper/30">{{ activeCourse?.fileName }}</p>
      </div>

      <div
        v-else-if="!state.videoReady && !videoError"
        class="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[#0b1210]/75"
      >
        <div class="flex items-center gap-2.5 rounded-full border border-paper/10 bg-paper/5 px-4 py-2 text-[11px] text-paper/65 backdrop-blur">
          <Loader2 :size="14" class="animate-spin" />
          正在读取视频…
        </div>
      </div>

      <div
        v-if="videoError"
        class="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#0b1210]/95 px-6 text-center"
      >
        <div class="flex h-11 w-11 items-center justify-center rounded-full bg-clay/15 text-clay">
          <VideoOff :size="20" />
        </div>
        <p class="mt-3 max-w-[380px] text-[12px] leading-6 text-paper/65">{{ videoError }}</p>
        <button
          type="button"
          class="focus-ring mt-4 rounded-lg border border-paper/15 px-3.5 py-2 text-[11px] font-medium text-paper/80 transition hover:bg-paper/10"
          @click="emit('reconnect')"
        >
          重新选择文件
        </button>
      </div>

      <div
        v-if="hasVideo && state.videoReady"
        class="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-4 bg-gradient-to-b from-[#0b1210]/75 to-transparent px-4 pb-10 pt-3.5"
      >
        <div class="min-w-0">
          <p class="text-[8.5px] font-semibold uppercase tracking-[0.2em] text-paper/40">
            Now studying · {{ String(currentSliceIndex + 1).padStart(2, '0') }}
          </p>
          <p class="mt-1 max-w-[540px] truncate text-[12px] font-medium text-paper/85">
            {{ currentSlice?.title || activeCourse?.name }}
          </p>
        </div>
        <span class="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-paper/15 bg-[#0b1210]/45 px-2.5 py-1 text-[9px] font-medium text-paper/65 backdrop-blur">
          <Pause v-if="state.playMode === 'step'" :size="9" />
          <InfinityIcon v-else :size="10" />
          {{ statusLabel }}
        </span>
      </div>
    </div>

    <div class="shrink-0 border-t border-line/70 bg-surface-strong">
      <div class="flex flex-wrap items-center gap-x-3 gap-y-2 px-3.5 py-2.5">
        <div class="flex items-center gap-1.5">
          <button
            type="button"
            class="transport-button"
            :disabled="!canGoPrevious || !state.videoReady"
            title="上一段"
            @click="previousSlice"
          >
            <ChevronLeft :size="15" />
            <span class="hidden sm:inline">上一段</span>
          </button>
          <button
            type="button"
            class="transport-button"
            :disabled="!state.videoReady"
            title="重听本段"
            @click="replaySlice"
          >
            <RotateCcw :size="13" />
          </button>
          <button
            type="button"
            class="transport-button transport-next"
            :class="{ 'transport-next-ready': state.reachedEnd }"
            :disabled="!canGoNext || !state.videoReady"
            title="下一段"
            @click="nextSlice"
          >
            <span>下一段</span>
            <ChevronRight :size="15" />
          </button>
        </div>

        <div class="order-3 min-w-[150px] flex-1 sm:order-2">
          <div class="flex items-center justify-between gap-2">
            <p class="text-[9.5px] font-medium text-muted">
              <span v-if="state.reachedEnd" class="text-clay">本段结束 · 可继续下一段</span>
              <span v-else>本段进度</span>
            </p>
            <p class="font-mono text-[9px] tabular-nums text-faint">
              {{ formatTime(sliceElapsed) }} / {{ formatTime(sliceLength) }}
            </p>
          </div>
          <div class="mt-1 h-1 overflow-hidden rounded-full bg-paper-deep">
            <div
              class="h-full rounded-full bg-pine/55 transition-[width] duration-200"
              :style="{ width: `${currentSliceProgress}%` }"
            ></div>
          </div>
        </div>

        <div class="order-2 ml-auto flex items-center gap-1.5 sm:order-3">
          <div class="flex items-center rounded-lg border border-line/80 bg-paper/55 p-0.5">
            <button
              type="button"
              class="mode-button"
              :class="{ 'mode-button-active': state.playMode === 'step' }"
              title="逐段播放：到达切片末尾自动暂停"
              @click="changeMode('step')"
            >
              <StepForward :size="12" />
              <span class="hidden md:inline">逐段</span>
            </button>
            <button
              type="button"
              class="mode-button"
              :class="{ 'mode-button-active': state.playMode === 'continuous' }"
              title="连续播放：不在切片边界暂停"
              @click="changeMode('continuous')"
            >
              <InfinityIcon :size="13" />
              <span class="hidden md:inline">连续</span>
            </button>
          </div>

          <label class="relative inline-flex items-center gap-1 rounded-lg border border-line/80 bg-paper/55 px-2 py-1.5 text-[10px] text-ink-soft">
            <Gauge :size="12" class="text-muted" />
            <select
              :value="currentRate"
              class="focus-ring cursor-pointer appearance-none bg-transparent pr-0.5 font-mono text-[10px] font-medium text-ink-soft outline-none"
              aria-label="本段播放速度"
              @change="changeRate"
            >
              <option v-for="rate in rates" :key="rate" :value="rate">{{ rate }}×</option>
            </select>
          </label>
        </div>
      </div>

      <div v-if="state.pauseOnNoteFocus" class="flex items-center justify-between border-t border-line/60 px-3.5 py-1.5 text-[9px] text-faint">
        <span class="inline-flex items-center gap-1">
          <span class="h-1 w-1 rounded-full bg-moss"></span>
          笔记聚焦时自动暂停已开启
        </span>
        <span class="hidden sm:inline">逐段模式下，视频会在本段末尾自动停下</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.transport-button {
  display: inline-flex;
  height: 30px;
  align-items: center;
  justify-content: center;
  gap: 4px;
  border: 1px solid color-mix(in srgb, var(--color-line) 82%, transparent);
  border-radius: 8px;
  background: var(--color-paper);
  padding: 0 9px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--color-ink-soft);
  transition:
    background 150ms ease,
    border-color 150ms ease,
    color 150ms ease,
    transform 150ms ease;
}
.transport-button:hover:not(:disabled) {
  border-color: var(--color-line-strong);
  background: var(--color-surface-strong);
  color: var(--color-ink);
}
.transport-button:active:not(:disabled) {
  transform: scale(0.98);
}
.transport-button:disabled {
  opacity: 0.38;
}
.transport-next {
  border-color: color-mix(in srgb, var(--color-pine) 22%, transparent);
  background: var(--color-pine-soft);
  color: var(--color-pine);
  font-weight: 600;
}
.transport-next:hover:not(:disabled) {
  background: color-mix(in srgb, var(--color-pine-soft) 60%, var(--color-pine));
  color: var(--color-surface-strong);
}
.transport-next-ready {
  animation: next-pulse 1.6s ease-in-out infinite;
}
.mode-button {
  display: inline-flex;
  height: 26px;
  align-items: center;
  gap: 3px;
  border-radius: 6px;
  padding: 0 7px;
  font-size: 9.5px;
  font-weight: 500;
  color: var(--color-faint);
  transition:
    background 150ms ease,
    color 150ms ease,
    box-shadow 150ms ease;
}
.mode-button:hover {
  color: var(--color-ink);
}
.mode-button-active {
  background: var(--color-surface-strong);
  color: var(--color-ink);
  box-shadow: 0 1px 2px rgba(23, 33, 29, 0.08);
}

@keyframes next-pulse {
  0%,
  100% {
    box-shadow: 0 0 0 0 rgba(182, 84, 54, 0);
  }
  50% {
    box-shadow: 0 0 0 3px rgba(182, 84, 54, 0.12);
  }
}

.player-empty :deep(.vjs-control-bar),
.player-empty :deep(.vjs-big-play-button) {
  display: none !important;
}
</style>
