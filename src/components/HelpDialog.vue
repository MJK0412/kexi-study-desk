<script setup>
import { ref } from 'vue';
import {
  AudioLines,
  FileText,
  FolderDown,
  FolderOpen,
  Loader2,
  ShieldCheck,
  Sparkles,
  Timer,
  X,
} from 'lucide-vue-next';
import { openArchiveFolder } from '../lib/archive.js';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close']);

const openingArchive = ref(false);
const archiveError = ref('');

async function revealArchive() {
  openingArchive.value = true;
  archiveError.value = '';
  try {
    await openArchiveFolder();
  } catch (error) {
    archiveError.value = error.message || '无法打开保存文件夹';
  } finally {
    openingArchive.value = false;
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="help">
      <div
        v-if="props.open"
        class="fixed inset-0 z-[95] flex items-center justify-center bg-ink/35 p-4 backdrop-blur-[2px]"
        @mousedown.self="emit('close')"
      >
        <div
          class="animate-dialog-in flex max-h-[88vh] w-full max-w-[600px] flex-col overflow-hidden rounded-2xl border border-line bg-surface-strong shadow-lift"
          role="dialog"
          aria-modal="true"
          aria-label="字幕与使用说明"
        >
          <div class="flex items-start justify-between gap-4 border-b border-line/75 px-6 py-5">
            <div>
              <p class="text-[10px] font-semibold uppercase tracking-[0.22em] text-clay">Study workflow</p>
              <h2 class="mt-1 font-display text-[25px] font-semibold leading-tight text-ink">从字幕到笔记</h2>
              <p class="mt-1.5 text-[13px] leading-6 text-muted">
                打开本地视频或 B 站缓存，自动生成字幕和切片；标签、笔记会自动保存到 D:\课隙。
              </p>
            </div>
            <button
              class="focus-ring -mr-1 rounded-lg p-2 text-faint transition hover:bg-paper hover:text-ink"
              aria-label="关闭说明"
              @click="emit('close')"
            >
              <X :size="17" />
            </button>
          </div>

          <div class="overflow-y-auto px-6 py-5">
            <section class="rounded-xl border border-pine/15 bg-pine-soft/45 p-4">
              <div class="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-pine text-surface-strong">
                  <AudioLines :size="15" />
                </span>
                自动生成字幕（推荐）
              </div>
              <ol class="mt-3 space-y-1.5 text-[12px] leading-6 text-ink-soft">
                <li><span class="mr-2 font-mono text-[10px] text-pine">01</span>打开一节本地视频，或导入 B 站缓存课程。</li>
                <li><span class="mr-2 font-mono text-[10px] text-pine">02</span>点顶部「自动转写」，等待本机识别。</li>
                <li><span class="mr-2 font-mono text-[10px] text-pine">03</span>识别完成后按知识点、段落自动切片，直接开始学习。</li>
              </ol>
              <div class="mt-3 flex items-start gap-2 rounded-lg bg-surface-strong/70 px-3 py-2.5 text-[10.5px] leading-5 text-muted">
                <Sparkles :size="12" class="mt-0.5 shrink-0 text-clay" />
                使用本机 CPU 和 faster-whisper small 模型，视频不上传云端。第一次使用需下载约 480MB 模型。
              </div>
            </section>

            <section class="mt-4 rounded-xl border border-line/80 bg-paper/40 p-4">
              <div class="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-clay-soft text-clay">
                  <FolderDown :size="15" />
                </span>
                B 站缓存课程
              </div>
              <p class="mt-2 text-[12px] leading-5 text-muted">
                点顶部「B 站缓存」，可以直接读取本机
                <code class="font-mono text-[10.5px]">Videos/bilibili</code>，也可以选择缓存文件夹或手动选中
                视频轨、音频轨两个 <code class="font-mono text-[10.5px]">.m4s</code>。课隙会在本地合并后播放和转写。
              </p>
            </section>

            <section class="mt-4 rounded-xl border border-pine/15 bg-pine-soft/30 p-4">
              <div class="flex items-center gap-2 text-[13px] font-semibold text-ink">
                <span class="flex h-7 w-7 items-center justify-center rounded-lg bg-pine text-surface-strong">
                  <FolderOpen :size="15" />
                </span>
                切片和笔记保存在哪里
              </div>
              <p class="mt-2 text-[12px] leading-5 text-muted">
                每门课在 <code class="font-mono text-[10.5px]">D:\课隙</code> 下有一个以课程名命名的文件夹。
                文件夹里每个切片一个 <span class="font-medium text-ink-soft">.md</span>（含字幕、标签、笔记），
                另有 <span class="font-medium text-ink-soft">课程总览.md</span> 和完整备份
                <span class="font-medium text-ink-soft">课程数据.json</span>。改动后会自动更新。
              </p>
              <div class="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  class="focus-ring inline-flex items-center gap-1.5 rounded-lg border border-pine/20 bg-surface-strong px-3 py-2 text-[11.5px] font-semibold text-pine transition hover:bg-pine-soft"
                  :disabled="openingArchive"
                  @click="revealArchive"
                >
                  <Loader2 v-if="openingArchive" :size="13" class="animate-spin" />
                  <FolderOpen v-else :size="13" />
                  打开 D:\课隙
                </button>
                <span class="text-[10.5px] text-faint">浏览器中会保留一份工作副本</span>
              </div>
              <p v-if="archiveError" class="mt-2 text-[11px] leading-5 text-clay">{{ archiveError }}</p>
            </section>

            <section class="mt-4 grid gap-3 sm:grid-cols-2">
              <div class="rounded-xl border border-line/80 p-4">
                <FileText :size="18" class="text-pine" :stroke-width="1.8" />
                <h3 class="mt-2.5 text-[13px] font-semibold text-ink">已有字幕文件</h3>
                <p class="mt-1 text-[12px] leading-5 text-muted">
                  支持 <span class="font-medium text-ink-soft">.srt</span> 与
                  <span class="font-medium text-ink-soft">.vtt</span>。已有字幕时，导入会比自动转写更快。
                </p>
              </div>
              <div class="rounded-xl border border-line/80 p-4">
                <ShieldCheck :size="18" class="text-pine" :stroke-width="1.8" />
                <h3 class="mt-2.5 text-[13px] font-semibold text-ink">数据只在本机</h3>
                <p class="mt-1 text-[12px] leading-5 text-muted">
                  视频只写入本地临时文件，识别完成即删除；切片、标签和笔记自动保存到
                  <span class="font-medium text-ink-soft">D:\课隙</span>，浏览器保留工作副本。
                </p>
              </div>
            </section>

            <section class="mt-4 rounded-xl bg-amber-soft/70 px-4 py-3.5">
              <p class="flex items-center gap-1.5 text-[12px] font-semibold text-amber">
                <Timer :size="13" />
                关于识别时间
              </p>
              <p class="mt-1 text-[12px] leading-5 text-ink-soft/80">
                转写速度取决于电脑 CPU 和视频长度。10 分钟视频通常需要几分钟；长课程建议接上电源并保持课隙服务运行。识别中可以随时取消。
              </p>
            </section>
          </div>

          <div class="flex items-center justify-between gap-4 border-t border-line/75 bg-paper/45 px-6 py-3.5">
            <p class="text-[11px] text-faint">课程自动保存到 D:\课隙 · 只处理你主动选择的本地文件与缓存</p>
            <button
              class="focus-ring rounded-lg bg-pine px-4 py-2 text-[12.5px] font-semibold text-surface-strong transition hover:bg-pine-2"
              @click="emit('close')"
            >
              知道了
            </button>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.help-enter-active,
.help-leave-active {
  transition: opacity 180ms ease;
}
.help-enter-from,
.help-leave-to {
  opacity: 0;
}
</style>
