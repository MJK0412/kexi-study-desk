import { computed, markRaw, reactive } from 'vue';
import {
  deleteCourseData,
  getSlicesByCourse,
  getSubtitlesByCourse,
  listCourses,
  putCourse,
  replaceSlices,
  replaceSubtitles,
  updateSliceFields,
} from '../lib/db.js';
import { isVideoFile, readVideoDuration } from '../lib/files.js';
import { getArchiveStatus, saveAllCoursesArchive, saveCourseArchive } from '../lib/archive.js';
import { makeId } from '../lib/id.js';
import { buildSlices, findSliceAtTime, getSliceCues } from '../lib/slices.js';
import { parseSubtitles } from '../lib/subtitles.js';
import { notify } from '../composables/useToast.js';

const ACTIVE_COURSE_KEY = 'kexi:activeCourse';
const PLAY_MODE_KEY = 'kexi:playMode';
const NOTE_PAUSE_KEY = 'kexi:pauseOnNoteFocus';

const videoCache = new Map();
let playerApi = null;
let noteTimer = null;
let noteSaveToken = 0;

function readStorage(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* Storage can be unavailable in private mode; the app still works in-memory. */
  }
}

function removeStorage(key) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* noop */
  }
}

function courseNameFromFile(fileName) {
  return String(fileName || '未命名课程')
    .replace(/\.(mp4|webm|mov|m4v|ogv|mkv)$/i, '')
    .replace(/[_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90) || '未命名课程';
}

function sanitizeRate(value) {
  const rate = Number(value);
  return Number.isFinite(rate) && rate >= 0.5 && rate <= 2 ? rate : 1;
}

export const state = reactive({
  loading: true,
  fatalError: '',
  courses: [],
  activeCourseId: null,
  subtitles: [],
  slices: [],
  currentSliceId: null,
  filter: 'all',
  playMode: readStorage(PLAY_MODE_KEY, 'step') === 'continuous' ? 'continuous' : 'step',
  pauseOnNoteFocus: readStorage(NOTE_PAUSE_KEY, '1') !== '0',
  videoFile: null,
  videoUrl: '',
  videoReady: false,
  duration: 0,
  currentTime: 0,
  isPlaying: false,
  reachedEnd: false,
  saveState: 'idle',
  importBusy: false,
  lastSavedAt: 0,
  archiveRoot: 'D:\\课隙',
  toasts: [],
});

export async function refreshArchiveRoot() {
  try {
    const status = await getArchiveStatus();
    if (status?.root) state.archiveRoot = status.root;
  } catch {
    /* The visible default stays in place until the server answers. */
  }
}

export const activeCourse = computed(
  () => state.courses.find((course) => course.id === state.activeCourseId) ?? null,
);

export const currentSlice = computed(
  () => state.slices.find((slice) => slice.id === state.currentSliceId) ?? null,
);

export const currentSliceId = computed(() => state.currentSliceId);

export const currentSliceIndex = computed(() =>
  state.slices.findIndex((slice) => slice.id === state.currentSliceId),
);

export const currentCues = computed(() => {
  if (!currentSlice.value) return [];
  return getSliceCues(currentSlice.value, state.subtitles);
});

export const activeCue = computed(() => {
  const time = state.currentTime;
  return currentCues.value.find((cue) => time >= cue.start && time < cue.end) ?? null;
});

export const filteredSlices = computed(() => {
  if (state.filter === 'all') return state.slices;
  return state.slices.filter((slice) => slice.tag === state.filter);
});

export const tagCounts = computed(() => {
  const counts = { all: state.slices.length, done: 0, review: 0, hard: 0 };
  for (const slice of state.slices) {
    if (slice.tag in counts) counts[slice.tag] += 1;
  }
  return counts;
});

export const doneCount = computed(() => tagCounts.value.done);

export const overallProgress = computed(() => {
  if (!state.slices.length) return 0;
  return Math.round((doneCount.value / state.slices.length) * 100);
});

export const currentSliceProgress = computed(() => {
  const slice = currentSlice.value;
  if (!slice) return 0;
  const span = slice.endTime - slice.startTime;
  if (span <= 0) return 0;
  return Math.min(100, Math.max(0, ((state.currentTime - slice.startTime) / span) * 100));
});

export const canGoPrevious = computed(() => currentSliceIndex.value > 0);
export const canGoNext = computed(
  () => currentSliceIndex.value >= 0 && currentSliceIndex.value < state.slices.length - 1,
);

export const hasCourse = computed(() => Boolean(activeCourse.value));
export const hasSubtitles = computed(() => state.subtitles.length > 0);

export function registerPlayerApi(api) {
  playerApi = api;
  return () => {
    if (playerApi === api) playerApi = null;
  };
}

export function hasCachedVideo(courseId) {
  return videoCache.has(courseId);
}

export function hasLoadedVideo() {
  return Boolean(state.videoFile || state.videoUrl);
}

export function hasVideoSource() {
  return Boolean(state.videoFile || state.videoUrl);
}

function currentSliceStorageKey(courseId = state.activeCourseId) {
  return `kexi:lastSlice:${courseId}`;
}

function applyRateForSlice(slice) {
  const rate = sanitizeRate(slice?.playbackRate ?? 1);
  playerApi?.setRate?.(rate);
  return rate;
}

function rememberCurrentSlice(id) {
  if (!state.activeCourseId || !id) return;
  writeStorage(currentSliceStorageKey(), id);
}

function touchCourse(course = activeCourse.value) {
  if (!course) return null;
  course.updatedAt = Date.now();
  putCourse(course).catch((error) => console.warn('[course] save failed', error));
  return course;
}

async function migrateLegacySlices(course, subtitles, slices) {
  if (course.sliceMode === 'semantic' || !subtitles.length || !slices.length) return slices;

  const migrated = buildSlices({
    courseId: course.id,
    subtitles,
    duration: Number(course.duration) || 0,
    previousSlices: slices,
  });
  if (!migrated.length) return slices;

  await replaceSlices(course.id, migrated);
  course.sliceMode = 'semantic';
  delete course.sliceInterval;
  course.sliceCount = migrated.length;
  course.updatedAt = Date.now();
  await putCourse(course);
  void saveCourseArchive(course.id);
  return migrated;
}

export async function initStudio() {
  state.loading = true;
  state.fatalError = '';
  try {
    state.courses = await listCourses();
    let activeId = readStorage(ACTIVE_COURSE_KEY);
    if (!state.courses.some((course) => course.id === activeId)) {
      activeId = state.courses[0]?.id ?? null;
    }
    if (activeId) {
      await activateCourse(activeId, { initial: true });
    }
    if (state.courses.length) void saveAllCoursesArchive();
    void refreshArchiveRoot();
  } catch (error) {
    console.error(error);
    state.fatalError = '无法打开本地数据库。请确认浏览器允许本地存储，或尝试 Chrome / Edge 的最新版本。';
  } finally {
    state.loading = false;
  }
}

export async function activateCourse(courseId, { initial = false } = {}) {
  const course = state.courses.find((item) => item.id === courseId);
  if (!course) return;

  if (!initial && state.activeCourseId === courseId) return;

  playerApi?.pause?.();
  state.isPlaying = false;
  state.reachedEnd = false;
  state.currentSliceId = null;
  state.subtitles = [];
  state.slices = [];
  state.currentTime = 0;
  state.activeCourseId = courseId;
  writeStorage(ACTIVE_COURSE_KEY, courseId);

  const cachedFile = videoCache.get(courseId) ?? null;
  state.videoFile = cachedFile ? markRaw(cachedFile) : null;
  state.videoUrl =
    course.source === 'bilibili'
      ? course.videoUrl || `/api/bilibili/${encodeURIComponent(course.bilibiliId)}/stream`
      : '';
  state.videoReady = false;
  state.duration = Number(course.duration) || 0;

  try {
    const [subtitles, slices] = await Promise.all([
      getSubtitlesByCourse(courseId),
      getSlicesByCourse(courseId),
    ]);
    const upgradedSlices = await migrateLegacySlices(course, subtitles, slices);
    state.subtitles = subtitles;
    state.slices = upgradedSlices;
    if (course.sliceCount !== upgradedSlices.length) course.sliceCount = upgradedSlices.length;

    const rememberedId = readStorage(currentSliceStorageKey(courseId));
    const remembered = upgradedSlices.find((slice) => slice.id === rememberedId);
    const first = remembered ?? upgradedSlices[0] ?? null;
    state.currentSliceId = first?.id ?? null;
    state.currentTime = first?.startTime ?? 0;
    if (first) applyRateForSlice(first);
  } catch (error) {
    console.error(error);
    notify('课程数据读取失败，请刷新页面重试', 'error');
  }
}

export async function switchCourse(courseId) {
  await activateCourse(courseId);
}

export async function openBilibiliCourse(item, { duration = 0, videoUrl = '' } = {}) {
  if (!item?.id) return null;
  const now = Date.now();
  const resolvedDuration = Number(duration) || Number(item.duration) || 0;
  const sourceUrl = videoUrl || `/api/bilibili/${encodeURIComponent(item.id)}/stream`;
  const existing = state.courses.find(
    (course) => course.source === 'bilibili' && course.bilibiliId === item.id,
  );

  if (existing) {
    Object.assign(existing, {
      name: item.title || existing.name,
      duration: resolvedDuration || existing.duration,
      videoUrl: sourceUrl,
      bilibiliGroup: item.groupTitle || existing.bilibiliGroup,
      bilibiliUname: item.uname || existing.bilibiliUname,
      bilibiliP: Number(item.p) || existing.bilibiliP,
      updatedAt: now,
    });
    await putCourse(existing);
    await activateCourse(existing.id, { initial: true });
    notify('已打开缓存的 B 站课程', 'success');
    void saveCourseArchive(existing.id);
    return existing;
  }

  const course = {
    id: makeId('course'),
    name: String(item.title || 'B 站缓存课程').slice(0, 90),
    fileName: item.bvid ? `${item.bvid} P${item.p || 1}.mp4` : 'B 站缓存视频.mp4',
    fileSize: Number(item.totalSize) || 0,
    fileLastModified: Number(item.cachedAt) || now,
    duration: resolvedDuration,
    subtitleFileName: '',
    sliceMode: 'semantic',
    sliceCount: 0,
    createdAt: now,
    updatedAt: now,
    source: 'bilibili',
    bilibiliId: item.id,
    bilibiliBvid: item.bvid || '',
    bilibiliP: Number(item.p) || 1,
    bilibiliGroup: item.groupTitle || '',
    bilibiliUname: item.uname || '',
    videoUrl: sourceUrl,
  };

  await putCourse(course);
  state.courses = [course, ...state.courses];

  playerApi?.pause?.();
  state.activeCourseId = course.id;
  state.subtitles = [];
  state.slices = [];
  state.currentSliceId = null;
  state.currentTime = 0;
  state.duration = resolvedDuration;
  state.isPlaying = false;
  state.reachedEnd = false;
  state.videoReady = false;
  state.videoFile = null;
  state.videoUrl = sourceUrl;
  writeStorage(ACTIVE_COURSE_KEY, course.id);
  notify('B 站缓存已就绪，可点「自动转写」生成字幕', 'success');
  void saveCourseArchive(course.id);
  return course;
}

export async function openVideo(file) {
  if (!isVideoFile(file)) {
    notify('请选择 MP4、WebM、MOV 等视频文件', 'error');
    return null;
  }

  let duration = 0;
  try {
    duration = await readVideoDuration(file);
  } catch (error) {
    notify(error.message || '无法读取视频', 'error');
    return null;
  }

  const now = Date.now();
  const course = {
    id: makeId('course'),
    name: courseNameFromFile(file.name),
    fileName: file.name,
    fileSize: file.size,
    fileLastModified: file.lastModified,
    duration,
    subtitleFileName: '',
    sliceMode: 'semantic',
    sliceCount: 0,
    createdAt: now,
    updatedAt: now,
  };

  await putCourse(course);
  state.courses = [course, ...state.courses];
  videoCache.set(course.id, file);

  playerApi?.pause?.();
  state.activeCourseId = course.id;
  state.subtitles = [];
  state.slices = [];
  state.currentSliceId = null;
  state.currentTime = 0;
  state.duration = duration;
  state.isPlaying = false;
  state.reachedEnd = false;
  state.videoReady = false;
  state.videoFile = markRaw(file);
  state.videoUrl = '';
  writeStorage(ACTIVE_COURSE_KEY, course.id);
  notify('视频已就绪，可直接点「自动转写」生成字幕', 'success');
  void saveCourseArchive(course.id);
  return course;
}

export async function attachVideoToCourse(file) {
  const course = activeCourse.value;
  if (!course) return openVideo(file);
  if (!isVideoFile(file)) {
    notify('请选择视频文件', 'error');
    return false;
  }

  let duration = 0;
  try {
    duration = await readVideoDuration(file);
  } catch (error) {
    notify(error.message || '无法读取视频', 'error');
    return false;
  }

  const nameMismatch = course.fileName && file.name !== course.fileName;
  const identityMismatch =
    nameMismatch &&
    (Number(course.fileSize) !== Number(file.size) ||
      Number(course.fileLastModified) !== Number(file.lastModified));
  if (identityMismatch) {
    notify(`文件与课程记录不一致，请选择「${course.fileName}」`, 'error', 4500);
    return false;
  }

  videoCache.set(course.id, file);
  state.videoFile = markRaw(file);
  state.videoReady = false;
  if (!course.duration && duration) {
    course.duration = duration;
    state.duration = duration;
    await putCourse(course);
  }
  notify('视频已连接', 'success');
  void saveCourseArchive(course.id);
  return true;
}

export async function importSubtitleFile(file, { replace = false } = {}) {
  const course = activeCourse.value;
  if (!course) {
    notify('请先打开一节视频，创建课程', 'error');
    return { ok: false };
  }
  if (!file) return { ok: false };

  state.importBusy = true;
  try {
    const text = await file.text();
    const parsed = parseSubtitles(text, { courseId: course.id });
    return await applySubtitleItems(parsed.items, {
      sourceName: file.name,
      format: parsed.format,
      skipped: parsed.skipped,
      replace,
    });
  } catch (error) {
    console.error(error);
    notify(error.message || '字幕导入失败', 'error', 4500);
    return { ok: false, error: error.message };
  } finally {
    state.importBusy = false;
  }
}

export async function applySubtitleItems(
  items,
  { sourceName = '自动转写', replace = false, format = 'auto', skipped = 0, silent = false } = {},
) {
  const course = activeCourse.value;
  if (!course) {
    notify('请先打开一节视频，创建课程', 'error');
    return { ok: false };
  }

  const normalized = (Array.isArray(items) ? items : [])
    .map((item) => ({
      id: item.id || makeId('sub'),
      courseId: course.id,
      start: Math.max(0, Math.round(Number(item.start) * 1000) / 1000),
      end: Math.max(0, Math.round(Number(item.end) * 1000) / 1000),
      text: String(item.text || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((item) => item.text && item.end > item.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (!normalized.length) {
    const message = '没有可用的字幕内容';
    notify(message, 'error');
    return { ok: false, error: message };
  }

  if (state.slices.length && !replace) {
    return {
      ok: false,
      needsConfirm: true,
      parsedCount: normalized.length,
      skipped,
      format,
    };
  }

  try {
    const previousSlices = replace ? state.slices.map((slice) => ({ ...slice })) : [];
    const totalDuration = Math.max(
      Number(course.duration) || 0,
      normalized[normalized.length - 1]?.end ?? 0,
    );
    const nextSlices = buildSlices({
      courseId: course.id,
      subtitles: normalized,
      duration: totalDuration,
      previousSlices,
    });

    clearTimeout(noteTimer);
    noteTimer = null;

    await replaceSubtitles(course.id, normalized);
    await replaceSlices(course.id, nextSlices);

    state.subtitles = normalized;
    state.slices = nextSlices;
    state.duration = totalDuration;
    course.duration = totalDuration;
    course.subtitleFileName = sourceName;
    course.subtitleSource = sourceName === '自动转写' ? 'auto' : 'file';
    course.sliceMode = 'semantic';
    delete course.sliceInterval;
    course.sliceCount = nextSlices.length;
    course.updatedAt = Date.now();
    await putCourse(course);

    void saveCourseArchive(course.id);

    const target = findSliceAtTime(nextSlices, state.currentTime) ?? nextSlices[0] ?? null;
    state.currentSliceId = target?.id ?? null;
    state.currentTime = target?.startTime ?? 0;
    state.reachedEnd = false;
    if (target) {
      rememberCurrentSlice(target.id);
      applyRateForSlice(target);
    }

    if (!silent) notify(`已生成 ${nextSlices.length} 个学习切片`, 'success');
    return {
      ok: true,
      parsedCount: normalized.length,
      skipped,
      format,
      sliceCount: nextSlices.length,
    };
  } catch (error) {
    console.error(error);
    notify(error.message || '字幕保存失败', 'error', 4500);
    return { ok: false, error: error.message };
  }
}

export function setFilter(filter) {
  state.filter = ['all', 'review', 'hard', 'done'].includes(filter) ? filter : 'all';
}

export function selectSlice(sliceId, { play = null, seek = true } = {}) {
  const slice = state.slices.find((item) => item.id === sliceId);
  if (!slice) return;

  state.currentSliceId = slice.id;
  state.reachedEnd = false;
  state.currentTime = slice.startTime;
  rememberCurrentSlice(slice.id);
  applyRateForSlice(slice);

  if (seek && state.videoReady && (state.videoFile || state.videoUrl)) {
    const shouldPlay = play === null ? state.isPlaying : Boolean(play);
    playerApi?.seek?.(slice.startTime, { play: shouldPlay });
  }
}

export function goNext({ play = true } = {}) {
  const index = currentSliceIndex.value;
  if (index < 0 || index >= state.slices.length - 1) return;
  const next = state.slices[index + 1];
  selectSlice(next.id, { play, seek: true });
}

export function goPrevious({ play = null } = {}) {
  const index = currentSliceIndex.value;
  if (index <= 0) return;
  const previous = state.slices[index - 1];
  selectSlice(previous.id, { play, seek: true });
}

export function togglePlay() {
  if (!state.videoReady) return;
  if (state.isPlaying) playerApi?.pause?.();
  else playerApi?.play?.();
}

export function seekTo(seconds, { play = null } = {}) {
  if (!state.videoReady || !(state.videoFile || state.videoUrl)) return;
  const target = Math.max(0, Number(seconds) || 0);
  state.currentTime = target;
  const shouldPlay = play === null ? state.isPlaying : Boolean(play);
  playerApi?.seek?.(target, { play: shouldPlay });
}

export function setPlayMode(mode) {
  state.playMode = mode === 'continuous' ? 'continuous' : 'step';
  writeStorage(PLAY_MODE_KEY, state.playMode);
}

export function setPauseOnNoteFocus(value) {
  state.pauseOnNoteFocus = Boolean(value);
  writeStorage(NOTE_PAUSE_KEY, state.pauseOnNoteFocus ? '1' : '0');
}

export function pauseForNote() {
  if (state.pauseOnNoteFocus && state.isPlaying) {
    playerApi?.pause?.();
  }
}

export function setPlaybackRate(rate) {
  const slice = currentSlice.value;
  const nextRate = sanitizeRate(rate);
  playerApi?.setRate?.(nextRate);
  if (!slice) return;
  slice.playbackRate = nextRate;
  updateSliceFields(slice.id, { playbackRate: nextRate })
    .then(() => saveCourseArchive(slice.courseId))
    .catch((error) => console.warn('[slice] rate save failed', error));
}

export function setTag(tag) {
  const slice = currentSlice.value;
  if (!slice || !['done', 'review', 'hard'].includes(tag)) return;
  slice.tag = tag;
  updateSliceFields(slice.id, { tag })
    .then(() => {
      state.saveState = 'saved';
      state.lastSavedAt = Date.now();
      void saveCourseArchive(slice.courseId);
    })
    .catch((error) => {
      console.warn('[slice] tag save failed', error);
      notify('标签保存失败', 'error');
    });
}

export function updateNote(text) {
  const slice = currentSlice.value;
  if (!slice) return;
  slice.note = String(text ?? '');
  state.saveState = 'saving';

  const token = ++noteSaveToken;
  clearTimeout(noteTimer);
  noteTimer = setTimeout(async () => {
    if (token !== noteSaveToken) return;
    try {
      await updateSliceFields(slice.id, { note: slice.note });
      if (token === noteSaveToken) {
        state.saveState = 'saved';
        state.lastSavedAt = Date.now();
      }
      void saveCourseArchive(slice.courseId);
    } catch (error) {
      console.warn('[slice] note save failed', error);
      state.saveState = 'error';
      notify('笔记保存失败，请检查浏览器存储空间', 'error');
    }
  }, 500);
}

export function appendCueToNote(cue) {
  if (!cue) return;
  const time = formatCueTime(cue.start);
  const excerpt = `\n> [${time}] ${cue.text}\n`;
  const current = currentSlice.value?.note || '';
  updateNote(`${current.trimEnd()}${excerpt}`);
}

function formatCueTime(seconds) {
  const total = Math.max(0, Math.floor(Number(seconds) || 0));
  const m = String(Math.floor(total / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${m}:${s}`;
}

export function onVideoReady(duration, playerTime = 0) {
  state.videoReady = true;
  if (Number.isFinite(duration) && duration > 0) state.duration = duration;
  const slice = currentSlice.value;
  if (slice) {
    applyRateForSlice(slice);
    if (Math.abs((Number(playerTime) || 0) - slice.startTime) > 0.5) {
      playerApi?.seek?.(slice.startTime, { play: false });
    }
  }
}

export function onVideoTimeUpdate(seconds) {
  const time = Number(seconds) || 0;
  state.currentTime = time;

  if (state.playMode === 'step' && state.isPlaying && currentSlice.value) {
    const slice = currentSlice.value;
    if (!state.reachedEnd && time >= slice.endTime - 0.08) {
      state.reachedEnd = true;
      state.isPlaying = false;
      playerApi?.pause?.();
      return;
    }
  }

  if (state.playMode === 'continuous') {
    const candidate = findSliceAtTime(state.slices, time);
    if (candidate && candidate.id !== state.currentSliceId) {
      state.currentSliceId = candidate.id;
      state.reachedEnd = false;
      rememberCurrentSlice(candidate.id);
      applyRateForSlice(candidate);
    }
  }
}

export function onVideoSeeked(seconds) {
  const time = Number(seconds) || 0;
  state.currentTime = time;
  state.reachedEnd = false;
  const candidate = findSliceAtTime(state.slices, time);
  if (candidate && candidate.id !== state.currentSliceId) {
    state.currentSliceId = candidate.id;
    rememberCurrentSlice(candidate.id);
    applyRateForSlice(candidate);
  }
}

export function onVideoPlay() {
  if (state.reachedEnd && state.playMode === 'step' && currentSlice.value) {
    state.reachedEnd = false;
    playerApi?.seek?.(currentSlice.value.startTime, { play: true });
    return;
  }
  state.isPlaying = true;
  state.reachedEnd = false;
}

export function onVideoPause() {
  state.isPlaying = false;
}

export function onVideoEnded() {
  state.isPlaying = false;
  state.reachedEnd = true;
}

export async function deleteActiveCourse() {
  const course = activeCourse.value;
  if (!course) return;
  playerApi?.pause?.();
  try {
    await deleteCourseData(course.id);
  } catch (error) {
    console.error(error);
    notify('删除课程失败', 'error');
    return;
  }
  videoCache.delete(course.id);
  removeStorage(currentSliceStorageKey(course.id));
  state.courses = state.courses.filter((item) => item.id !== course.id);
  removeStorage(ACTIVE_COURSE_KEY);
  state.activeCourseId = null;
  state.subtitles = [];
  state.slices = [];
  state.currentSliceId = null;
  state.videoFile = null;
  state.videoUrl = '';
  state.videoReady = false;
  state.isPlaying = false;
  state.currentTime = 0;
  state.duration = 0;

  const nextCourse = state.courses[0];
  if (nextCourse) await activateCourse(nextCourse.id);
  notify('课程数据已删除', 'success');
}
