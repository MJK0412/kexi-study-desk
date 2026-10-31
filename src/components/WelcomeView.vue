<script setup>
import { ref } from 'vue';
import {
  ArrowUpRight,
  Clock3,
  Database,
  FileDown,
  FolderDown,
  FolderOpen,
  Layers3,
  ShieldCheck,
  Sparkles,
  UploadCloud,
} from 'lucide-vue-next';
import { isVideoFile } from '../lib/files.js';
import { notify } from '../composables/useToast.js';

const emit = defineEmits(['pick-video', 'open-bilibili', 'open-file', 'help']);
const dragging = ref(false);

function handleDrop(event) {
  dragging.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (!file) return;
  if (!isVideoFile(file)) {
    notify('请拖入 MP4、WebM、MOV 等视频文件', 'error');
    return;
  }
  emit('open-file', file);
}
</script>

<template>
  <main class="relative flex-1 overflow-y-auto">
    <div class="paper-noise pointer-events-none absolute inset-0 opacity-50 [mask-image:linear-gradient(to_bottom,black,transparent_78%)]"></div>

    <div class="relative mx-auto grid w-full max-w-[1280px] gap-10 px-5 py-9 sm:px-8 lg:grid-cols-[1.03fr_0.97fr] lg:items-center lg:gap-14 lg:px-10 lg:py-14 xl:py-20">
      <section class="max-w-[610px]">
        <div class="inline-flex items-center gap-2 rounded-full border border-line/80 bg-surface/65 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.2em] text-muted">
          <span class="h-1.5 w-1.5 rounded-full bg-clay"></span>
          Local-first study desk
        </div>

        <h1 class="mt-6 font-display text-[42px] font-semibold leading-[1.18] tracking-[-0.02em] text-ink sm:text-[52px] lg:text-[56px]">
          把长课，<br />
          拆成<span class="relative mx-1 inline-block text-pine">
            学得完
            <svg class="absolute -bottom-1 left-0 w-full text-clay/50" viewBox="0 0 120 8" fill="none" preserveAspectRatio="none" aria-hidden="true">
              <path d="M2 5.4C28 2.4 70 2.2 118 4.6" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </span>的片段。
        </h1>

        <p class="mt-5 max-w-[520px] text-[14px] leading-7 text-muted sm:text-[15px]">
          打开本地视频，课隙用本机语音识别自动生成字幕，再按知识点和段落切成学习单元。逐段精听、随手记笔记，不用再找字幕、和进度条搏斗。
        </p>

        <ol class="mt-8 grid max-w-[530px] gap-3">
          <li class="flex items-center gap-3.5">
            <span class="step-index">01</span>
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-ink">打开本地视频，或导入 B 站缓存</p>
              <p class="mt-0.5 text-[11.5px] leading-5 text-faint">文件不会上传，也不会写入数据库</p>
            </div>
          </li>
          <li class="flex items-center gap-3.5">
            <span class="step-index">02</span>
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-ink">自动生成字幕</p>
              <p class="mt-0.5 text-[11.5px] leading-5 text-faint">本机语音识别；已有 SRT / VTT 也可以直接导入</p>
            </div>
          </li>
          <li class="flex items-center gap-3.5">
            <span class="step-index">03</span>
            <div class="min-w-0">
              <p class="text-[13px] font-semibold text-ink">逐段播放，留下自己的笔记</p>
              <p class="mt-0.5 text-[11.5px] leading-5 text-faint">播完自动暂停；标签与笔记自动保存</p>
            </div>
          </li>
        </ol>

        <div class="mt-8 flex flex-wrap items-center gap-x-5 gap-y-2 text-[10.5px] text-faint">
          <span class="inline-flex items-center gap-1.5"><Clock3 :size="12" /> 按知识点 / 段落切片</span>
          <span class="inline-flex items-center gap-1.5"><Database :size="12" /> IndexedDB 本地存储</span>
          <span class="inline-flex items-center gap-1.5"><FileDown :size="12" /> Markdown 导出</span>
        </div>
      </section>

      <section class="relative">
        <div class="absolute -inset-x-6 -top-8 hidden items-center justify-between text-[9px] uppercase tracking-[0.22em] text-faint/80 lg:flex">
          <span>Start here</span>
          <span>No. 01 / Local</span>
        </div>

        <div
          class="relative overflow-hidden rounded-2xl border bg-surface-strong shadow-lift transition"
          :class="dragging ? 'border-pine ring-4 ring-pine/10' : 'border-line'"
          @dragenter.prevent="dragging = true"
          @dragover.prevent="dragging = true"
          @dragleave.prevent="dragging = false"
          @drop.prevent="handleDrop"
        >
          <div class="flex items-center justify-between border-b border-line/70 bg-paper/45 px-5 py-3">
            <div class="flex items-center gap-2">
              <span class="h-2 w-2 rounded-full bg-clay/75"></span>
              <span class="h-2 w-2 rounded-full bg-amber/60"></span>
              <span class="h-2 w-2 rounded-full bg-moss/60"></span>
            </div>
            <span class="text-[9.5px] font-medium uppercase tracking-[0.18em] text-faint">Your study desk</span>
          </div>

          <div class="p-5 sm:p-6">
            <div class="rounded-xl border border-dashed border-line-strong bg-paper/35 px-5 py-7 text-center transition hover:border-pine/40 hover:bg-pine-soft/30">
              <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-pine text-surface-strong shadow-sm">
                <UploadCloud :size="25" :stroke-width="1.5" />
              </div>
              <h2 class="mt-4 text-[17px] font-semibold tracking-tight text-ink">打开一节本地视频</h2>
              <p class="mx-auto mt-1.5 max-w-[270px] text-[12px] leading-5 text-muted">
                把视频拖到这里，或从电脑中选择。MP4 / WebM / MOV 均可。
              </p>
              <button
                type="button"
                class="focus-ring mt-5 inline-flex items-center gap-2 rounded-lg bg-pine px-4 py-2.5 text-[12.5px] font-semibold text-surface-strong shadow-sm transition hover:bg-pine-2 active:scale-[0.99]"
                @click="emit('pick-video')"
              >
                <FolderOpen :size="15" :stroke-width="1.8" />
                选择视频文件
              </button>
              <button
                type="button"
                class="focus-ring mt-2 inline-flex items-center gap-2 rounded-lg border border-line-strong bg-surface px-4 py-2 text-[11.5px] font-medium text-ink-soft transition hover:border-pine/40 hover:bg-pine-soft/40 hover:text-pine"
                @click="emit('open-bilibili')"
              >
                <FolderDown :size="14" :stroke-width="1.8" />
                导入 B 站缓存
              </button>
              <p class="mt-3 text-[10.5px] text-faint">视频较大时，读取元信息可能需要几秒</p>
            </div>

            <div class="my-5 flex items-center gap-3">
              <div class="h-px flex-1 bg-line/70"></div>
              <span class="text-[9.5px] font-semibold uppercase tracking-[0.18em] text-faint">Then</span>
              <div class="h-px flex-1 bg-line/70"></div>
            </div>

            <div class="grid grid-cols-2 gap-2.5">
              <div class="rounded-lg border border-line/70 bg-surface px-3.5 py-3">
                <Sparkles :size="16" class="text-pine" :stroke-width="1.7" />
                <p class="mt-2 text-[11.5px] font-semibold text-ink">自动生成字幕</p>
                <p class="mt-0.5 text-[10px] leading-4 text-faint">本机识别 · 约几分钟</p>
              </div>
              <div class="rounded-lg border border-line/70 bg-surface px-3.5 py-3">
                <Layers3 :size="16" class="text-pine" :stroke-width="1.7" />
                <p class="mt-2 text-[11.5px] font-semibold text-ink">生成切片</p>
                <p class="mt-0.5 text-[10px] leading-4 text-faint">按内容逻辑切分</p>
              </div>
            </div>
          </div>

          <div class="flex items-center justify-between gap-3 border-t border-line/70 bg-pine px-5 py-3.5 text-surface-strong">
            <div class="flex items-center gap-2 text-[11px] text-paper/75">
              <ShieldCheck :size="14" :stroke-width="1.9" class="text-paper/90" />
              音视频与笔记只留在你的浏览器
            </div>
            <button
              type="button"
              class="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[10.5px] font-medium text-paper/75 transition hover:text-surface-strong"
              @click="emit('help')"
            >
              没有字幕？
              <ArrowUpRight :size="12" />
            </button>
          </div>
        </div>

        <div class="mt-4 flex items-start gap-2.5 px-2 text-[10.5px] leading-5 text-faint">
          <span class="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-clay/70"></span>
          <p>
            仅用于你合法拥有的本地课程文件。课隙不抓取、不破解任何网课平台，也不会上传你的视频。
          </p>
        </div>
      </section>
    </div>
  </main>
</template>

<style scoped>
.step-index {
  display: flex;
  height: 28px;
  width: 28px;
  flex: none;
  align-items: center;
  justify-content: center;
  border: 1px solid color-mix(in srgb, var(--color-line-strong) 75%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-surface) 72%, transparent);
  font-family: ui-monospace, 'SFMono-Regular', Consolas, monospace;
  font-size: 9.5px;
  font-weight: 600;
  color: var(--color-muted);
}
</style>
