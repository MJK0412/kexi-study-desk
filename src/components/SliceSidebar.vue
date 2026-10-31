<script setup>
import { computed, nextTick, ref, watch } from 'vue';
import {
  CircleAlert,
  FileText,
  Layers3,
  Link2,
  ListFilter,
  Plus,
  Sparkles,
  VideoOff,
} from 'lucide-vue-next';
import SliceListItem from './SliceListItem.vue';
import {
  activeCourse,
  currentSliceId,
  currentSliceProgress,
  filteredSlices,
  overallProgress,
  selectSlice,
  setFilter,
  state,
  tagCounts,
} from '../stores/studio.js';
import { formatBytes, formatTime } from '../lib/time.js';

const emit = defineEmits(['import-subtitles', 'reconnect', 'transcribe']);
const listRef = ref(null);

const filterOptions = [
  { key: 'all', label: '全部' },
  { key: 'review', label: '待回看' },
  { key: 'hard', label: '重难点' },
  { key: 'done', label: '已掌握' },
];

const indexById = computed(() => {
  const map = new Map();
  state.slices.forEach((slice, index) => map.set(slice.id, index));
  return map;
});

const subtitleFileName = computed(() => activeCourse.value?.subtitleFileName || '');
const hasVideo = computed(() => Boolean(state.videoFile || state.videoUrl));

watch(currentSliceId, async () => {
  await nextTick();
  const element = listRef.value?.querySelector('[data-active-slice="true"]');
  element?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
});
</script>

<template>
  <aside class="flex min-h-0 flex-col overflow-hidden rounded-2xl border border-line/80 bg-surface/80 shadow-card">
    <div class="shrink-0 border-b border-line/70 px-4 pb-3.5 pt-4">
      <div class="flex items-center justify-between gap-2">
        <p class="text-[9px] font-semibold uppercase tracking-[0.2em] text-faint">Course library</p>
        <span
          class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium"
          :class="
            state.videoFile || state.videoUrl
              ? 'bg-moss-soft/80 text-moss'
              : 'bg-amber-soft/80 text-amber'
          "
        >
          <span class="h-1 w-1 rounded-full" :class="hasVideo ? 'bg-moss' : 'bg-amber'"></span>
          {{ hasVideo ? '视频已连接' : '视频未连接' }}
        </span>
      </div>

      <h2 class="mt-2.5 line-clamp-2 text-[15px] font-semibold leading-[1.45] tracking-[-0.01em] text-ink">
        {{ activeCourse?.name }}
      </h2>

      <div class="mt-1.5 flex min-w-0 items-center gap-1.5 text-[10px] text-faint">
        <FileText :size="10" class="shrink-0" />
        <span class="truncate">{{ activeCourse?.fileName }}</span>
        <span v-if="activeCourse?.fileSize" class="shrink-0 text-line-strong">·</span>
        <span v-if="activeCourse?.fileSize" class="shrink-0">{{ formatBytes(activeCourse.fileSize) }}</span>
      </div>

      <div class="mt-3.5">
        <div class="flex items-baseline justify-between">
          <span class="text-[10px] text-muted">学习进度</span>
          <span class="font-mono text-[10px] tabular-nums text-ink-soft">
            {{ tagCounts.done }}<span class="text-faint"> / {{ state.slices.length }}</span>
          </span>
        </div>
        <div class="mt-1.5 h-1 overflow-hidden rounded-full bg-paper-deep">
          <div
            class="h-full rounded-full bg-gradient-to-r from-pine to-pine-2 transition-[width] duration-500"
            :style="{ width: `${overallProgress}%` }"
          ></div>
        </div>
      </div>

      <div
        v-if="!hasVideo"
        class="mt-3 flex items-center gap-2 rounded-lg border border-amber/20 bg-amber-soft/55 px-2.5 py-2"
      >
        <VideoOff :size="14" class="shrink-0 text-amber" />
        <p class="min-w-0 flex-1 text-[10px] leading-4 text-amber/90">
          刷新后需重新选择原视频
        </p>
        <button
          type="button"
          class="focus-ring inline-flex shrink-0 items-center gap-1 rounded-md bg-surface-strong px-2 py-1 text-[9.5px] font-semibold text-amber transition hover:bg-surface"
          @click="emit('reconnect')"
        >
          <Link2 :size="10" />
          连接
        </button>
      </div>
    </div>

    <div class="shrink-0 px-3 pb-2 pt-3">
      <div class="flex items-center gap-1 rounded-lg bg-paper/70 p-1">
        <button
          v-for="option in filterOptions"
          :key="option.key"
          type="button"
          class="focus-ring flex min-w-0 flex-1 items-center justify-center gap-1 rounded-md px-1.5 py-1.5 text-[10.5px] font-medium transition"
          :class="
            state.filter === option.key
              ? 'bg-surface-strong text-ink shadow-sm'
              : 'text-muted hover:text-ink'
          "
          @click="setFilter(option.key)"
        >
          <span class="truncate">{{ option.label }}</span>
          <span
            class="font-mono text-[8.5px] tabular-nums"
            :class="state.filter === option.key ? 'text-pine' : 'text-faint'"
          >
            {{ tagCounts[option.key] }}
          </span>
        </button>
      </div>
    </div>

    <div ref="listRef" class="min-h-0 flex-1 space-y-1 overflow-y-auto px-2 pb-2 pt-1">
      <SliceListItem
        v-for="slice in filteredSlices"
        :key="slice.id"
        :slice="slice"
        :index="indexById.get(slice.id) ?? 0"
        :active="slice.id === currentSliceId"
        :playing="state.isPlaying"
        :progress="slice.id === currentSliceId ? currentSliceProgress : 0"
        :data-active-slice="slice.id === currentSliceId ? 'true' : 'false'"
        @select="(id) => selectSlice(id)"
      />

      <div
        v-if="!state.slices.length"
        class="flex h-full min-h-[250px] flex-col items-center justify-center px-5 text-center"
      >
        <div class="relative flex h-14 w-14 items-center justify-center rounded-2xl border border-line/80 bg-surface-strong text-pine shadow-sm">
          <Layers3 :size="24" :stroke-width="1.5" />
          <span class="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-line bg-paper text-faint">
            <Plus :size="10" />
          </span>
        </div>
        <h3 class="mt-4 text-[13px] font-semibold text-ink">还没有学习切片</h3>
        <p class="mt-1.5 max-w-[210px] text-[10.5px] leading-5 text-muted">
          不用自己找字幕。让课隙用本地语音识别自动生成，或导入现成的 SRT / VTT。
        </p>
        <button
          v-if="hasVideo"
          type="button"
          class="focus-ring mt-4 inline-flex items-center gap-1.5 rounded-lg bg-pine px-3 py-2 text-[11px] font-semibold text-surface-strong transition hover:bg-pine-2"
          @click="emit('transcribe')"
        >
          <Sparkles :size="13" />
          自动生成字幕
        </button>
        <button
          type="button"
          class="focus-ring mt-2 inline-flex items-center gap-1.5 rounded-lg border border-line/80 bg-surface-strong px-3 py-2 text-[10.5px] font-medium text-ink-soft transition hover:border-line-strong"
          @click="emit('import-subtitles')"
        >
          <FileText :size="12" />
          导入已有字幕
        </button>
        <p v-if="!hasVideo" class="mt-2 text-[9.5px] text-faint">连接视频后即可自动转写</p>
      </div>

      <div
        v-else-if="!filteredSlices.length"
        class="flex h-full min-h-[190px] flex-col items-center justify-center px-5 text-center"
      >
        <ListFilter :size="22" :stroke-width="1.4" class="text-faint" />
        <p class="mt-3 text-[12px] font-medium text-ink-soft">这个标签下还没有切片</p>
        <button
          type="button"
          class="focus-ring mt-2 rounded-md px-2 py-1 text-[10.5px] font-medium text-pine transition hover:bg-pine-soft"
          @click="setFilter('all')"
        >
          查看全部
        </button>
      </div>
    </div>

    <div class="flex shrink-0 items-center gap-2 border-t border-line/70 bg-paper/35 px-4 py-2.5 text-[9.5px] text-faint">
      <CircleAlert :size="11" class="shrink-0" />
      <span class="truncate">{{ subtitleFileName || '尚未导入字幕' }}</span>
      <span class="ml-auto shrink-0 font-mono tabular-nums">
        {{ activeCourse?.duration ? formatTime(activeCourse.duration) : '—' }}
      </span>
    </div>
  </aside>
</template>
