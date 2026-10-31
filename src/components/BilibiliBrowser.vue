<script setup>
import { computed, ref, watch } from 'vue';
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Database,
  FileVideo2,
  FolderOpen,
  Loader2,
  Music2,
  RefreshCw,
  UploadCloud,
  X,
} from 'lucide-vue-next';
import { formatTime } from '../lib/time.js';

const props = defineProps({
  open: { type: Boolean, default: false },
});
const emit = defineEmits(['close', 'open-course']);

const library = ref({ items: [], available: false, error: '', root: '' });
const loading = ref(false);
const libraryError = ref('');
const busyId = ref('');
const uploadPhase = ref('idle');
const uploadProgress = ref(0);
const uploadMessage = ref('');
const uploadError = ref('');
const title = ref('');
const selected = ref(null);
const folderInput = ref(null);
const filesInput = ref(null);

const isUploading = computed(() =>
  ['uploading', 'remuxing'].includes(uploadPhase.value),
);

const canClose = computed(() => !isUploading.value);

function formatSize(bytes) {
  const size = Number(bytes) || 0;
  if (size >= 1024 ** 3) return `${(size / 1024 ** 3).toFixed(1)} GB`;
  if (size >= 1024 ** 2) return `${Math.round(size / 1024 ** 2)} MB`;
  return `${Math.max(1, Math.round(size / 1024))} KB`;
}

function resetUpload() {
  uploadPhase.value = 'idle';
  uploadProgress.value = 0;
  uploadMessage.value = '';
  uploadError.value = '';
  selected.value = null;
  title.value = '';
}

async function loadLibrary(force = false) {
  loading.value = true;
  libraryError.value = '';
  try {
    const response = await fetch(`/api/bilibili/library${force ? '?refresh=1' : ''}`, {
      cache: 'no-store',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '读取缓存目录失败');
    library.value = data;
  } catch (error) {
    libraryError.value = error.message || '无法读取本机缓存目录';
  } finally {
    loading.value = false;
  }
}

watch(
  () => props.open,
  (open) => {
    if (!open) return;
    resetUpload();
    loadLibrary(true);
  },
);

function tryClose() {
  if (canClose.value) emit('close');
}

function chooseFolder() {
  folderInput.value?.click();
}

function chooseFiles() {
  filesInput.value?.click();
}

function mediaInfo(file) {
  const match = file.name.match(/-(\d+)-(\d+)\.m4s$/i);
  if (!match) return null;
  return { part: Number(match[1]), quality: Number(match[2]) };
}

async function onFilesChosen(event) {
  const files = Array.from(event.target.files || []);
  event.target.value = '';
  if (!files.length) return;

  const media = files
    .filter((file) => /\.m4s$/i.test(file.name))
    .map((file) => ({ file, ...(mediaInfo(file) || {}) }));
  const audio = media
    .filter((item) => item.quality >= 30200 && item.quality < 30300)
    .sort((a, b) => b.file.size - a.file.size)[0];
  const video = media
    .filter((item) => !(item.quality >= 30200 && item.quality < 30300))
    .sort((a, b) => b.file.size - a.file.size)[0];

  if (!audio || !video) {
    uploadPhase.value = 'error';
    uploadError.value = '需要同时选择视频轨和音频轨两个 .m4s 文件。音频轨通常是 -30280.m4s。';
    return;
  }

  const folders = new Set(
    media
      .map((item) => item.file.webkitRelativePath)
      .filter(Boolean)
      .map((path) => path.split('/').slice(0, -1).join('/')),
  );
  if (folders.size > 1) {
    uploadPhase.value = 'error';
    uploadError.value = '一次只能导入一讲。请选择单个缓存文件夹，或手动选中同一讲的视频轨和音频轨。';
    return;
  }

  const metaFile = files.find((file) => /^(videoInfo\.json|\.videoInfo)$/i.test(file.name));
  let meta = null;
  if (metaFile) {
    try {
      meta = JSON.parse(await metaFile.text());
    } catch {
      meta = null;
    }
  }

  const relative = video.file.webkitRelativePath || audio.file.webkitRelativePath || '';
  const folderName = relative.split('/')[0] || '';
  selected.value = { video: video.file, audio: audio.file, meta };
  title.value =
    String(meta?.title || '').trim() ||
    folderName ||
    video.file.name.replace(/-\d+-\d+\.m4s$/i, '');
  uploadPhase.value = 'ready';
  uploadError.value = '';
  uploadProgress.value = 0;
  uploadMessage.value = '';
}

function uploadRaw(file, url, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', url);
    xhr.setRequestHeader('Content-Type', 'application/octet-stream');
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onerror = () => reject(new Error('上传失败，请确认本地服务仍在运行'));
    xhr.onload = () => {
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data);
        return;
      }
      const error = new Error(data.error || `上传失败（${xhr.status}）`);
      error.code = data.code;
      reject(error);
    };
    xhr.send(file);
  });
}

async function startImport() {
  if (!selected.value || isUploading.value) return;
  const { video, audio, meta } = selected.value;
  uploadPhase.value = 'uploading';
  uploadProgress.value = 1;
  uploadError.value = '';

  try {
    const startResponse = await fetch('/api/bilibili/import/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        title: title.value.trim() || 'B 站缓存课程',
        groupTitle: meta?.groupTitle || '',
        uname: meta?.uname || '',
        bvid: meta?.bvid || meta?.groupId || '',
        p: meta?.p || 1,
        duration: meta?.duration || 0,
      }),
    });
    const start = await startResponse.json();
    if (!startResponse.ok || !start.importId) {
      throw new Error(start.error || '无法创建导入任务');
    }

    uploadMessage.value = '正在上传视频轨 1/2…';
    await uploadRaw(video, start.slots.video, (ratio) => {
      uploadProgress.value = Math.round(ratio * 58);
      uploadMessage.value = `正在上传视频轨 1/2 · ${uploadProgress.value}%`;
    });

    uploadMessage.value = '正在上传音频轨 2/2…';
    await uploadRaw(audio, start.slots.audio, (ratio) => {
      uploadProgress.value = 58 + Math.round(ratio * 37);
      uploadMessage.value = `正在上传音频轨 2/2 · ${uploadProgress.value}%`;
    });

    uploadPhase.value = 'remuxing';
    uploadProgress.value = 97;
    uploadMessage.value = '正在合并音视频，马上就好…';

    const completeResponse = await fetch(
      `/api/bilibili/import/${encodeURIComponent(start.importId)}/complete`,
      { method: 'POST' },
    );
    const result = await completeResponse.json();
    if (!completeResponse.ok) {
      throw new Error(result.error || '整理缓存视频失败');
    }

    uploadPhase.value = 'done';
    uploadProgress.value = 100;
    uploadMessage.value = '缓存视频已就绪，正在打开…';
    emit('open-course', result);
  } catch (error) {
    uploadPhase.value = 'error';
    uploadError.value = error.message || '导入失败';
  }
}

async function openItem(item) {
  if (busyId.value) return;
  busyId.value = item.id;
  libraryError.value = '';
  try {
    const response = await fetch(`/api/bilibili/${encodeURIComponent(item.id)}/open`, {
      method: 'POST',
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '打开缓存视频失败');
    emit('open-course', data);
  } catch (error) {
    libraryError.value = error.message || '打开缓存视频失败';
  } finally {
    busyId.value = '';
  }
}
</script>

<template>
  <Teleport to="body">
    <Transition name="bili">
      <div
        v-if="open"
        class="fixed inset-0 z-[95] flex items-center justify-center bg-ink/45 p-4 backdrop-blur-[3px]"
        @mousedown.self="tryClose"
      >
        <div
          class="animate-dialog-in flex max-h-[88vh] w-full max-w-[700px] flex-col overflow-hidden rounded-2xl border border-line bg-surface-strong shadow-lift"
          role="dialog"
          aria-modal="true"
          aria-label="导入 B 站缓存课程"
        >
          <div class="flex items-start gap-3 border-b border-line/75 px-5 py-4">
            <div class="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine text-surface-strong shadow-sm">
              <Database :size="19" :stroke-width="1.8" />
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h2 class="text-[15px] font-semibold tracking-tight text-ink">B 站缓存课程</h2>
                <span class="rounded-full border border-clay/20 bg-clay-soft/70 px-2 py-0.5 text-[8.5px] font-semibold uppercase tracking-[0.12em] text-clay">
                  Local
                </span>
              </div>
              <p class="mt-0.5 text-[10.5px] text-faint">
                导入已缓存的视频，自动合并音视频并在本机转写
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

          <div class="min-h-0 flex-1 overflow-y-auto px-5 py-4">
            <!-- Upload -->
            <section class="rounded-xl border border-dashed border-line-strong/70 bg-paper/45 px-4 py-4">
              <div v-if="uploadPhase === 'idle' || uploadPhase === 'error'" class="text-center">
                <div class="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-surface-strong text-pine shadow-sm">
                  <UploadCloud :size="20" :stroke-width="1.7" />
                </div>
                <p class="mt-2.5 text-[12.5px] font-semibold text-ink">上传 B 站缓存文件</p>
                <p class="mt-1 text-[10.5px] leading-5 text-muted">
                  选择某一讲的缓存文件夹，或手动选中视频轨与音频轨两个 <code class="font-mono text-[10px]">.m4s</code>。
                </p>
                <div class="mt-3 flex flex-wrap items-center justify-center gap-2">
                  <button type="button" class="bili-primary" @click="chooseFolder">
                    <FolderOpen :size="13" />
                    选择缓存文件夹
                  </button>
                  <button type="button" class="bili-secondary" @click="chooseFiles">
                    <FileVideo2 :size="13" />
                    选择 .m4s 文件
                  </button>
                </div>
                <p v-if="uploadError" class="mx-auto mt-3 max-w-[420px] rounded-lg bg-clay-soft/70 px-3 py-2 text-[10.5px] leading-5 text-clay">
                  {{ uploadError }}
                </p>
              </div>

              <div v-else-if="uploadPhase === 'ready'" class="text-left">
                <div class="flex items-start gap-2.5">
                  <div class="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-pine-soft text-pine">
                    <CheckCircle2 :size="18" />
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="text-[12px] font-semibold text-ink">已找到音视频轨</p>
                    <div class="mt-2 grid gap-1.5 text-[10.5px] text-muted sm:grid-cols-2">
                      <p class="flex items-center gap-1.5 truncate">
                        <FileVideo2 :size="11" class="shrink-0 text-faint" />
                        <span class="truncate">{{ selected?.video.name }}</span>
                        <span class="shrink-0 text-faint">{{ formatSize(selected?.video.size) }}</span>
                      </p>
                      <p class="flex items-center gap-1.5 truncate">
                        <Music2 :size="11" class="shrink-0 text-faint" />
                        <span class="truncate">{{ selected?.audio.name }}</span>
                        <span class="shrink-0 text-faint">{{ formatSize(selected?.audio.size) }}</span>
                      </p>
                    </div>
                  </div>
                </div>
                <label class="mt-3 block">
                  <span class="mb-1 block text-[9.5px] font-medium text-faint">课程标题</span>
                  <input
                    v-model="title"
                    type="text"
                    maxlength="120"
                    class="focus-ring w-full rounded-lg border border-line bg-surface-strong px-3 py-2 text-[11.5px] text-ink outline-none"
                    placeholder="例如：1.1 行列式的概念"
                  />
                </label>
                <div class="mt-3 flex items-center justify-end gap-2">
                  <button type="button" class="bili-secondary" @click="resetUpload">重新选择</button>
                  <button type="button" class="bili-primary" :disabled="isUploading" @click="startImport">
                    <UploadCloud :size="13" />
                    开始导入
                  </button>
                </div>
              </div>

              <div v-else class="text-left">
                <div class="flex items-center justify-between gap-3">
                  <p class="text-[11.5px] font-medium text-ink-soft">{{ uploadMessage }}</p>
                  <span class="font-mono text-[12px] tabular-nums text-pine">{{ uploadProgress }}%</span>
                </div>
                <div class="mt-2 h-1.5 overflow-hidden rounded-full bg-paper-deep">
                  <div
                    class="h-full rounded-full bg-gradient-to-r from-pine to-pine-2 transition-[width] duration-300"
                    :style="{ width: `${Math.max(3, uploadProgress)}%` }"
                  ></div>
                </div>
                <p v-if="uploadPhase === 'done'" class="mt-2 flex items-center gap-1.5 text-[10px] text-moss">
                  <CheckCircle2 :size="11" />
                  已完成，正在打开课程
                </p>
              </div>
            </section>

            <!-- Library -->
            <section class="mt-4">
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2">
                  <h3 class="text-[11px] font-semibold uppercase tracking-[0.14em] text-faint">本机缓存</h3>
                  <span v-if="library.items.length" class="rounded-full bg-paper px-2 py-0.5 font-mono text-[9px] text-muted">
                    {{ library.items.length }}
                  </span>
                </div>
                <button
                  type="button"
                  class="focus-ring inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[9.5px] text-faint transition hover:bg-paper hover:text-ink"
                  :disabled="loading"
                  @click="loadLibrary(true)"
                >
                  <RefreshCw :size="10" :class="{ 'animate-spin': loading }" />
                  重新扫描
                </button>
              </div>

              <p v-if="libraryError" class="mt-2 rounded-lg bg-clay-soft/60 px-3 py-2 text-[10.5px] leading-5 text-clay">
                {{ libraryError }}
              </p>

              <div v-if="loading && !library.items.length" class="mt-3 space-y-2">
                <div v-for="index in 2" :key="index" class="h-[62px] animate-pulse rounded-xl bg-paper/70"></div>
              </div>

              <div
                v-else-if="!library.items.length"
                class="mt-3 rounded-xl border border-line/60 bg-paper/35 px-4 py-5 text-center"
              >
                <p class="text-[11px] text-muted">还没有可用的缓存课程</p>
                <p class="mt-1 text-[9.5px] leading-5 text-faint">
                  可以直接上传缓存文件夹；也可以把缓存放在
                  <code class="font-mono">Videos/bilibili</code> 后点重新扫描。
                </p>
              </div>

              <div v-else class="mt-2 max-h-[250px] space-y-1.5 overflow-y-auto pr-0.5">
                <button
                  v-for="item in library.items"
                  :key="item.id"
                  type="button"
                  class="group flex w-full items-center gap-3 rounded-xl border border-line/60 bg-surface-strong px-2.5 py-2 text-left transition hover:border-pine/25 hover:bg-paper/55 disabled:opacity-60"
                  :disabled="Boolean(busyId)"
                  @click="openItem(item)"
                >
                  <div class="relative h-10 w-[68px] shrink-0 overflow-hidden rounded-md bg-pine-soft">
                    <img
                      v-if="item.coverUrl"
                      :src="item.coverUrl"
                      alt=""
                      class="h-full w-full object-cover"
                      loading="lazy"
                    />
                    <div v-else class="flex h-full w-full items-center justify-center text-pine/50">
                      <FileVideo2 :size="17" />
                    </div>
                  </div>
                  <div class="min-w-0 flex-1">
                    <p class="truncate text-[11.5px] font-medium text-ink">{{ item.title }}</p>
                    <p class="mt-0.5 flex items-center gap-1.5 truncate text-[9.5px] text-faint">
                      <span class="shrink-0 rounded px-1 py-px" :class="item.source === 'upload' ? 'bg-moss-soft text-moss' : 'bg-paper-deep text-muted'">
                        {{ item.source === 'upload' ? '已上传' : '本机缓存' }}
                      </span>
                      <span v-if="item.groupTitle" class="truncate">{{ item.groupTitle }}</span>
                      <span class="inline-flex shrink-0 items-center gap-0.5">
                        <Clock3 :size="8" />
                        {{ formatTime(item.duration) }}
                      </span>
                    </p>
                  </div>
                  <Loader2 v-if="busyId === item.id" :size="14" class="shrink-0 animate-spin text-pine" />
                  <ChevronRight v-else :size="14" class="shrink-0 text-faint transition group-hover:translate-x-0.5 group-hover:text-pine" />
                </button>
              </div>
            </section>
          </div>

          <div class="flex items-center justify-between gap-3 border-t border-line/70 bg-paper/35 px-5 py-2.5">
            <p class="flex items-center gap-1.5 text-[9px] text-faint">
              <Database :size="9" />
              缓存文件只在你的电脑上合并、转写，不会上传到云端
            </p>
            <p class="hidden text-[9px] text-faint sm:block">
              支持 B 站桌面端缓存格式
            </p>
          </div>
        </div>

        <input
          ref="folderInput"
          type="file"
          webkitdirectory
          multiple
          class="hidden"
          @change="onFilesChosen"
        />
        <input
          ref="filesInput"
          type="file"
          accept=".m4s"
          multiple
          class="hidden"
          @change="onFilesChosen"
        />
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.bili-primary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 8px;
  background: var(--color-pine);
  padding: 7px 12px;
  font-size: 10.5px;
  font-weight: 600;
  color: var(--color-surface-strong);
  transition: background 150ms ease, opacity 150ms ease;
}
.bili-primary:hover:not(:disabled) {
  background: var(--color-pine-2);
}
.bili-primary:disabled {
  opacity: 0.55;
}
.bili-secondary {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border: 1px solid var(--color-line-strong);
  border-radius: 8px;
  background: var(--color-surface-strong);
  padding: 6px 11px;
  font-size: 10.5px;
  font-weight: 500;
  color: var(--color-ink-soft);
  transition: background 150ms ease, border-color 150ms ease;
}
.bili-secondary:hover {
  border-color: var(--color-pine);
  background: var(--color-paper);
}
.bili-enter-active,
.bili-leave-active {
  transition: opacity 180ms ease;
}
.bili-enter-from,
.bili-leave-to {
  opacity: 0;
}
</style>
