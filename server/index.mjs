import http from 'node:http';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawn, spawnSync } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';
import {
  ArchiveError,
  archiveCourse,
  archiveStatus,
  openArchiveFolder,
} from './archive.mjs';
import {
  BilibiliError,
  BILIBILI_CACHE_DIR,
  BILIBILI_ROOT,
  ensureBilibiliRemux,
  findBilibiliItem,
  publicBilibiliItem,
  registerImportedItem,
  scanBilibiliLibrary,
  sendBilibiliVideo,
} from './bilibili.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const TMP_DIR = path.join(__dirname, 'tmp');
const MODEL_DIR = path.join(__dirname, 'models');
const IS_DEV = process.argv.includes('--dev');
const OPEN_BROWSER = !process.argv.includes('--no-open');
const PORT = Number(process.env.PORT) || 5173;
const HOST = '127.0.0.1';
const MAX_UPLOAD_BYTES = 12 * 1024 * 1024 * 1024;

const jobs = new Map();
const importDrafts = new Map();
let vite = null;
let asrRuntime = null;

function pythonPath() {
  if (process.env.KEXI_PYTHON && fs.existsSync(process.env.KEXI_PYTHON)) {
    return process.env.KEXI_PYTHON;
  }
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(__dirname, '.venv', 'Scripts', 'python.exe'),
          path.join(ROOT, '.venv', 'Scripts', 'python.exe'),
        ]
      : [path.join(__dirname, '.venv', 'bin', 'python'), path.join(ROOT, '.venv', 'bin', 'python')];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function probeAsrRuntime() {
  const python = pythonPath();
  if (!python) {
    return {
      ready: false,
      code: 'PYTHON_MISSING',
      message: '未找到本地转写运行环境，请运行 npm run setup:asr',
    };
  }
  const result = spawnSync(
    python,
    ['-c', 'import faster_whisper, av; print("ok")'],
    { encoding: 'utf8', timeout: 15000, windowsHide: true },
  );
  if (result.status !== 0) {
    return {
      ready: false,
      code: 'ASR_PACKAGES_MISSING',
      message: '本地转写依赖未安装，请运行 npm run setup:asr',
      detail: (result.stderr || '').slice(-800),
    };
  }
  return { ready: true, code: 'READY', python, model: 'small' };
}

function getAsrRuntime() {
  if (!asrRuntime) asrRuntime = probeAsrRuntime();
  return asrRuntime;
}

function json(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  });
  res.end(body);
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: Math.round(job.progress * 10) / 10,
    message: job.message,
    error: job.error,
    errorCode: job.errorCode,
    segmentCount: job.segments.length,
    lastSegment: job.lastSegment,
    duration: job.duration,
    createdAt: job.createdAt,
    ...(job.status === 'done' ? { segments: job.segments } : {}),
  };
}

function cleanupJobFile(job) {
  if (!job.filePath) return;
  if (!job.keepFile) fsp.rm(job.filePath, { force: true }).catch(() => {});
  job.filePath = null;
}

async function startTranscription(job) {
  const runtime = getAsrRuntime();
  if (!runtime.ready) {
    job.status = 'error';
    job.errorCode = runtime.code;
    job.error = runtime.message;
    cleanupJobFile(job);
    return;
  }

  job.status = 'processing';
  job.progress = 1;
  job.message = '正在启动本地语音识别…';

  const script = path.join(__dirname, 'transcribe.py');
  const child = spawn(
    runtime.python,
    [
      script,
      '--input',
      job.filePath,
      '--model',
      'small',
      '--download-root',
      MODEL_DIR,
    ],
    {
      cwd: __dirname,
      windowsHide: true,
      env: {
        ...process.env,
        PYTHONIOENCODING: 'utf-8',
        PYTHONUNBUFFERED: '1',
        PYTHONPATH: path.join(__dirname, 'pyfix'),
        HF_ENDPOINT: process.env.HF_ENDPOINT || 'https://hf-mirror.com',
        HF_HOME: path.join(__dirname, '.hf'),
        HF_HUB_DISABLE_XET: '1',
        HF_HUB_DISABLE_SYMLINKS_WARNING: '1',
      },
    },
  );

  job.child = child;
  let stdoutBuffer = '';
  let stderrTail = '';

  child.stdout.on('data', (chunk) => {
    stdoutBuffer += chunk.toString('utf8');
    let newline = stdoutBuffer.indexOf('\n');
    while (newline !== -1) {
      const line = stdoutBuffer.slice(0, newline).trim();
      stdoutBuffer = stdoutBuffer.slice(newline + 1);
      newline = stdoutBuffer.indexOf('\n');
      if (!line) continue;
      let event;
      try {
        event = JSON.parse(line);
      } catch {
        continue;
      }
      if (event.type === 'status') {
        job.progress = Math.max(job.progress, Number(event.progress) || 0);
        job.message = event.message || job.message;
      } else if (event.type === 'segment') {
        job.segments.push({ start: event.start, end: event.end, text: event.text });
        job.lastSegment = event.text;
      } else if (event.type === 'progress') {
        job.progress = Math.max(job.progress, Number(event.progress) || 0);
        job.message = event.message || job.message;
      } else if (event.type === 'error') {
        job.error = event.message || '转写失败';
        job.errorDetail = event.detail || '';
      } else if (event.type === 'done') {
        job.progress = 100;
        job.duration = event.duration || job.duration;
        if (Array.isArray(event.segments) && event.segments.length) {
          job.segments = event.segments;
        }
        job.message = `识别完成，共 ${job.segments.length} 条字幕`;
        job.done = true;
      }
    }
  });

  child.stderr.on('data', (chunk) => {
    stderrTail = `${stderrTail}${chunk.toString('utf8')}`.slice(-6000);
    if (/download|fetch|%\|/i.test(chunk.toString('utf8'))) {
      job.message = '首次使用正在下载语音模型，请保持网络连接…';
    }
  });

  child.on('error', (error) => {
    job.status = 'error';
    job.errorCode = 'ASR_START_FAILED';
    job.error = `无法启动本地转写进程：${error.message}`;
    cleanupJobFile(job);
  });

  child.on('close', (code) => {
    job.child = null;
    if (job.status === 'canceled') {
      cleanupJobFile(job);
      return;
    }
    if (job.done && code === 0) {
      job.status = 'done';
      job.progress = 100;
      cleanupJobFile(job);
      return;
    }
    job.status = 'error';
    job.errorCode = job.errorCode || 'ASR_FAILED';
    job.error =
      job.error ||
      (stderrTail.trim()
        ? `转写进程退出（${code}）：${stderrTail.trim().split('\n').slice(-3).join(' ')}`
        : `转写进程退出（${code}）`);
    cleanupJobFile(job);
  });
}

async function handleTranscribeUpload(req, res) {
  const runtime = getAsrRuntime();
  if (!runtime.ready) {
    json(res, 503, { error: runtime.message, code: runtime.code });
    return;
  }

  const rawName = req.headers['x-file-name'];
  let fileName = 'course-video.mp4';
  try {
    fileName = rawName ? decodeURIComponent(String(rawName)) : fileName;
  } catch {
    /* keep fallback */
  }
  const extension = path.extname(fileName).toLowerCase().slice(0, 8) || '.mp4';
  const allowedExtensions = new Set(['.mp4', '.webm', '.mov', '.m4v', '.mkv', '.ogv']);
  if (!allowedExtensions.has(extension)) {
    json(res, 400, { error: '不支持的视频格式', code: 'UNSUPPORTED_VIDEO' });
    return;
  }

  const length = Number(req.headers['content-length']) || 0;
  if (length > MAX_UPLOAD_BYTES) {
    json(res, 413, { error: '视频文件超过 12GB 上限', code: 'FILE_TOO_LARGE' });
    return;
  }

  const id = randomUUID();
  const filePath = path.join(TMP_DIR, `${id}${extension}`);
  const job = {
    id,
    status: 'uploading',
    progress: 0,
    message: '正在读取视频…',
    segments: [],
    lastSegment: '',
    duration: 0,
    error: '',
    errorCode: '',
    createdAt: Date.now(),
    filePath,
    child: null,
    done: false,
  };
  jobs.set(id, job);

  try {
    await pipeline(req, fs.createWriteStream(filePath));
    const stat = await fsp.stat(filePath);
    if (!stat.size) throw new Error('上传的视频为空');
    json(res, 202, { jobId: id, size: stat.size });
    startTranscription(job);
  } catch (error) {
    job.status = 'error';
    job.error = `接收视频失败：${error.message}`;
    job.errorCode = 'UPLOAD_FAILED';
    cleanupJobFile(job);
    if (!res.headersSent) json(res, 500, { error: job.error, code: job.errorCode });
  }
}

function cancelJob(job) {
  if (!job) return false;
  job.status = 'canceled';
  job.message = '已取消转写';
  job.child?.kill();
  cleanupJobFile(job);
  return true;
}

function readJsonBody(req, limit = 1024 * 1024) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > limit) {
        reject(new BilibiliError('请求内容过大', 'BODY_TOO_LARGE', 413));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new BilibiliError('请求格式不正确', 'BAD_JSON', 400));
      }
    });
    req.on('error', reject);
  });
}

async function receiveRawFile(req, destination) {
  const length = Number(req.headers['content-length']) || 0;
  if (length > MAX_UPLOAD_BYTES) {
    throw new BilibiliError('单个文件超过 12GB 上限', 'FILE_TOO_LARGE', 413);
  }
  await pipeline(req, fs.createWriteStream(destination));
  const stat = await fsp.stat(destination).catch(() => null);
  if (!stat?.isFile() || stat.size < 1024) {
    await fsp.rm(destination, { force: true }).catch(() => {});
    throw new BilibiliError('上传的文件为空或过小', 'EMPTY_UPLOAD', 400);
  }
  return stat;
}

function importDraft(id) {
  const draft = importDrafts.get(id);
  if (!draft) {
    throw new BilibiliError('导入任务不存在或已过期，请重新选择文件', 'IMPORT_NOT_FOUND', 404);
  }
  return draft;
}

async function startBilibiliImport(body) {
  const title = String(body.title || '').trim().slice(0, 120);
  const id = `up-${randomUUID()}`;
  const videoPath = path.join(BILIBILI_CACHE_DIR, `${id}.video.m4s`);
  const audioPath = path.join(BILIBILI_CACHE_DIR, `${id}.audio.m4s`);
  await fsp.mkdir(BILIBILI_CACHE_DIR, { recursive: true });
  importDrafts.set(id, {
    id,
    title: title || 'B 站缓存课程',
    groupTitle: String(body.groupTitle || '').slice(0, 120),
    uname: String(body.uname || '').slice(0, 80),
    bvid: String(body.bvid || '').slice(0, 40),
    p: Number(body.p) || 1,
    duration: Number(body.duration) || 0,
    totalSize: 0,
    videoPath,
    audioPath,
    videoUploaded: false,
    audioUploaded: false,
  });
  return { importId: id, slots: { video: `/api/bilibili/import/${id}/video`, audio: `/api/bilibili/import/${id}/audio` } };
}

async function handleBilibiliImport(req, res, url) {
  if (req.method === 'POST' && url.pathname === '/api/bilibili/import/start') {
    const body = await readJsonBody(req);
    json(res, 201, await startBilibiliImport(body));
    return true;
  }

  const match = url.pathname.match(/^\/api\/bilibili\/import\/(up-[a-f0-9-]+)\/(video|audio|complete)$/i);
  if (!match) return false;
  const draft = importDraft(match[1]);
  const action = match[2].toLowerCase();

  if (req.method === 'POST' && (action === 'video' || action === 'audio')) {
    const destination = action === 'video' ? draft.videoPath : draft.audioPath;
    const stat = await receiveRawFile(req, destination);
    draft[`${action}Uploaded`] = true;
    draft.totalSize += stat.size;
    json(res, 200, { ok: true, slot: action, size: stat.size });
    return true;
  }

  if (req.method === 'POST' && action === 'complete') {
    if (!draft.videoUploaded || !draft.audioUploaded) {
      throw new BilibiliError('视频轨和音频轨都需要上传后才能完成导入', 'IMPORT_INCOMPLETE', 400);
    }
    const item = await registerImportedItem(draft);
    importDrafts.delete(draft.id);
    const remux = await ensureBilibiliRemux(item);
    if (remux.duration && Math.abs(remux.duration - item.duration) > 1) {
      await registerImportedItem({ ...item, duration: remux.duration });
    }
    json(res, 200, {
      item: publicBilibiliItem({ ...item, duration: remux.duration || item.duration }),
      duration: remux.duration || item.duration,
      videoUrl: `/api/bilibili/${encodeURIComponent(item.id)}/stream`,
    });
    return true;
  }

  return false;
}

async function handleBilibiliApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/bilibili/library') {
    json(res, 200, await scanBilibiliLibrary({ force: url.searchParams.get('refresh') === '1' }));
    return true;
  }

  if (await handleBilibiliImport(req, res, url)) return true;

  const coverMatch = url.pathname.match(/^\/api\/bilibili\/([A-Za-z0-9_-]+)\/cover$/);
  if (req.method === 'GET' && coverMatch) {
    const item = await findBilibiliItem(coverMatch[1]);
    if (!item?.coverPath) {
      json(res, 404, { error: '没有封面', code: 'COVER_NOT_FOUND' });
      return true;
    }
    const data = await fsp.readFile(item.coverPath).catch(() => null);
    if (!data) {
      json(res, 404, { error: '封面文件不存在', code: 'COVER_NOT_FOUND' });
      return true;
    }
    res.writeHead(200, {
      'content-type': path.extname(item.coverPath).toLowerCase() === '.png' ? 'image/png' : 'image/jpeg',
      'cache-control': 'public, max-age=86400',
    });
    res.end(data);
    return true;
  }

  const openMatch = url.pathname.match(/^\/api\/bilibili\/([A-Za-z0-9_-]+)\/(open|stream|transcribe)$/);
  if (!openMatch) return false;
  const item = await findBilibiliItem(openMatch[1]);
  if (!item) {
    json(res, 404, { error: '缓存视频不存在，请重新扫描或上传', code: 'BILIBILI_NOT_FOUND' });
    return true;
  }

  if ((req.method === 'GET' || req.method === 'HEAD') && openMatch[2] === 'stream') {
    const remux = await ensureBilibiliRemux(item);
    await sendBilibiliVideo(req, res, remux.output);
    return true;
  }

  if (req.method === 'POST' && openMatch[2] === 'open') {
    const remux = await ensureBilibiliRemux(item);
    json(res, 200, {
      item: publicBilibiliItem({ ...item, duration: remux.duration || item.duration }),
      duration: remux.duration || item.duration,
      videoUrl: `/api/bilibili/${encodeURIComponent(item.id)}/stream`,
    });
    return true;
  }

  if (req.method === 'POST' && openMatch[2] === 'transcribe') {
    const remux = await ensureBilibiliRemux(item);
    const id = randomUUID();
    const job = {
      id,
      status: 'processing',
      progress: 1,
      message: '正在加载本地识别模型…',
      segments: [],
      lastSegment: '',
      duration: remux.duration || item.duration || 0,
      error: '',
      errorCode: '',
      createdAt: Date.now(),
      filePath: remux.output,
      keepFile: true,
      child: null,
      done: false,
    };
    jobs.set(id, job);
    json(res, 202, { jobId: id, duration: job.duration });
    startTranscription(job);
    return true;
  }

  return false;
}

async function handleArchiveApi(req, res, url) {
  if (!url.pathname.startsWith('/api/archive')) return false;

  if (req.method === 'GET' && url.pathname === '/api/archive/status') {
    json(res, 200, await archiveStatus());
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/archive/course') {
    const body = await readJsonBody(req, 32 * 1024 * 1024);
    json(res, 200, await archiveCourse(body));
    return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/archive/open') {
    json(res, 200, await openArchiveFolder());
    return true;
  }

  return false;
}

async function handleApi(req, res, url) {
  if (req.method === 'GET' && url.pathname === '/api/health') {
    if (url.searchParams.get('refresh') === '1') asrRuntime = null;
    const runtime = getAsrRuntime();
    json(res, 200, {
      app: 'kexi',
      ready: runtime.ready,
      code: runtime.code,
      message: runtime.message,
      model: 'small',
      engine: 'faster-whisper',
    });
    return true;
  }

  if (url.pathname.startsWith('/api/archive')) {
    if (await handleArchiveApi(req, res, url)) return true;
  }

  if (url.pathname.startsWith('/api/bilibili')) {
    if (await handleBilibiliApi(req, res, url)) return true;
  }

  if (req.method === 'POST' && url.pathname === '/api/transcribe') {
    await handleTranscribeUpload(req, res);
    return true;
  }

  const match = url.pathname.match(/^\/api\/transcribe\/([a-f0-9-]+)(\/cancel)?$/i);
  if (match) {
    const job = jobs.get(match[1]);
    if (!job) {
      json(res, 404, { error: '转写任务不存在或已过期', code: 'JOB_NOT_FOUND' });
      return true;
    }
    if (match[2] && req.method === 'POST') {
      cancelJob(job);
      json(res, 200, publicJob(job));
      return true;
    }
    if (req.method === 'GET') {
      json(res, 200, publicJob(job));
      return true;
    }
  }

  return false;
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
  '.woff2': 'font/woff2',
};

async function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    res.writeHead(400).end('Bad request');
    return;
  }
  const relative = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
  let filePath = path.resolve(DIST, relative);
  if (!filePath.startsWith(DIST)) {
    res.writeHead(403).end('Forbidden');
    return;
  }
  try {
    const stat = await fsp.stat(filePath);
    if (stat.isDirectory()) filePath = path.join(filePath, 'index.html');
  } catch {
    filePath = path.join(DIST, 'index.html');
  }
  try {
    const data = await fsp.readFile(filePath);
    res.writeHead(200, {
      'content-type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
      'cache-control': filePath.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    res.end('前端尚未构建。请先运行 npm run build，或直接运行 npm run dev。');
  }
}

function openBrowser(url) {
  if (!OPEN_BROWSER) return;
  try {
    const command =
      process.platform === 'win32'
        ? ['cmd.exe', ['/c', 'start', '', url]]
        : process.platform === 'darwin'
          ? ['open', [url]]
          : ['xdg-open', [url]];
    const child = spawn(command[0], command[1], { detached: true, stdio: 'ignore', windowsHide: true });
    child.unref();
  } catch {
    /* Browser opening is optional. */
  }
}

async function main() {
  await fsp.mkdir(TMP_DIR, { recursive: true });
  await fsp.mkdir(MODEL_DIR, { recursive: true });
  for (const file of await fsp.readdir(TMP_DIR).catch(() => [])) {
    await fsp.rm(path.join(TMP_DIR, file), { force: true }).catch(() => {});
  }

  if (IS_DEV) {
    const { createServer } = await import('vite');
    vite = await createServer({
      root: ROOT,
      server: {
        middlewareMode: true,
        hmr: false,
        watch: {
          ignored: [
            '**/node_modules/**',
            '**/.git/**',
            '**/dist/**',
            '**/server/.venv/**',
            '**/server/models/**',
            '**/server/tmp/**',
            '**/server/.hf/**',
            '**/.edge-*/**',
            '**/.test-media/**',
            '**/.build-tmp/**',
          ],
        },
      },
      appType: 'spa',
    });
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url || '/', `http://${req.headers.host || `${HOST}:${PORT}`}`);
    try {
      if (url.pathname.startsWith('/api/')) {
        const handled = await handleApi(req, res, url);
        if (!handled) json(res, 404, { error: 'API not found' });
        return;
      }

      if (IS_DEV && vite) {
        vite.middlewares(req, res, (error) => {
          if (error) {
            console.error(error);
            if (!res.headersSent) {
              res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
              res.end('Dev server error');
            }
          }
        });
        return;
      }

      await serveStatic(req, res, url);
    } catch (error) {
      console.error('[server]', error);
      if (!res.headersSent) {
        const status =
          error instanceof BilibiliError || error instanceof ArchiveError ? error.status : 500;
        json(res, status, {
          error: status === 500 ? '服务器内部错误' : error.message,
          code: error.code || 'INTERNAL_ERROR',
        });
      }
    }
  });

  server.listen(PORT, HOST, () => {
    const url = `http://${HOST}:${PORT}`;
    console.log('');
    console.log('  课隙 · 本地切片学习台');
    console.log(`  ${url}`);
    console.log('');
    console.log('  自动转写使用本机 CPU，首次运行需要下载 small 模型。');
    console.log('  关闭此窗口即停止服务。');
    console.log('');
    openBrowser(url);
  });

  server.on('error', async (error) => {
    if (error.code === 'EADDRINUSE') {
      try {
        const response = await fetch(`http://${HOST}:${PORT}/api/health`);
        const health = await response.json();
        if (health.app === 'kexi') {
          openBrowser(`http://${HOST}:${PORT}`);
          process.exit(0);
        }
      } catch {
        /* Port is used by another application. */
      }
      console.error(`端口 ${PORT} 已被其他程序占用，请设置 PORT 环境变量后重试。`);
      process.exit(1);
    }
    console.error(error);
    process.exit(1);
  });

  const shutdown = async () => {
    for (const job of jobs.values()) {
      if (job.status === 'processing') job.child?.kill();
      cleanupJobFile(job);
    }
    await vite?.close?.();
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 1200).unref();
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
