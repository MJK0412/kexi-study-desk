import { makeId } from './id.js';
import { shortText } from './time.js';

export const DEFAULT_SLICE_SECONDS = 60; // Legacy metadata only; slicing is content-based.
export const MIN_SLICE_SECONDS = 20;
export const MAX_SLICE_SECONDS = 180;

export const SLICE_TAGS = {
  done: { label: '已掌握', short: '掌握', tone: 'moss' },
  review: { label: '待回看', short: '回看', tone: 'amber' },
  hard: { label: '重难点', short: '难点', tone: 'clay' },
};

const STRONG_BOUNDARY_PATTERNS = [
  /^(?:好|那么|嗯|OK)?[，,、\s]*(?:首先|其次|接下来|下面|现在)?[，,、\s]*(?:让)?(?:我们|咱们)?[，,、\s]*(?:来)?[，,、\s]*(?:看|讲|说)(?:一下|一个|第|这|下|小|个)?/i,
  /^(?:好|那么|嗯)?[，,、\s]*第[一二三四五六七八九十百两\d]+个?(?:知识点|概念|部分|章节|问题|实验|例子)/,
  /^(?:那|好)?[，,、\s]*(?:什么叫|什么是|所谓)/,
  /^(?:好|那么)?[，,、\s]*(?:我们|咱们)?(?:来)?(?:总结|小结)(?:一下)?/,
  /^(?:此处|此處|这里|這裡|下面|接下来)[^。！？]{0,12}(?:注意|重点|問題|问题|几个|幾個)/,
  /^(?:那么|好)[，,、\s]*(?:在|关于|对于)/,
];

const SENTENCE_END = /[。！？!?；;]$/;

function isStrongBoundary(text) {
  const value = String(text || '').trim();
  if (!value) return false;
  return STRONG_BOUNDARY_PATTERNS.some((pattern) => pattern.test(value));
}

function deriveTitle(cues, index) {
  const first = cues.find((cue) => cue.text?.trim());
  if (!first) return `第 ${String(index + 1).padStart(2, '0')} 段`;
  return shortText(first.text, 24);
}

function midpoint(slice) {
  const start = Math.max(0, Number(slice.startTime) || 0);
  const end = Math.max(start, Number(slice.endTime) || start);
  return start + (end - start) / 2;
}

function inheritPreviousMeta(slices, previousSlices) {
  if (!previousSlices.length || !slices.length) return slices;

  const usedPrevious = new Set();
  const previousByStart = new Map(
    previousSlices.map((slice) => [Math.round(Number(slice.startTime) * 1000), slice]),
  );

  for (const slice of slices) {
    const previous = previousByStart.get(Math.round(slice.startTime * 1000));
    if (!previous) continue;
    slice.tag = previous.tag ?? slice.tag;
    slice.note = previous.note ?? slice.note;
    slice.playbackRate = Number(previous.playbackRate) || 1;
    slice.__inherited = true;
    usedPrevious.add(previous);
  }

  // When boundaries move, keep each old note once by assigning it to the
  // new slice containing the old slice's midpoint.
  const pending = previousSlices
    .filter((slice) => !usedPrevious.has(slice))
    .sort((a, b) => String(b.note || '').length - String(a.note || '').length);

  for (const previous of pending) {
    const center = midpoint(previous);
    const target =
      slices.find((slice) => center >= slice.startTime && center < slice.endTime) ??
      slices.reduce((best, slice) => {
        const distance = Math.min(
          Math.abs(center - slice.startTime),
          Math.abs(center - slice.endTime),
        );
        return !best || distance < best.distance ? { slice, distance } : best;
      }, null)?.slice;

    if (!target) continue;
    const inherited = Boolean(target.__inherited);
    const note = String(previous.note || '').trim();
    if (note && !String(target.note || '').includes(note)) {
      target.note = [target.note, note].filter(Boolean).join('\n\n');
    }
    if (!inherited) {
      target.tag = previous.tag ?? target.tag;
      target.playbackRate = Number(previous.playbackRate) || 1;
      target.__inherited = true;
    }
  }

  for (const slice of slices) delete slice.__inherited;
  return slices;
}

/**
 * Cut a subtitle track at content boundaries.
 *
 * Boundaries are taken from lecture cues such as "第三个知识点", "接下来我们看"
 * or "什么叫..." instead of a fixed clock. A minimum duration avoids tiny
 * fragments and a maximum duration prevents a single slice from becoming
 * unusably long when the speaker never signals a transition.
 */
export function buildSlices({
  courseId,
  subtitles = [],
  duration = 0,
  previousSlices = [],
  minSeconds = MIN_SLICE_SECONDS,
  maxSeconds = MAX_SLICE_SECONDS,
} = {}) {
  const cues = (Array.isArray(subtitles) ? subtitles : [])
    .map((cue) => ({
      ...cue,
      start: Math.max(0, Number(cue.start) || 0),
      end: Math.max(0, Number(cue.end) || 0),
      text: String(cue.text || '').replace(/\s+/g, ' ').trim(),
    }))
    .filter((cue) => cue.text && cue.end > cue.start)
    .sort((a, b) => a.start - b.start || a.end - b.end);

  if (!cues.length) return [];

  const minGap = Math.max(5, Number(minSeconds) || MIN_SLICE_SECONDS);
  const maxGap = Math.max(minGap + 10, Number(maxSeconds) || MAX_SLICE_SECONDS);
  const lastCueEnd = cues.reduce((max, cue) => Math.max(max, cue.end), 0);
  const total = Math.max(Number(duration) || 0, lastCueEnd);
  if (total <= 0) return [];

  const boundaries = [0];
  for (let index = 1; index < cues.length; index += 1) {
    const cue = cues[index];
    const currentStart = cues[boundaries[boundaries.length - 1]].start;
    const elapsed = cue.start - currentStart;
    if (elapsed < minGap) continue;

    const previousCue = cues[index - 1];
    const hasPause = cue.start - previousCue.end >= 1.2;
    const strong = isStrongBoundary(cue.text);
    const longEnough = elapsed >= maxGap;

    if (strong || longEnough || (hasPause && elapsed >= minGap * 2 && SENTENCE_END.test(previousCue.text))) {
      boundaries.push(index);
    }
  }

  // Avoid a tiny final fragment after the last real transition.
  if (boundaries.length > 1) {
    const lastStart = cues[boundaries[boundaries.length - 1]].start;
    const previousStart = cues[boundaries[boundaries.length - 2]].start;
    if (total - lastStart < minGap && lastStart - previousStart >= minGap) {
      boundaries.pop();
    }
  }

  const slices = boundaries.map((cueIndex, index) => {
    const nextCueIndex = boundaries[index + 1];
    const group = cues.slice(cueIndex, nextCueIndex ?? cues.length);
    const startTime = index === 0 ? 0 : Number(group[0]?.start) || 0;
    const endTime = nextCueIndex == null
      ? Math.max(total, Number(group[group.length - 1]?.end) || 0)
      : Number(cues[nextCueIndex].start) || startTime;

    const preview = shortText(
      group
        .slice(0, 2)
        .map((cue) => cue.text)
        .join(' '),
      62,
    );

    return {
      id: makeId('slice'),
      courseId,
      title: deriveTitle(group, index),
      preview,
      startTime: Math.round(startTime * 1000) / 1000,
      endTime: Math.round(Math.max(endTime, startTime + 0.1) * 1000) / 1000,
      subtitleIds: group.map((cue) => cue.id),
      tag: 'review',
      note: '',
      playbackRate: 1,
    };
  }).filter((slice) => slice.endTime > slice.startTime);

  return inheritPreviousMeta(slices, Array.isArray(previousSlices) ? previousSlices : []);
}

export function getSliceCues(slice, subtitles) {
  if (!slice) return [];
  const ids = new Set(slice.subtitleIds || []);
  return subtitles.filter((cue) => ids.has(cue.id));
}

export function findSliceAtTime(slices, seconds) {
  if (!Array.isArray(slices) || !slices.length) return null;
  const time = Math.max(0, Number(seconds) || 0);
  return (
    slices.find((slice) => time >= slice.startTime && time < slice.endTime) ??
    slices[slices.length - 1]
  );
}
