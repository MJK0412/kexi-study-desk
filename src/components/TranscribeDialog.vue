<script setup>
import { computed, onBeforeUnmount, onMounted } from 'vue';
import {
  AlertTriangle,
  AudioLines,
  CheckCircle2,
  Clock3,
  Cpu,
  FileVideo2,
  Loader2,
  RotateCcw,
  ShieldCheck,
  X,
} from 'lucide-vue-next';
import {
  cancelTranscription,
  closeTranscriptionDialog,
  retryTranscription,
  transcription,
} from '../composables/useTranscription.js';
import { formatTime } from '../lib/time.js';

const activePhases = ['checking', 'uploading', 'processing', 'finalizing'];
const canClose = computed(() => !activePhases.includes(transcription.phase));
const isActive = computed(() => activePhases.includes(transcription.phase));

const percent = computed(() => {
  if (transcription.phase === 'uploading') return transcription.uploadProgress;
  if (transcription.phase === 'checking') return 0;
  return Math.min(100, Math.max(0, Math.round(transcription.progress)));
});

const phaseLabel = computed(() => {
  switch (transcription.phase) {
    case 'checking':
      return '检查本地环境';
    case 'uploading':
      return '读取本地视频';
    case 'processing':
      return '本地语音识别';
    case 'finalizing':
      return '生成学习切片';
    case 'done':
      return '转写完成';
    case 'error':
      return '转写失败';
    case 'canceled':
      return '已取消';
    case 'unavailable':
      return '服务未就绪';
    default:
      return '准备转写';
  }
});

const elapsedLabel = computed(() => {
  const seconds = Math.max(0, transcription.elapsed || 0);
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
});

const runtimeHint = computed(() => {
  if (transcription.errorCode === 'ASR_PACKAGES_MISSING' || transcription.errorCode === 'PYTHON_MISSING') {
    return '本地语音识别组件没有装好。请先运行 npm run setup:asr，或重新安装课隙。';
  }
  if (transcription.errorCode === 'SERVICE_UNAVAILABLE') {
    return '请双击桌面上的「课隙」图标启动，而不是直接打开 index.html。启动后稍等 2 秒再试。';
  }
  return transcription.message || '请稍后重试。';
});

function tryClose() {
  if (canClose.value) closeTranscriptionDialog();
}

function onKeydown(event) {
  if (!transcription.open) return;
  if (event.key === 'Escape') {
    event.preventDefault();
    tryClose();
  }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
  <Teleport to="body">
    <Transition name="transcribe">
      <div
        v-if="transcription.open"
        class="fixed inset-0 z-[96] flex items-center justify-center bg-ink/40 p-4 backdrop-blur-[3px]"
        @mousedown.self="tryClose"
      >
        <div
          class="animate-dialog-in flex max-h-[90vh] w-full max-w-[540px] flex-col overflow-hidden rounded-2xl border border-line bg-surface-strong shadow-lift"
          role="dialog"
          aria-modal="true"
          aria-label="自动生成字幕"
        >
          <div class="flex items-start gap-3 border-b border-line/75 px-5 py-4">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine text-surface-strong shadow-sm">
              <AudioLines :size="19" :stroke-width="1.8" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h2 class="text-[15px] font-semibold tracking-tight text-ink">自动生成字幕</h2>
                <span class="rounded-full border border-moss/20 bg-moss-soft/70 px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-moss">
                  On-device
                </span>
              </div>
              <p class="mt-0.5 truncate text-[10.5px] text-faint">
                {{ transcription.fileName || '本地视频' }} · faster-whisper small
              </p>
            </div>
            <button
              type="button"
              class="focus-ring -mr-1 rounded-lg p-1.5 text-faint transition hover:bg-paper hover:text-ink disabled:cursor-not-allowed disabled:opacity-30"
              :disabled="!canClose"
              aria-label="关闭"
              @click="tryClose"
            >
              <X :size="16" />
            </button>
          </div>

          <div class="overflow-y-auto px-5 py-5">
            <!-- Unavailable -->
            <div v-if="transcription.phase === 'unavailable'" class="text-center">
              <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-amber-soft text-amber">
                <AlertTriangle :size="24" :stroke-width="1.6" />
              </div>
              <h3 class="mt-4 text-[14px] font-semibold text-ink">本地转写服务没有启动</h3>
              <p class="mx-auto mt-2 max-w-[380px] text-[12px] leading-6 text-muted">
                {{ runtimeHint }}
              </p>
              <div class="mt-4 rounded-lg bg-paper px-3.5 py-3 text-left text-[10.5px] leading-5 text-muted">
                <p class="font-semibold text-ink-soft">正确打开方式</p>
                <p class="mt-1">双击桌面上的「课隙」图标 → 浏览器自动打开 → 再点自动生成字幕。</p>
              </div>
            </div>

            <!-- Done -->
            <div v-else-if="transcription.phase === 'done'" class="text-center">
              <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-moss-soft text-moss">
                <CheckCircle2 :size="25" :stroke-width="1.7" />
              </div>
              <h3 class="mt-4 text-[14px] font-semibold text-ink">字幕已生成</h3>
              <p class="mt-1.5 text-[12px] leading-6 text-muted">{{ transcription.message }}</p>
              <div class="mx-auto mt-4 grid max-w-[360px] grid-cols-3 gap-2">
                <div class="rounded-lg bg-paper px-2 py-2.5">
                  <p class="font-mono text-[16px] font-semibold tabular-nums text-ink">{{ transcription.segmentCount }}</p>
                  <p class="mt-0.5 text-[9px] text-faint">字幕条数</p>
                </div>
                <div class="rounded-lg bg-paper px-2 py-2.5">
                  <p class="font-mono text-[16px] font-semibold tabular-nums text-ink">{{ formatTime(transcription.duration) }}</p>
                  <p class="mt-0.5 text-[9px] text-faint">视频时长</p>
                </div>
                <div class="rounded-lg bg-paper px-2 py-2.5">
                  <p class="font-mono text-[16px] font-semibold tabular-nums text-ink">{{ elapsedLabel }}</p>
                  <p class="mt-0.5 text-[9px] text-faint">识别用时</p>
                </div>
              </div>
            </div>

            <!-- Error -->
            <div v-else-if="transcription.phase === 'error'" class="text-center">
              <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-clay-soft text-clay">
                <AlertTriangle :size="24" :stroke-width="1.6" />
              </div>
              <h3 class="mt-4 text-[14px] font-semibold text-ink">这次没有转写成功</h3>
              <p class="mx-auto mt-2 max-w-[400px] text-[11.5px] leading-6 text-muted">
                {{ transcription.error }}
              </p>
              <p
                v-if="transcription.errorCode === 'ASR_PACKAGES_MISSING' || transcription.errorCode === 'PYTHON_MISSING'"
                class="mx-auto mt-2 max-w-[380px] rounded-lg bg-amber-soft/70 px-3 py-2 text-[10.5px] leading-5 text-amber"
              >
                需要先运行一次 <code class="font-mono">npm run setup:asr</code> 安装本地识别组件。
              </p>
            </div>

            <!-- Canceled -->
            <div v-else-if="transcription.phase === 'canceled'" class="text-center">
              <div class="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-paper-deep text-muted">
                <X :size="24" :stroke-width="1.6" />
              </div>
              <h3 class="mt-4 text-[14px] font-semibold text-ink">已取消转写</h3>
              <p class="mt-1.5 text-[11.5px] leading-6 text-muted">未完成的临时文件已清理，不会影响已有笔记。</p>
            </div>

            <!-- Active -->
            <div v-else>
              <div class="flex items-end justify-between gap-4">
                <div>
                  <p class="text-[9px] font-semibold uppercase tracking-[0.18em] text-faint">{{ phaseLabel }}</p>
                  <p class="mt-1 font-mono text-[38px] font-light leading-none tracking-tight text-ink">
                    {{ transcription.phase === 'checking' ? '…' : `${percent}` }}<span v-if="transcription.phase !== 'checking'" class="ml-0.5 text-[17px] text-faint">%</span>
                  </p>
                </div>
                <div class="mb-1 flex items-center gap-1.5 rounded-full bg-paper px-2.5 py-1 text-[9.5px] text-muted">
                  <Clock3 :size="10" />
                  <span class="font-mono tabular-nums">{{ elapsedLabel }}</span>
                </div>
              </div>

              <div class="mt-3 h-1.5 overflow-hidden rounded-full bg-paper-deep">
                <div
                  class="h-full rounded-full bg-gradient-to-r from-pine to-pine-2 transition-[width] duration-500"
                  :class="{ 'transcribe-indeterminate': transcription.phase === 'checking' }"
                  :style="{ width: transcription.phase === 'checking' ? '36%' : `${percent}%` }"
                ></div>
              </div>

              <div class="mt-4 flex items-start gap-2.5 rounded-xl border border-line/70 bg-paper/55 px-3.5 py-3">
                <Loader2 :size="15" class="mt-0.5 shrink-0 animate-spin text-pine" />
                <div class="min-w-0">
                  <p class="text-[11.5px] font-medium leading-5 text-ink-soft">{{ transcription.message }}</p>
                  <p v-if="transcription.lastSegment" class="mt-1 line-clamp-2 text-[10.5px] leading-5 text-faint">
                    “{{ transcription.lastSegment }}”
                  </p>
                </div>
              </div>

              <div class="mt-3 grid grid-cols-2 gap-2 text-[9.5px] leading-5 text-faint">
                <p class="flex items-center gap-1.5"><Cpu :size="11" /> 使用本机 CPU，不上传云端</p>
                <p class="flex items-center gap-1.5"><FileVideo2 :size="11" /> 视频只写到临时文件</p>
              </div>

              <p class="mt-3 rounded-lg bg-amber-soft/55 px-3 py-2 text-[10px] leading-5 text-amber/90">
                第一次识别需要下载约 480MB 的 small 模型，之后可离线使用。长视频可能需要几十分钟，请保持电脑供电。
              </p>
            </div>
          </div>

          <div class="flex items-center justify-between gap-3 border-t border-line/75 bg-paper/45 px-5 py-3.5">
            <p class="flex items-center gap-1.5 text-[9.5px] text-faint">
              <ShieldCheck :size="11" />
              本地识别，视频不离开设备
            </p>
            <div class="flex items-center gap-2">
              <template v-if="transcription.phase === 'done'">
                <button
                  type="button"
                  class="focus-ring rounded-lg bg-pine px-4 py-2 text-[12px] font-semibold text-surface-strong transition hover:bg-pine-2"
                  @click="closeTranscriptionDialog"
                >
                  开始学习
                </button>
              </template>

              <template v-else-if="isActive">
                <button
                  type="button"
                  class="focus-ring rounded-lg border border-line px-3.5 py-2 text-[11.5px] font-medium text-muted transition hover:border-clay/30 hover:bg-clay-soft hover:text-clay"
                  @click="cancelTranscription"
                >
                  取消转写
                </button>
              </template>

              <template v-else>
                <button
                  type="button"
                  class="focus-ring rounded-lg px-3 py-2 text-[11.5px] font-medium text-muted transition hover:bg-paper-deep hover:text-ink"
                  @click="closeTranscriptionDialog"
                >
                  关闭
                </button>
                <button
                  type="button"
                  class="focus-ring inline-flex items-center gap-1.5 rounded-lg bg-pine px-3.5 py-2 text-[11.5px] font-semibold text-surface-strong transition hover:bg-pine-2"
                  @click="retryTranscription"
                >
                  <RotateCcw :size="12" />
                  {{ transcription.phase === 'unavailable' ? '重新检测并开始' : '重试' }}
                </button>
              </template>
            </div>
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.transcribe-enter-active,
.transcribe-leave-active {
  transition: opacity 180ms ease;
}
.transcribe-enter-from,
.transcribe-leave-to {
  opacity: 0;
}
.transcribe-indeterminate {
  animation: transcribe-slide 1.2s ease-in-out infinite;
}
@keyframes transcribe-slide {
  0% {
    transform: translateX(-110%);
  }
  100% {
    transform: translateX(310%);
  }
}
</style>
