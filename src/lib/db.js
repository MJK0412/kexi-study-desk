import { openDB } from 'idb';

const DB_NAME = 'kexi-study-desk';
const DB_VERSION = 1;

let dbPromise;

function getDb() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('courses')) {
          const courses = db.createObjectStore('courses', { keyPath: 'id' });
          courses.createIndex('updatedAt', 'updatedAt');
        }
        if (!db.objectStoreNames.contains('subtitles')) {
          const subtitles = db.createObjectStore('subtitles', { keyPath: 'id' });
          subtitles.createIndex('courseId', 'courseId');
        }
        if (!db.objectStoreNames.contains('slices')) {
          const slices = db.createObjectStore('slices', { keyPath: 'id' });
          slices.createIndex('courseId', 'courseId');
          slices.createIndex('courseId_startTime', ['courseId', 'startTime']);
        }
      },
      blocked() {
        console.warn('[db] Upgrade blocked by another open tab.');
      },
    });
  }
  return dbPromise;
}

export async function listCourses() {
  const db = await getDb();
  const courses = await db.getAll('courses');
  return courses.sort((a, b) => (b.updatedAt || b.createdAt || 0) - (a.updatedAt || a.createdAt || 0));
}

export async function getCourse(id) {
  if (!id) return null;
  const db = await getDb();
  return (await db.get('courses', id)) ?? null;
}

export async function putCourse(course) {
  const db = await getDb();
  const plain = JSON.parse(JSON.stringify({ ...course }));
  await db.put('courses', plain);
  return plain;
}

export async function getSubtitlesByCourse(courseId) {
  if (!courseId) return [];
  const db = await getDb();
  const items = await db.getAllFromIndex('subtitles', 'courseId', courseId);
  return items.sort((a, b) => a.start - b.start || a.end - b.end);
}

export async function replaceSubtitles(courseId, subtitles) {
  const db = await getDb();
  const tx = db.transaction('subtitles', 'readwrite');
  const index = tx.store.index('courseId');
  let cursor = await index.openCursor(courseId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  for (const item of subtitles) {
    await tx.store.put({ ...item, courseId });
  }
  await tx.done;
}

export async function getSlicesByCourse(courseId) {
  if (!courseId) return [];
  const db = await getDb();
  const items = await db.getAllFromIndex('slices', 'courseId', courseId);
  return items.sort((a, b) => a.startTime - b.startTime);
}

export async function replaceSlices(courseId, slices) {
  const db = await getDb();
  const tx = db.transaction('slices', 'readwrite');
  const index = tx.store.index('courseId');
  let cursor = await index.openCursor(courseId);
  while (cursor) {
    await cursor.delete();
    cursor = await cursor.continue();
  }
  for (const slice of slices) {
    await tx.store.put({ ...slice, courseId });
  }
  await tx.done;
}

export async function putSlice(slice) {
  const db = await getDb();
  await db.put('slices', slice);
}

export async function updateSliceFields(id, patch) {
  const db = await getDb();
  const tx = db.transaction('slices', 'readwrite');
  const current = await tx.store.get(id);
  if (!current) {
    await tx.done;
    return null;
  }
  const next = { ...current, ...patch };
  await tx.store.put(next);
  await tx.done;
  return next;
}

export async function deleteCourseData(courseId) {
  const db = await getDb();
  const tx = db.transaction(['courses', 'subtitles', 'slices'], 'readwrite');
  await tx.objectStore('courses').delete(courseId);

  for (const storeName of ['subtitles', 'slices']) {
    const index = tx.objectStore(storeName).index('courseId');
    let cursor = await index.openCursor(courseId);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

export async function exportAllData() {
  const db = await getDb();
  return {
    exportedAt: new Date().toISOString(),
    courses: await db.getAll('courses'),
    subtitles: await db.getAll('subtitles'),
    slices: await db.getAll('slices'),
  };
}
