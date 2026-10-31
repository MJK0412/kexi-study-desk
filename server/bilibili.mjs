import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const BILIBILI_ROOT =
  process.env.KEXI_BILIBILI_ROOT || path.join(os.homedir(), 'Videos', 'bilibili');
export const BILIBILI_CACHE_DIR = path.join(__dirname, 'bilibili-cache');
const TMP_DIR = path.join(__dirname, 'tmp');
const REMUX_SCRIPT = path.join(__dirname, 'bilibili_remux.py');
const CACHE_SECONDS = 3;
const IMPORT_MANIFEST = /^up-[a-f0-9-]+\.json$/;

const remuxJobs = new Map();
let scanCache = null;
let scanAt = 0;

async function loadBilibiliItems({ force = false } = {}) {
  if (!force && scanCache && Date.now() - scanAt < CACHE_SECONDS * 1000) return scanCache;

  const imported = await loadImportedItems();
  let cached = [];
  const rootExists = fs.existsSync(BILIBILI_ROOT);
  if (rootExists) {
    const dirs = await findMetadataFiles(BILIBILI_ROOT);
    for (const dir of dirs) {
      const meta =
        (await readJson(path.join(dir, 'videoInfo.json'))) ??
        (await readJson(path.join(dir, '.videoInfo')));
      if (!meta || typeof meta !== 'object') continue;
      const item = await buildItem(dir, meta);
      if (item) cached.push(item);
    }
  }

  const seen = new Set();
  const items = [];
  for (const item of [...imported, ...cached]) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    items.push({ ...item, source: item.source || 'cache' });
  }
  items.sort((a, b) => b.cachedAt - a.cachedAt);

  scanCache = {
    available: rootExists || imported.length > 0,
    root: BILIBILI_ROOT,
    items,
    error: !rootExists && !imported.length ? '没有找到 B 站缓存目录，也可以直接上传缓存文件' : '',
  };
  scanAt = Date.now();
  return scanCache;
}

export class BilibiliError extends Error {
  constructor(message, code = 'BILIBILI_ERROR', status = 500) {
    super(message);
    this.name = 'BilibiliError';
    this.code = code;
    this.status = status;
  }
}

function pythonPath() {
  if (process.env.KEXI_PYTHON && fs.existsSync(process.env.KEXI_PYTHON)) {
    return process.env.KEXI_PYTHON;
  }
  const candidates =
    process.platform === 'win32'
      ? [
          path.join(__dirname, '.venv', 'Scripts', 'python.exe'),
          path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe'),
        ]
      : [path.join(__dirname, '.venv', 'bin', 'python'), path.join(__dirname, '..', '.venv', 'bin', 'python')];
  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

function isInside(parent, candidate) {
  const relative = path.relative(parent, candidate);
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

async function readJson(file) {
  try {
    return JSON.parse(await fsp.readFile(file, 'utf8'));
  } catch {
    return null;
  }
}

async function loadImportedItems() {
  const entries = await fsp.readdir(BILIBILI_CACHE_DIR).catch(() => []);
  const items = [];
  for (const name of entries) {
    if (!IMPORT_MANIFEST.test(name)) continue;
    const manifest = await readJson(path.join(BILIBILI_CACHE_DIR, name));
    if (!manifest?.id || !manifest.videoPath || !manifest.audioPath) continue;
    if (!fs.existsSync(manifest.videoPath) || !fs.existsSync(manifest.audioPath)) continue;
    items.push({
      ...manifest,
      source: 'upload',
      coverPath: '',
      dir: BILIBILI_CACHE_DIR,
    });
  }
  return items;
}

async function findMetadataFiles(dir, depth = 0, found = []) {
  let entries;
  try {
    entries = await fsp.readdir(dir, { withFileTypes: true });
  } catch {
    return found;
  }
  if (entries.some((entry) => entry.isFile() && /^(videoInfo\.json|\.videoInfo)$/.test(entry.name))) {
    found.push(dir);
    return found;
  }
  if (depth >= 2) return found;
  for (const entry of entries) {
    if (entry.isDirectory() && !entry.name.startsWith('.')) {
      await findMetadataFiles(path.join(dir, entry.name), depth + 1, found);
    }
  }
  return found;
}

function mediaFileInfo(fileName) {
  const match = fileName.match(/-(\d+)-(\d+)\.m4s$/i);
  if (!match) return null;
  return { part: Number(match[1]), quality: Number(match[2]) };
}

async function buildItem(dir, meta) {
  const files = await fsp.readdir(dir).catch(() => []);
  const media = [];
  for (const name of files) {
    if (!name.toLowerCase().endsWith('.m4s')) continue;
    const info = mediaFileInfo(name);
    if (!info) continue;
    const filePath = path.join(dir, name);
    const stat = await fsp.stat(filePath).catch(() => null);
    if (!stat || !stat.isFile() || stat.size < 1024) continue;
    media.push({ ...info, name, path: filePath, size: stat.size, mtime: stat.mtimeMs });
  }

  const audioFiles = media.filter((item) => item.quality >= 30200 && item.quality < 30300);
  const videoFiles = media.filter((item) => !audioFiles.includes(item));
  if (!audioFiles.length || !videoFiles.length) return null;

  const preferredQuality = 30000 + (Number(meta.qn) || 0);
  const video =
    videoFiles.find((item) => item.quality === preferredQuality) ??
    videoFiles.sort((a, b) => b.size - a.size)[0];
  const audio = audioFiles.sort((a, b) => b.size - a.size)[0];

  const id = String(meta.itemId || meta.cid || path.basename(dir));
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(id)) return null;

  let coverPath = '';
  const candidates = [meta.coverPath, path.join(dir, 'image.jpg'), path.join(dir, 'cover.jpg')].filter(Boolean);
  for (const candidate of candidates) {
    if (typeof candidate !== 'string') continue;
    const absolute = path.resolve(candidate);
    if (isInside(BILIBILI_ROOT, absolute) && fs.existsSync(absolute)) {
      coverPath = absolute;
      break;
    }
  }

  return {
    id,
    title: String(meta.title || meta.tabName || `缓存视频 ${id}`),
    groupTitle: String(meta.groupTitle || ''),
    uname: String(meta.uname || ''),
    bvid: String(meta.bvid || meta.groupId || ''),
    p: Number(meta.p) || 1,
    duration: Number(meta.duration) || 0,
    totalSize: Number(meta.totalSize) || video.size + audio.size,
    cachedAt: Math.max(video.mtime, audio.mtime),
    coverPath,
    dir,
    videoPath: video.path,
    audioPath: audio.path,
  };
}

function publicItem(item) {
  return {
    id: item.id,
    title: item.title,
    groupTitle: item.groupTitle,
    uname: item.uname,
    bvid: item.bvid,
    p: item.p,
    duration: item.duration,
    totalSize: item.totalSize,
    cachedAt: item.cachedAt,
    source: item.source || 'cache',
    coverUrl: item.coverPath ? `/api/bilibili/${encodeURIComponent(item.id)}/cover` : '',
  };
}

export async function scanBilibiliLibrary(options = {}) {
  const library = await loadBilibiliItems(options);
  return {
    ...library,
    items: library.items.map(publicItem),
  };
}

export async function findBilibiliItem(id) {
  const library = await loadBilibiliItems({ force: true });
  return library.items.find((item) => item.id === String(id)) ?? null;
}

export function bilibiliCoverPath(item) {
  return item.coverPath || '';
}

export function publicBilibiliItem(item) {
  return publicItem(item);
}

export async function registerImportedItem(item) {
  await fsp.mkdir(BILIBILI_CACHE_DIR, { recursive: true });
  const manifest = {
    id: item.id,
    title: item.title,
    groupTitle: item.groupTitle || '',
    uname: item.uname || '',
    bvid: item.bvid || '',
    p: Number(item.p) || 1,
    duration: Number(item.duration) || 0,
    totalSize: Number(item.totalSize) || 0,
    cachedAt: Date.now(),
    source: 'upload',
    videoPath: item.videoPath,
    audioPath: item.audioPath,
  };
  await fsp.writeFile(
    path.join(BILIBILI_CACHE_DIR, `${item.id}.json`),
    JSON.stringify(manifest, null, 2),
    'utf8',
  );
  scanAt = 0;
  return { ...manifest, coverPath: '', dir: BILIBILI_CACHE_DIR, source: 'upload' };
}

function cachePathFor(id) {
  return path.join(BILIBILI_CACHE_DIR, `${id}.mp4`);
}

export async function ensureBilibiliRemux(item) {
  const output = cachePathFor(item.id);
  const existing = await fsp.stat(output).catch(() => null);
  if (existing?.isFile() && existing.size > 1024) {
    return { output, duration: Number(item.duration) || 0 };
  }

  if (remuxJobs.has(item.id)) return remuxJobs.get(item.id);

  const python = pythonPath();
  if (!python) {
    throw new BilibiliError('本地视频处理环境未安装，请运行 npm run setup:asr', 'PYTHON_MISSING', 503);
  }

  const job = (async () => {
    await fsp.mkdir(BILIBILI_CACHE_DIR, { recursive: true });
    await fsp.mkdir(TMP_DIR, { recursive: true });

    let duration = Number(item.duration) || 0;
    await new Promise((resolve, reject) => {
      const child = spawn(
        python,
        [
          REMUX_SCRIPT,
          '--video',
          item.videoPath,
          '--audio',
          item.audioPath,
          '--output',
          output,
        ],
        {
          cwd: __dirname,
          windowsHide: true,
          env: {
            ...process.env,
            PYTHONIOENCODING: 'utf-8',
            PYTHONUNBUFFERED: '1',
            PYTHONPATH: path.join(__dirname, 'pyfix'),
            TMP: TMP_DIR,
            TEMP: TMP_DIR,
          },
        },
      );
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (chunk) => {
        stdout = `${stdout}${chunk.toString('utf8')}`.slice(-4000);
      });
      child.stderr.on('data', (chunk) => {
        stderr = `${stderr}${chunk.toString('utf8')}`.slice(-6000);
      });
      child.on('error', reject);
      child.on('close', (code) => {
        if (code === 0) {
          const line = stdout.trim().split('\n').filter(Boolean).pop();
          try {
            const result = JSON.parse(line);
            if (Number(result.duration) > 0) duration = Number(result.duration);
          } catch {
            /* duration is optional */
          }
          resolve();
          return;
        }
        const message = stderr.trim().split('\n').slice(-3).join(' ') || `整理进程退出（${code}）`;
        reject(new BilibiliError(`缓存视频整理失败：${message}`, 'REMUX_FAILED', 500));
      });
    });

    const stat = await fsp.stat(output).catch(() => null);
    if (!stat || stat.size < 1024) {
      throw new BilibiliError('缓存视频整理后为空，文件可能没有下载完整', 'REMUX_EMPTY', 500);
    }
    return { output, duration };
  })();

  remuxJobs.set(item.id, job);
  try {
    return await job;
  } finally {
    remuxJobs.delete(item.id);
  }
}

export async function sendBilibiliVideo(req, res, filePath) {
  const stat = await fsp.stat(filePath).catch(() => null);
  if (!stat?.isFile()) {
    throw new BilibiliError('缓存视频文件不存在', 'VIDEO_NOT_FOUND', 404);
  }

  const range = req.headers.range;
  if (range) {
    const match = range.match(/bytes=(\d*)-(\d*)/);
    if (!match) {
      res.writeHead(416, { 'content-range': `bytes */${stat.size}` }).end();
      return;
    }
    const start = match[1] ? Number(match[1]) : 0;
    const end = match[2] ? Math.min(Number(match[2]), stat.size - 1) : stat.size - 1;
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'content-range': `bytes */${stat.size}` }).end();
      return;
    }
    res.writeHead(206, {
      'content-type': 'video/mp4',
      'content-length': end - start + 1,
      'content-range': `bytes ${start}-${end}/${stat.size}`,
      'accept-ranges': 'bytes',
      'cache-control': 'private, max-age=3600',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath, { start, end }).pipe(res);
    return;
  }

  res.writeHead(200, {
    'content-type': 'video/mp4',
    'content-length': stat.size,
    'accept-ranges': 'bytes',
    'cache-control': 'private, max-age=3600',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  fs.createReadStream(filePath).pipe(res);
}

export { cachePathFor };
