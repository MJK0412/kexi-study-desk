<script setup>
import { computed } from 'vue';
import {
  CircleHelp,
  Download,
  FileText,
  FolderDown,
  FolderOpen,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Upload,
} from 'lucide-vue-next';
import CourseSwitcher from './CourseSwitcher.vue';
import { activeCourse, hasSubtitles, state } from '../stores/studio.js';

const emit = defineEmits([
  'open-video',
  'open-bilibili',
  'import-subtitles',
  'transcribe',
  'export',
  'open-archive',
  'help',
  'delete-course',
]);

const canExport = computed(() => Boolean(activeCourse.value && state.slices.length));
</script>

<template>
  <header class="relative z-30 shrink-0 border-b border-line/75 bg-paper/80 backdrop-blur-xl">
    <div class="flex h-[68px] items-center gap-3 px-4 sm:px-5 lg:px-6">
      <div class="flex shrink-0 items-center gap-3">
        <div class="brand-mark" aria-hidden="true">
          <span></span><span></span><span></span>
          <i></i>
        </div>
        <div class="hidden sm:block">
          <div class="flex items-baseline gap-2">
            <span class="font-display text-[22px] font-semibold tracking-[0.06em] text-ink">课隙</span>
            <span class="text-[9px] font-semibold uppercase tracking-[0.2em] text-faint">Kexi</span>
          </div>
          <p class="text-[10px] leading-4 tracking-[0.08em] text-muted">基金从业 · 切片学习台</p>
        </div>
      </div>

      <div class="mx-1 hidden h-8 w-px bg-line/80 md:block"></div>
      <CourseSwitcher
        v-if="activeCourse"
        class="hidden min-w-0 md:block"
        @open-video="emit('open-video')"
        @delete-course="emit('delete-course')"
      />

      <div class="ml-auto flex items-center gap-1.5 sm:gap-2">
        <button
          v-if="activeCourse"
          type="button"
          class="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line/80 bg-surface/60 px-2.5 py-2 text-[12px] font-medium text-ink-soft transition hover:border-line-strong hover:bg-surface-strong xl:px-3"
          title="打开新的本地视频"
          @click="emit('open-video')"
        >
          <Plus :size="14" :stroke-width="2" />
          <span class="hidden xl:inline">新课</span>
        </button>

        <button
          v-if="activeCourse"
          type="button"
          class="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-line/80 bg-surface/60 px-2.5 py-2 text-[12px] font-medium text-ink-soft transition hover:border-line-strong hover:bg-surface-strong xl:px-3"
          title="导入 B 站缓存视频"
          @click="emit('open-bilibili')"
        >
          <FolderDown :size="14" :stroke-width="1.8" />
          <span class="hidden xl:inline">B 站缓存</span>
        </button>

        <button
          v-if="activeCourse && (state.videoFile || state.videoUrl)"
          type="button"
          class="focus-ring inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-2 text-[12px] font-semibold transition sm:px-3"
          :class="
            hasSubtitles
              ? 'border-line/80 bg-surface/60 text-ink-soft hover:border-line-strong hover:bg-surface-strong'
              : 'border-pine/20 bg-pine-soft text-pine hover:bg-pine/10'
          "
          :disabled="state.importBusy"
          title="用本地语音识别自动生成字幕"
          @click="emit('transcribe')"
        >
          <Sparkles :size="14" :stroke-width="2" />
          <span class="hidden sm:inline">自动转写</span>
        </button>

        <button
          v-if="activeCourse"
          type="button"
          class="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-medium text-ink-soft transition hover:bg-surface hover:text-ink sm:px-3"
          :disabled="state.importBusy"
          @click="emit('import-subtitles')"
        >
          <Loader2 v-if="state.importBusy" :size="15" class="animate-spin" />
          <FileText v-else :size="15" :stroke-width="1.8" />
          <span class="hidden sm:inline">{{ hasSubtitles ? '更新字幕' : '导入字幕' }}</span>
        </button>

        <button
          v-if="activeCourse"
          type="button"
          class="focus-ring inline-flex items-center gap-1.5 rounded-lg px-2.5 py-2 text-[12px] font-medium transition sm:px-3"
          :class="
            canExport
              ? 'text-ink-soft hover:bg-surface hover:text-ink'
              : 'cursor-not-allowed text-faint'
          "
          :disabled="!canExport"
          title="导出 Markdown 学习笔记"
          @click="emit('export')"
        >
          <Download :size="15" :stroke-width="1.8" />
          <span class="hidden sm:inline">导出</span>
        </button>

        <div class="mx-1 hidden h-6 w-px bg-line/80 lg:block"></div>

        <button
          type="button"
          class="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-ink"
          aria-label="打开保存文件夹"
          title="打开 D:\课隙 保存文件夹"
          @click="emit('open-archive')"
        >
          <FolderOpen :size="16" :stroke-width="1.8" />
        </button>

        <button
          type="button"
          class="focus-ring hidden items-center gap-1.5 rounded-full border border-moss/20 bg-moss-soft/60 px-2.5 py-1.5 text-[10.5px] font-medium text-moss lg:inline-flex"
          title="切片和笔记会自动保存到 D:\课隙，浏览器中保留一份工作副本"
          @click="emit('help')"
        >
          <ShieldCheck :size="12" :stroke-width="2" />
          仅本机
        </button>

        <button
          type="button"
          class="focus-ring inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted transition hover:bg-surface hover:text-ink"
          aria-label="使用说明"
          title="使用说明"
          @click="emit('help')"
        >
          <CircleHelp :size="17" :stroke-width="1.8" />
        </button>

        <button
          v-if="!activeCourse"
          type="button"
          class="focus-ring inline-flex items-center gap-2 rounded-lg bg-pine px-3.5 py-2.5 text-[12px] font-semibold text-surface-strong shadow-sm transition hover:bg-pine-2 active:scale-[0.99]"
          @click="emit('open-video')"
        >
          <Upload :size="15" :stroke-width="2" />
          打开视频
        </button>
      </div>
    </div>
  </header>
</template>

<style scoped>
.brand-mark {
  position: relative;
  display: flex;
  height: 38px;
  width: 38px;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  border-radius: 12px;
  background: var(--color-pine);
  padding: 0 10px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.12);
}
.brand-mark span {
  display: block;
  height: 2.5px;
  border-radius: 999px;
  background: var(--color-paper);
}
.brand-mark span:nth-child(1) {
  width: 100%;
}
.brand-mark span:nth-child(2) {
  width: 72%;
}
.brand-mark span:nth-child(3) {
  width: 90%;
}
.brand-mark i {
  position: absolute;
  right: 8px;
  bottom: 7px;
  height: 5px;
  width: 5px;
  border-radius: 999px;
  background: #d68a3f;
}
</style>
