import { getCourse, getSlicesByCourse, getSubtitlesByCourse, listCourses } from './db.js';
import { notify } from '../composables/useToast.js';

const queues = new Map();
let lastFailureNoticeAt = 0;

async function runArchive(courseId) {
  const course = await getCourse(courseId);
  if (!course) return null;

  const [subtitles, slices] = await Promise.all([
    getSubtitlesByCourse(courseId),
    getSlicesByCourse(courseId),
  ]);

  const response = await fetch('/api/archive/course', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ course, subtitles, slices }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `保存课程失败（${response.status}）`);
  }
  return data;
}

function reportFailure(error) {
  console.warn('[archive] save failed', error);
  if (Date.now() - lastFailureNoticeAt < 30000) return;
  lastFailureNoticeAt = Date.now();
  notify(
    '自动保存到 D:\\课隙 失败。请确认 D 盘可用，课程仍保留在浏览器中。',
    'error',
    6000,
  );
}

export function saveCourseArchive(courseId, { report = true } = {}) {
  if (!courseId) return Promise.resolve(null);

  const previous = queues.get(courseId) || Promise.resolve();
  const task = previous
    .catch(() => null)
    .then(() => runArchive(courseId));

  queues.set(courseId, task);
  task
    .finally(() => {
      if (queues.get(courseId) === task) queues.delete(courseId);
    })
    .catch(() => {});

  if (report) task.catch(reportFailure);
  return task;
}

export async function saveAllCoursesArchive() {
  try {
    const courses = await listCourses();
    for (const course of courses) {
      await saveCourseArchive(course.id, { report: false });
    }
    return courses.length;
  } catch (error) {
    console.warn('[archive] initial save failed', error);
    return 0;
  }
}

export async function getArchiveStatus() {
  const response = await fetch('/api/archive/status', { cache: 'no-store' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '无法读取保存目录状态');
  return data;
}

export async function openArchiveFolder() {
  const response = await fetch('/api/archive/open', { method: 'POST' });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || '无法打开保存文件夹');
  return data;
}
