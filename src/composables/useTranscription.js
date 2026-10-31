import { reactive } from 'vue';
import { applySubtitleItems } from '../stores/studio.js';
import { notify } from './useToast.js';

export const transcription = reactive({
  open: false,
  available: null,
  checking: false,
  phase: 'idle',
  uploadProgress: 0,
  progress: 0,
  message: '',
  lastSegment: '',
  segmentCount: 0,
  segments: [],
  duration: 0,
  error: '',
  errorCode: '',
  elapsed: 0,
  startedAt: 0,
  jobId: null,
  fileName: '',
  model: 'small',
});

let currentSource = null;
let session = 0;
let healthCheckedAt = 0;
let healthPromise = null;
let uploadXhr = null;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function checkTranscriptionService({ force = false } = {}) {
  if (healthPromise) return healthPromise;
  if (!force && healthCheckedAt && Date.now() - healthCheckedAt < 15000) {
    return transcription.available;
  }

  transcription.checking = true;
  healthPromise = (async () => {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 20000);
      const response = await fetch(`/api/health?refresh=${force ? '1' : '0'}`, {
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timeout);
      const data = await response.json();
      if (!response.ok || data.app !== 'kexi') throw new Error('本地转写服务未响应');
      transcription.available = Boolean(data.ready);
      transcription.errorCode = data.ready ? '' : data.code || 'ASR_NOT_READY';
      transcription.message = data.ready ? '' : data.message || '本地转写环境未就绪';
      transcription.model = data.model || 'small';
      healthCheckedAt = Date.now();
      return transcription.available;
    } catch {
      transcription.available = false;
      transcription.errorCode = 'SERVICE_UNAVAILABLE';
      transcription.message =
        '没有连接到本地转写服务。请双击「课隙」快捷方式启动，而不是直接打开 index.html。';
      healthCheckedAt = Date.now();
      return false;
    } finally {
      transcription.checking = false;
      healthPromise = null;
    }
  })();

  return healthPromise;
}

function resetState() {
  transcription.phase = 'idle';
  transcription.uploadProgress = 0;
  transcription.progress = 0;
  transcription.lastSegment = '';
  transcription.segmentCount = 0;
  transcription.segments = [];
  transcription.duration = 0;
  transcription.error = '';
  transcription.errorCode = '';
  transcription.elapsed = 0;
  transcription.startedAt = 0;
  transcription.jobId = null;
}

function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    uploadXhr = xhr;
    xhr.open('POST', '/api/transcribe');
    xhr.setRequestHeader('Content-Type', file.type || 'application/octet-stream');
    xhr.setRequestHeader('X-File-Name', encodeURIComponent(file.name));
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      transcription.uploadProgress = Math.min(99, Math.round((event.loaded / event.total) * 100));
      transcription.message = `正在把视频交给本地服务 ${transcription.uploadProgress}%`;
    };
    xhr.onerror = () => {
      uploadXhr = null;
      reject(new Error('上传视频失败，请确认本地服务仍在运行'));
    };
    xhr.onabort = () => {
      uploadXhr = null;
      reject(new Error('已取消上传'));
    };
    xhr.onload = () => {
      uploadXhr = null;
      let data = {};
      try {
        data = JSON.parse(xhr.responseText || '{}');
      } catch {
        /* ignore */
      }
      if (xhr.status >= 200 && xhr.status < 300 && data.jobId) {
        resolve(data);
        return;
      }
      const error = new Error(data.error || `转写服务返回错误（${xhr.status}）`);
      error.code = data.code;
      reject(error);
    };
    xhr.send(file);
  });
}

async function startBilibiliJob(source) {
  const response = await fetch(`/api/bilibili/${encodeURIComponent(source.id)}/transcribe`, {
    method: 'POST',
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.jobId) {
    const error = new Error(data.error || `缓存视频读取失败（${response.status}）`);
    error.code = data.code || 'BILIBILI_START_FAILED';
    throw error;
  }
  return data;
}

async function pollJob(jobId, activeSession) {
  let networkFailures = 0;
  while (activeSession === session) {
    await sleep(1000);
    if (activeSession !== session) return;
    transcription.elapsed = Math.floor((Date.now() - transcription.startedAt) / 1000);
    try {
      const response = await fetch(`/api/transcribe/${jobId}`, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw Object.assign(new Error(body.error || '转写任务读取失败'), { code: body.code });
      }
      const job = await response.json();
      networkFailures = 0;
      transcription.progress = Math.max(transcription.progress, job.progress || 0);
      transcription.message = job.message || transcription.message;
      transcription.lastSegment = job.lastSegment || transcription.lastSegment;
      transcription.segmentCount = job.segmentCount || transcription.segmentCount;
      transcription.duration = job.duration || transcription.duration;

      if (job.status === 'done') {
        transcription.phase = 'finalizing';
        transcription.message = '识别完成，正在生成学习切片…';
        const result = await applySubtitleItems(job.segments || [], {
          sourceName: '自动转写',
          replace: true,
          format: 'auto',
          silent: true,
        });
        if (!result.ok) {
          transcription.phase = 'error';
          transcription.error = result.error || '字幕保存失败';
          transcription.errorCode = 'SAVE_FAILED';
          return;
        }
        transcription.phase = 'done';
        transcription.progress = 100;
        transcription.segments = job.segments || [];
        transcription.segmentCount = job.segments?.length || 0;
        transcription.message = `已识别 ${transcription.segmentCount} 条字幕，生成 ${result.sliceCount} 个切片`;
        notify('自动转写完成，已生成学习切片', 'success');
        return;
      }

      if (job.status === 'error') {
        transcription.phase = 'error';
        transcription.error = job.error || '自动转写失败';
        transcription.errorCode = job.errorCode || '';
        return;
      }

      if (job.status === 'canceled') {
        transcription.phase = 'canceled';
        transcription.message = '已取消转写';
        return;
      }
    } catch (error) {
      networkFailures += 1;
      if (networkFailures >= 4) {
        transcription.phase = 'error';
        transcription.error = error.message || '与本地转写服务断开连接';
        transcription.errorCode = error.code || 'CONNECTION_LOST';
        return;
      }
    }
  }
}

export async function startTranscription(source) {
  if (!source) {
    notify('请先打开视频文件', 'error');
    return;
  }
  const bilibili = source.kind === 'bilibili';
  currentSource = source;
  session += 1;
  const activeSession = session;
  resetState();
  transcription.open = true;
  transcription.fileName = bilibili
    ? source.title || 'B 站缓存视频'
    : source.name || '本地视频';
  transcription.startedAt = Date.now();
  transcription.phase = 'checking';
  transcription.message = '正在检查本地识别环境…';

  const ready = await checkTranscriptionService({ force: true });
  if (activeSession !== session) return;
  if (!ready) {
    transcription.phase = 'unavailable';
    return;
  }

  try {
    let result;
    if (bilibili) {
      transcription.phase = 'processing';
      transcription.progress = 1;
      transcription.message = '正在整理缓存视频，随后开始识别…';
      result = await startBilibiliJob(source);
    } else {
      transcription.phase = 'uploading';
      transcription.message = '正在读取视频…';
      result = await uploadFile(source);
    }
    if (activeSession !== session) return;
    transcription.jobId = result.jobId;
    transcription.phase = 'processing';
    transcription.progress = Math.max(transcription.progress, 1);
    transcription.duration = result.duration || transcription.duration;
    transcription.message = '视频已就绪，正在加载识别模型…';
    await pollJob(result.jobId, activeSession);
  } catch (error) {
    if (activeSession !== session) return;
    transcription.phase = 'error';
    transcription.error = error.message || '无法开始转写';
    transcription.errorCode = error.code || '';
  }
}

export function closeTranscriptionDialog() {
  if (transcription.phase === 'uploading' || transcription.phase === 'processing' || transcription.phase === 'finalizing') {
    return;
  }
  transcription.open = false;
}

export async function cancelTranscription() {
  const jobId = transcription.jobId;
  session += 1;
  uploadXhr?.abort();
  uploadXhr = null;
  if (jobId) {
    fetch(`/api/transcribe/${jobId}/cancel`, { method: 'POST' }).catch(() => {});
  }
  transcription.phase = 'canceled';
  transcription.message = '已取消转写';
}

export async function retryTranscription() {
  if (!currentSource) return;
  await startTranscription(currentSource);
}

export function keepTranscriptionOpen() {
  transcription.open = true;
}
