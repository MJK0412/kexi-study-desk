import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

function defaultArchiveRoot() {
  if (process.env.KEXI_ARCHIVE_ROOT) return process.env.KEXI_ARCHIVE_ROOT;
  if (process.platform === 'win32' && existsSync('D:\\')) return 'D:\\课隙';
  return path.join(os.homedir(), 'Documents', '课隙');
}

export const ARCHIVE_ROOT = defaultArchiveRoot();

const DATA_FILE = '课程数据.json';
const OVERVIEW_FILE = '课程总览.md';
const SLICE_FILE_PATTERN = /^切片 \d{2,} · .*\.md$/;

const TAG_LABELS = {
  done: '已掌握',
  review: '待回看',
  hard: '重难点',
};

const RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i;

export class ArchiveError extends Error {
  constructor(message, status = 500, code = 'ARCHIVE_ERROR') {
    super(message);
    this.name = 'ArchiveError';
    this.status = status;
    this.code = code;
  }
}

function clock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function fileClock(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const mm = String(minutes).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return hours ? `${String(hours).padStart(2, '0')}-${mm}-${ss}` : `${mm}-${ss}`;
}

function dateLabel(timestamp) {
  return new Date(timestamp).toLocaleString('zh-CN', { hour12: false });
}

function sourceLabel(course) {
  if (course.source === 'bilibili') {
    const parts = ['B 站缓存'];
    if (course.bilibiliBvid) parts.push(course.bilibiliBvid);
    if (course.bilibiliP) parts.push(`P${course.bilibiliP}`);
    if (course.bilibiliUname) parts.push(course.bilibiliUname);
    return parts.join(' · ');
  }
  return '本地视频';
}

export function safeCourseName(name) {
  let base = String(name ?? '')
    .normalize('NFC')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/[. ]+$/g, '')
    .trim();

  if (!base) base = '未命名课程';
  if (RESERVED_NAMES.test(base)) base = `_${base}`;
  return [...base].slice(0, 80).join('') || '未命名课程';
}

async function ensureArchiveRoot() {
  try {
    await fs.mkdir(ARCHIVE_ROOT, { recursive: true });
    const stat = await fs.stat(ARCHIVE_ROOT);
    if (!stat.isDirectory()) {
      throw new Error('目标不是文件夹');
    }
  } catch (error) {
    throw new ArchiveError(
      `无法创建保存目录 ${ARCHIVE_ROOT}。请确认 D 盘可用，且当前用户有写入权限。`,
      503,
      'ARCHIVE_UNAVAILABLE',
    );
  }
}

async function readSavedCourseId(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw)?.course?.id || '';
  } catch {
    return '';
  }
}

async function exists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

async function chooseCourseDir(course) {
  const base = safeCourseName(course.name);
  for (let index = 0; index < 100; index += 1) {
    const folderName = index === 0 ? base : `${base} (${index + 1})`;
    const dir = path.join(ARCHIVE_ROOT, folderName);
    const dataPath = path.join(dir, DATA_FILE);

    if (await exists(dir)) {
      if ((await readSavedCourseId(dataPath)) === course.id) {
        return { dir, folderName };
      }
      continue;
    }

    try {
      await fs.mkdir(dir);
      return { dir, folderName };
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
  }
  throw new ArchiveError('同名课程过多，无法生成保存文件夹', 409, 'ARCHIVE_NAME_CONFLICT');
}

async function writeAtomic(filePath, content) {
  const tempPath = path.join(path.dirname(filePath), `.kexi-${randomUUID()}.tmp`);
  await fs.writeFile(tempPath, content, 'utf8');
  try {
    await fs.rename(tempPath, filePath);
  } catch (error) {
    if (error.code === 'EEXIST' || error.code === 'EPERM') {
      await fs.rm(filePath, { force: true });
      await fs.rename(tempPath, filePath);
      return;
    }
    await fs.rm(tempPath, { force: true });
    throw error;
  }
}

function normalizeSubtitles(subtitles, courseId) {
  return (Array.isArray(subtitles) ? subtitles : [])
    .map((item) => ({
      id: String(item.id || ''),
      courseId,
      start: Math.max(0, Number(item.start) || 0),
      end: Math.max(0, Number(item.end) || 0),
      text: String(item.text || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((item) => item.text && item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);
}

function normalizeSlices(slices, courseId) {
  return (Array.isArray(slices) ? slices : [])
    .map((slice) => ({
      id: String(slice.id || ''),
      courseId,
      title: String(slice.title || '未命名切片'),
      preview: String(slice.preview || ''),
      startTime: Math.max(0, Number(slice.startTime) || 0),
      endTime: Math.max(0, Number(slice.endTime) || 0),
      subtitleIds: Array.isArray(slice.subtitleIds) ? slice.subtitleIds.map(String) : [],
      tag: ['done', 'review', 'hard'].includes(slice.tag) ? slice.tag : 'review',
      note: String(slice.note || ''),
      playbackRate: Number(slice.playbackRate) || 1,
    }))
    .sort((a, b) => a.startTime - b.startTime);
}

function cuesForSlice(slice, subtitles, byId) {
  const linked = [];
  for (const id of slice.subtitleIds) {
    const cue = byId.get(id);
    if (cue) linked.push(cue);
  }
  if (linked.length) return linked;
  return subtitles.filter((cue) => cue.start < slice.endTime && cue.end > slice.startTime);
}

function sliceFileName(slice, index) {
  const tag = TAG_LABELS[slice.tag] || '待回看';
  return `切片 ${String(index + 1).padStart(2, '0')} · ${fileClock(slice.startTime)} 至 ${fileClock(slice.endTime)} · ${tag}.md`;
}

function buildSliceMarkdown(course, slice, index, cues) {
  const lines = [];
  lines.push(`# ${String(index + 1).padStart(2, '0')} · ${slice.title || '未命名切片'}`);
  lines.push('');
  lines.push(`- 课程：${course.name}`);
  lines.push(`- 时间：${clock(slice.startTime)}–${clock(slice.endTime)}`);
  lines.push(`- 标签：${TAG_LABELS[slice.tag] || '待回看'}`);
  if (slice.playbackRate !== 1) lines.push(`- 倍速：${slice.playbackRate}×`);
  lines.push('');
  lines.push('## 字幕');
  lines.push('');
  if (cues.length) {
    for (const cue of cues) {
      lines.push(`- [${clock(cue.start)}] ${cue.text}`);
    }
  } else {
    lines.push('_本段暂无字幕_');
  }
  lines.push('');
  lines.push('## 笔记');
  lines.push('');
  lines.push(slice.note.trim() || '_还没有记笔记。_');
  lines.push('');
  return lines.join('\n');
}

function buildOverviewMarkdown({ course, subtitles, slices, savedAt, sliceFiles }) {
  const lines = [];
  lines.push(`# ${course.name || '未命名课程'}`);
  lines.push('');
  lines.push('> 由「课隙」自动保存。每个切片在下方有单独的 Markdown 文件。');
  lines.push('');
  lines.push(`- 保存时间：${dateLabel(savedAt)}`);
  lines.push(`- 来源：${sourceLabel(course)}`);
  if (course.fileName) lines.push(`- 视频文件：${course.fileName}`);
  if (course.duration) lines.push(`- 视频时长：${clock(course.duration)}`);
  lines.push(`- 学习切片：${slices.length} 个`);
  lines.push(`- 字幕：${subtitles.length} 条`);
  lines.push('');

  if (!slices.length) {
    lines.push('## 暂无切片');
    lines.push('');
    lines.push('导入字幕或自动转写后，这里会出现按 60 秒切分的学习单元。');
    lines.push('');
    return lines.join('\n');
  }

  lines.push('## 切片目录');
  lines.push('');
  slices.forEach((slice, index) => {
    const tag = TAG_LABELS[slice.tag] || '待回看';
    lines.push(
      `- [${String(index + 1).padStart(2, '0')} · ${clock(slice.startTime)}–${clock(slice.endTime)} · ${tag}](<${sliceFiles[index]}>)`,
    );
  });
  lines.push('');

  const byId = new Map(subtitles.map((item) => [item.id, item]));
  slices.forEach((slice, index) => {
    const tag = TAG_LABELS[slice.tag] || '待回看';
    lines.push(`## ${String(index + 1).padStart(2, '0')} · ${clock(slice.startTime)}–${clock(slice.endTime)} · ${tag}`);
    lines.push('');
    if (slice.title) {
      lines.push(`**${slice.title}**`);
      lines.push('');
    }
    const cues = cuesForSlice(slice, subtitles, byId);
    if (cues.length) {
      for (const cue of cues) {
        lines.push(`- [${clock(cue.start)}] ${cue.text}`);
      }
    } else {
      lines.push('_本段暂无字幕_');
    }
    lines.push('');
    if (slice.note.trim()) {
      lines.push('**笔记**');
      lines.push('');
      lines.push(slice.note.trim());
      lines.push('');
    }
  });

  return lines.join('\n');
}

export async function archiveCourse(payload) {
  await ensureArchiveRoot();
  const course = payload?.course;
  if (!course || !course.id || !course.name) {
    throw new ArchiveError('缺少课程信息', 400, 'ARCHIVE_INVALID');
  }

  const subtitles = normalizeSubtitles(payload.subtitles, course.id);
  const slices = normalizeSlices(payload.slices, course.id);
  const { dir, folderName } = await chooseCourseDir(course);
  const dataPath = path.join(dir, DATA_FILE);
  const overviewPath = path.join(dir, OVERVIEW_FILE);
  const savedAt = Date.now();

  const snapshot = {
    app: '课隙',
    version: 1,
    savedAt: new Date(savedAt).toISOString(),
    course: JSON.parse(JSON.stringify(course)),
    subtitles,
    slices,
  };

  const byId = new Map(subtitles.map((item) => [item.id, item]));
  const sliceFiles = slices.map((slice, index) => sliceFileName(slice, index));
  const sliceWrites = slices.map((slice, index) => ({
    name: sliceFiles[index],
    content: buildSliceMarkdown(course, slice, index, cuesForSlice(slice, subtitles, byId)),
  }));

  const overview = buildOverviewMarkdown({
    course,
    subtitles,
    slices,
    savedAt,
    sliceFiles,
  });

  await writeAtomic(dataPath, `${JSON.stringify(snapshot, null, 2)}\n`);
  await writeAtomic(overviewPath, `${overview}\n`);
  for (const file of sliceWrites) {
    await writeAtomic(path.join(dir, file.name), `${file.content}\n`);
  }

  const expected = new Set(sliceFiles);
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile()) continue;
    if (!SLICE_FILE_PATTERN.test(entry.name)) continue;
    if (!expected.has(entry.name)) {
      await fs.rm(path.join(dir, entry.name), { force: true });
    }
  }

  return {
    ok: true,
    root: ARCHIVE_ROOT,
    folderName,
    folderPath: dir,
    dataPath,
    overviewPath,
    sliceFiles,
    savedAt,
    subtitleCount: subtitles.length,
    sliceCount: slices.length,
  };
}

export async function archiveStatus() {
  try {
    await ensureArchiveRoot();
    const entries = await fs.readdir(ARCHIVE_ROOT, { withFileTypes: true });
    let courseCount = 0;
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      if (await exists(path.join(ARCHIVE_ROOT, entry.name, DATA_FILE))) {
        courseCount += 1;
      }
    }
    const probePath = path.join(ARCHIVE_ROOT, `.kexi-write-${randomUUID()}.tmp`);
    await fs.writeFile(probePath, 'ok', 'utf8');
    await fs.rm(probePath, { force: true });
    return {
      ok: true,
      root: ARCHIVE_ROOT,
      available: true,
      writable: true,
      courseCount,
      courseFiles: courseCount,
    };
  } catch (error) {
    return {
      ok: false,
      root: ARCHIVE_ROOT,
      available: false,
      writable: false,
      courseCount: 0,
      courseFiles: 0,
      error: error.message,
    };
  }
}

export async function openArchiveFolder() {
  await ensureArchiveRoot();
  if (process.platform !== 'win32') {
    throw new ArchiveError('当前系统不支持自动打开文件夹', 501, 'ARCHIVE_UNSUPPORTED');
  }
  const child = spawn('explorer.exe', [ARCHIVE_ROOT], {
    detached: true,
    stdio: 'ignore',
    windowsHide: true,
  });
  child.unref();
  return { ok: true, root: ARCHIVE_ROOT };
}
