<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { AlertCircle, ArrowRight, Loader2, RotateCcw } from 'lucide-vue-next';
import AppHeader from './components/AppHeader.vue';
import WelcomeView from './components/WelcomeView.vue';
import StudyWorkspace from './components/StudyWorkspace.vue';
import ToastStack from './components/ToastStack.vue';
import ConfirmDialog from './components/ConfirmDialog.vue';
import HelpDialog from './components/HelpDialog.vue';
import TranscribeDialog from './components/TranscribeDialog.vue';
import BilibiliBrowser from './components/BilibiliBrowser.vue';
import {
  activeCourse,
  attachVideoToCourse,
  deleteActiveCourse,
  goNext,
  goPrevious,
  hasCourse,
  importSubtitleFile,
  initStudio,
  openBilibiliCourse,
  openVideo,
  seekTo,
  state,
  togglePlay,
} from './stores/studio.js';
import { buildCourseMarkdown, markdownFileName } from './lib/markdown.js';
import { downloadTextFile } from './lib/files.js';
import { openArchiveFolder } from './lib/archive.js';
import { notify } from './composables/useToast.js';
import { confirmState, requestConfirm } from './composables/useConfirm.js';
import {
  checkTranscriptionService,
  startTranscription,
} from './composables/useTranscription.js';

const videoInput = ref(null);
const subtitleInput = ref(null);
const videoPickerMode = ref('new');
const helpOpen = ref(false);
const bilibiliOpen = ref(false);

const showWorkspace = computed(() => !state.loading && !state.fatalError && hasCourse.value);

function chooseVideo(mode = 'new') {
  videoPickerMode.value = mode;
  videoInput.value?.click();
}

async function revealArchiveFolder() {
  try {
    await openArchiveFolder();
  } catch (error) {
    notify(error.message || '无法打开保存文件夹', 'error', 4500);
  }
}

async function onVideoChosen(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;
  if (videoPickerMode.value === 'reconnect') {
    await attachVideoToCourse(file);
    return;
  }
  await openVideo(file);
}

async function beginAutoTranscribe() {
  if (!state.videoFile && !state.videoUrl) {
    notify('请先打开视频，再自动生成字幕', 'info');
    return;
  }
  const course = activeCourse.value;
  if (state.slices.length) {
    const accepted = await requestConfirm({
      title: '重新自动生成字幕？',
      message: `当前课程已有 ${state.slices.length} 个切片。重新转写会替换字幕并重新切片。`,
      detail: '切片会按新内容重新划分，原有标签、笔记和倍速会尽量跟随。建议先导出一次 Markdown 备份。',
      confirmText: '开始转写',
      cancelText: '取消',
    });
    if (!accepted) return;
  }
  const source =
    course?.source === 'bilibili' && course.bilibiliId
      ? { kind: 'bilibili', id: course.bilibiliId, title: course.name }
      : state.videoFile;
  await startTranscription(source);
}

async function openBilibiliItem(payload) {
  bilibiliOpen.value = false;
  await openBilibiliCourse(payload.item, {
    duration: payload.duration,
    videoUrl: payload.videoUrl,
  });
  if (!state.slices.length) {
    await beginAutoTranscribe();
  }
}

function chooseSubtitles() {
  if (!activeCourse.value) {
    notify('请先打开一节视频', 'info');
    return;
  }
  subtitleInput.value?.click();
}

async function onSubtitleChosen(event) {
  const file = event.target.files?.[0];
  event.target.value = '';
  if (!file) return;

  const firstTry = await importSubtitleFile(file, { replace: false });
  if (!firstTry.needsConfirm) return;

  const accepted = await requestConfirm({
    title: '重新生成学习切片？',
    message: `当前课程已有 ${state.slices.length} 个切片。更新字幕后会按知识点和段落重新切分。`,
    detail: '原有标签、笔记与倍速会尽量跟随内容保留。建议先导出一次 Markdown 备份。',
    confirmText: '更新字幕',
    cancelText: '取消',
  });
  if (accepted) await importSubtitleFile(file, { replace: true });
}

async function exportNotes() {
  if (!activeCourse.value || !state.slices.length) {
    notify('还没有可导出的学习切片', 'info');
    return;
  }
  const markdown = buildCourseMarkdown(activeCourse.value, state.slices, state.subtitles);
  downloadTextFile(markdown, markdownFileName(activeCourse.value.name));
  notify('Markdown 学习笔记已导出', 'success');
}

async function confirmDeleteCourse() {
  const course = activeCourse.value;
  if (!course) return;
  const accepted = await requestConfirm({
    title: '删除这门课程？',
    message: `「${course.name}」的字幕、切片、标签与笔记将从本机浏览器中移除。`,
    detail: '本地视频原文件不会被删除。此操作无法撤销，建议先导出 Markdown 笔记。',
    confirmText: '删除课程',
    cancelText: '保留',
    tone: 'danger',
  });
  if (accepted) await deleteActiveCourse();
}

function handleKeyboard(event) {
  if (helpOpen.value) {
    if (event.key === 'Escape') helpOpen.value = false;
    return;
  }
  if (!showWorkspace.value || confirmState.open) return;
  const target = event.target;
  if (target instanceof HTMLElement) {
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    if (target.closest('[role="dialog"]')) return;
  }

  if (event.code === 'Space') {
    event.preventDefault();
    if (state.videoReady) togglePlay();
    return;
  }
  if (!state.videoReady) return;
  if (event.key === 'ArrowLeft') {
    event.preventDefault();
    seekTo(Math.max(0, state.currentTime - 5), { play: state.isPlaying });
    return;
  }
  if (event.key === 'ArrowRight') {
    event.preventDefault();
    seekTo(state.currentTime + 5, { play: state.isPlaying });
    return;
  }
  if (event.key === 'n' || event.key === 'N') {
    event.preventDefault();
    goNext({ play: true });
    return;
  }
  if (event.key === 'p' || event.key === 'P') {
    event.preventDefault();
    goPrevious({ play: state.isPlaying });
  }
}

watch(activeCourse, (course) => {
  document.title = course ? `${course.name} · 课隙` : '课隙 · 切片学习台';
});

onMounted(() => {
  initStudio();
  checkTranscriptionService();
  window.addEventListener('keydown', handleKeyboard);
});

onBeforeUnmount(() => {
  window.removeEventListener('keydown', handleKeyboard);
});
</script>

<template>
  <div class="flex h-full min-h-0 flex-col">
    <AppHeader
      @open-video="chooseVideo('new')"
      @open-bilibili="bilibiliOpen = true"
      @import-subtitles="chooseSubtitles"
      @transcribe="beginAutoTranscribe"
      @export="exportNotes"
      @open-archive="revealArchiveFolder"
      @help="helpOpen = true"
      @delete-course="confirmDeleteCourse"
    />

    <div v-if="state.loading" class="flex flex-1 items-center justify-center px-6">
      <div class="text-center">
        <div class="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-pine text-surface-strong shadow-card">
          <Loader2 :size="21" class="animate-spin" />
        </div>
        <p class="mt-4 text-[12px] font-medium text-ink-soft">正在打开本地学习台</p>
        <p class="mt-1 text-[10.5px] text-faint">读取本地课程，并同步 {{ state.archiveRoot }} 存档…</p>
      </div>
    </div>

    <div v-else-if="state.fatalError" class="flex flex-1 items-center justify-center px-6">
      <div class="max-w-md rounded-2xl border border-clay/20 bg-surface-strong p-6 text-center shadow-card">
        <div class="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-clay-soft text-clay">
          <AlertCircle :size="21" />
        </div>
        <h1 class="mt-4 text-[15px] font-semibold text-ink">本地存储没有打开</h1>
        <p class="mt-2 text-[12px] leading-6 text-muted">{{ state.fatalError }}</p>
        <button
          type="button"
          class="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-pine px-4 py-2.5 text-[12px] font-semibold text-surface-strong transition hover:bg-pine-2"
          @click="initStudio"
        >
          <RotateCcw :size="14" />
          重试
        </button>
      </div>
    </div>

    <WelcomeView
      v-else-if="!hasCourse"
      @pick-video="chooseVideo('new')"
      @open-bilibili="bilibiliOpen = true"
      @open-file="openVideo"
      @help="helpOpen = true"
    />

    <StudyWorkspace
      v-else
      @import-subtitles="chooseSubtitles"
      @reconnect="chooseVideo('reconnect')"
      @transcribe="beginAutoTranscribe"
    />

    <footer
      v-if="!state.loading && !state.fatalError"
      class="hidden shrink-0 items-center justify-between border-t border-line/60 px-5 py-1.5 text-[9px] text-faint lg:flex"
    >
      <p class="flex items-center gap-2">
        <span class="h-1 w-1 rounded-full bg-moss"></span>
        本地优先 · 视频不离开设备
        <span class="text-line-strong">/</span>
        <button type="button" class="transition hover:text-ink" @click="revealArchiveFolder">
          自动保存至 {{ state.archiveRoot }}
        </button>
        <span class="text-line-strong">/</span>
        <span>快捷键：Space 播放暂停 · ← → 快退快进 5 秒 · N 下一段</span>
      </p>
      <button
        type="button"
        class="focus-ring inline-flex items-center gap-1 rounded px-1 py-0.5 transition hover:text-ink"
        @click="helpOpen = true"
      >
        使用说明
        <ArrowRight :size="9" />
      </button>
    </footer>

    <ToastStack />
    <ConfirmDialog />
    <HelpDialog :open="helpOpen" @close="helpOpen = false" />
    <TranscribeDialog />
    <BilibiliBrowser
      :open="bilibiliOpen"
      @close="bilibiliOpen = false"
      @open-course="openBilibiliItem"
    />

    <input
      ref="videoInput"
      type="file"
      accept="video/*,.mkv,.m4v"
      class="hidden"
      @change="onVideoChosen"
    />
    <input
      ref="subtitleInput"
      type="file"
      accept=".srt,.vtt,text/vtt,application/x-subrip"
      class="hidden"
      @change="onSubtitleChosen"
    />
  </div>
</template>
