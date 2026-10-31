import { describe, expect, it } from 'vitest';
import { buildCourseMarkdown, markdownFileName } from '../src/lib/markdown.js';

const course = {
  name: '证券投资基金基础',
  fileName: '第03讲.mp4',
  duration: 130,
};

const subtitles = [
  { id: 's1', start: 0, end: 5, text: '开场介绍' },
  { id: 's2', start: 28, end: 38, text: '基金的定义' },
];

const slices = [
  {
    id: 'a',
    title: '开场介绍',
    startTime: 0,
    endTime: 60,
    subtitleIds: ['s1', 's2'],
    tag: 'done',
    note: '重点是**信托关系**。',
  },
  {
    id: 'b',
    title: '第 02 段',
    startTime: 60,
    endTime: 120,
    subtitleIds: [],
    tag: 'hard',
    note: '',
  },
];

describe('buildCourseMarkdown', () => {
  it('renders course metadata, slices, subtitles and notes', () => {
    const markdown = buildCourseMarkdown(course, slices, subtitles);

    expect(markdown).toContain('# 证券投资基金基础');
    expect(markdown).toContain('| 切片进度 | 1 / 2 已掌握 |');
    expect(markdown).toContain('## 01 · 00:00 – 01:00');
    expect(markdown).toContain('**标签**：已掌握');
    expect(markdown).toContain('- `00:28` 基金的定义');
    expect(markdown).toContain('重点是**信托关系**。');
    expect(markdown).toContain('**标签**：重难点');
    expect(markdown).toContain('_本段没有匹配到字幕。_');
    expect(markdown).toContain('_暂无笔记。_');
  });
});

describe('markdownFileName', () => {
  it('removes filesystem-unsafe characters and adds a date stamp', () => {
    const date = new Date(2026, 9, 31);
    expect(markdownFileName('基金/从业:基础?', date)).toBe('基金从业基础_学习笔记_2026-10-31.md');
  });
});
