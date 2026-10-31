import { makeId } from './id.js';

const TIMESTAMP_RE = /(?:(\d{1,3}):)?(\d{1,2}):(\d{1,2})[.,](\d{1,3})/g;
const ENTITIES = {
  '&amp;': '&',
  '&lt;': '<',
  '&gt;': '>',
  '&quot;': '"',
  '&#39;': "'",
  '&nbsp;': ' ',
};

function decodeEntities(value) {
  return value.replace(/&(amp|lt|gt|quot|#39|nbsp);/g, (match) => ENTITIES[match] ?? match);
}

function parseTimestamp(match) {
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const milliseconds = Number(match[4].padEnd(3, '0').slice(0, 3));
  if (minutes > 59 || seconds > 59) return null;
  return hours * 3600 + minutes * 60 + seconds + milliseconds / 1000;
}

function extractTimestamps(line) {
  const matches = [...line.matchAll(TIMESTAMP_RE)];
  if (matches.length < 2) return null;
  const start = parseTimestamp(matches[0]);
  const end = parseTimestamp(matches[1]);
  if (start === null || end === null || end <= start) return null;
  return { start, end };
}

function cleanCueText(lines) {
  return decodeEntities(
    lines
      .join('\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]*>/g, '')
      .replace(/\{\\[^}]+\}/g, ''),
  )
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
}

/**
 * Parse SRT or WebVTT into normalized subtitle cues.
 * Tolerant of BOM, CRLF, cue settings, HTML tags and missing cue indices.
 */
export function parseSubtitles(input, { courseId = '' } = {}) {
  if (typeof input !== 'string') {
    throw new Error('字幕内容必须是文本');
  }

  const normalized = input
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\u00a0/g, ' ')
    .trim();

  if (!normalized) {
    throw new Error('字幕文件是空的');
  }

  const isVtt = /^WEBVTT\b/i.test(normalized);
  const body = isVtt ? normalized.replace(/^WEBVTT[^\n]*\n?/i, '') : normalized;
  const blocks = body.split(/\n{2,}/);
  const items = [];
  let skipped = 0;

  for (const rawBlock of blocks) {
    const block = rawBlock.trim();
    if (!block) continue;
    if (/^(NOTE|STYLE|REGION)\b/i.test(block)) continue;

    const lines = block.split('\n');
    const timestampIndex = lines.findIndex((line) => line.includes('-->'));
    if (timestampIndex === -1) {
      skipped += 1;
      continue;
    }

    const timing = extractTimestamps(lines[timestampIndex]);
    if (!timing) {
      skipped += 1;
      continue;
    }

    const text = cleanCueText(lines.slice(timestampIndex + 1));
    if (!text) {
      skipped += 1;
      continue;
    }

    items.push({
      id: makeId('sub'),
      courseId,
      start: Math.round(timing.start * 1000) / 1000,
      end: Math.round(timing.end * 1000) / 1000,
      text,
    });
  }

  if (!items.length) {
    throw new Error('没有找到有效字幕，请确认文件为 SRT 或 VTT 格式');
  }

  items.sort((a, b) => a.start - b.start || a.end - b.end);

  // Drop exact duplicates (common when SRT and VTT cues are appended together).
  const deduped = [];
  for (const item of items) {
    const previous = deduped[deduped.length - 1];
    if (previous && previous.start === item.start && previous.end === item.end && previous.text === item.text) {
      skipped += 1;
      continue;
    }
    deduped.push(item);
  }

  return {
    items: deduped,
    format: isVtt ? 'vtt' : 'srt',
    skipped,
  };
}
