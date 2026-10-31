import { describe, expect, it } from 'vitest';
import {
  buildSlices,
  findSliceAtTime,
  getSliceCues,
  MAX_SLICE_SECONDS,
} from '../src/lib/slices.js';

function cue(id, start, end, text) {
  return { id, courseId: 'c1', start, end, text };
}

describe('buildSlices', () => {
  it('cuts at knowledge-point markers instead of fixed 60 second windows', () => {
    const subtitles = [
      cue('s1', 0, 20, '开场介绍这门课程'),
      cue('s2', 20, 50, '第一个知识点 随机事件'),
      cue('s3', 50, 70, '随机事件的定义和例子'),
      cue('s4', 70, 80, '第二个知识点 样本空间'),
      cue('s5', 80, 110, '样本空间的定义'),
    ];

    const slices = buildSlices({ courseId: 'c1', subtitles, duration: 110 });

    expect(slices).toHaveLength(3);
    expect(slices.map((slice) => slice.startTime)).toEqual([0, 20, 70]);
    expect(slices.map((slice) => slice.endTime)).toEqual([20, 70, 110]);
    expect(slices[0].subtitleIds).toEqual(['s1']);
    expect(slices[1].subtitleIds).toEqual(['s2', 's3']);
    expect(slices[2].subtitleIds).toEqual(['s4', 's5']);
    expect(slices[1].title).toContain('第一个知识点');
  });

  it('does not create tiny slices when markers arrive too quickly', () => {
    const subtitles = [
      cue('s1', 0, 5, '开场'),
      cue('s2', 5, 10, '第一个知识点 甲'),
      cue('s3', 10, 40, '继续讲解甲'),
      cue('s4', 40, 60, '第二个知识点 乙'),
      cue('s5', 60, 80, '继续讲解乙'),
    ];

    const slices = buildSlices({ courseId: 'c1', subtitles, duration: 80, minSeconds: 20 });

    expect(slices).toHaveLength(2);
    expect(slices.map((slice) => slice.startTime)).toEqual([0, 40]);
    expect(slices[0].endTime).toBe(40);
  });

  it('forces a boundary when one section exceeds the maximum duration', () => {
    const subtitles = [];
    for (let start = 0; start < 400; start += 10) {
      subtitles.push(cue(`s${start}`, start, start + 10, `连续讲解第 ${start} 秒`));
    }

    const slices = buildSlices({ courseId: 'c1', subtitles, duration: 400 });

    expect(slices.length).toBeGreaterThan(1);
    expect(slices[0].endTime).toBe(MAX_SLICE_SECONDS);
    expect(slices.every((slice) => slice.endTime - slice.startTime <= MAX_SLICE_SECONDS)).toBe(true);
  });

  it('merges a tiny final fragment into the previous slice', () => {
    const subtitles = [
      cue('s1', 0, 70, '主要内容'),
      cue('s2', 70, 95, '最后的知识点'),
      cue('s3', 95, 100, '结尾一句'),
    ];

    const slices = buildSlices({ courseId: 'c1', subtitles, duration: 100 });

    expect(slices).toHaveLength(1);
    expect(slices[0].startTime).toBe(0);
    expect(slices[0].endTime).toBe(100);
  });

  it('keeps old notes and tags by midpoint when boundaries move', () => {
    const previousSlices = [
      { startTime: 0, endTime: 50, tag: 'hard', note: '这里是重点', playbackRate: 1.5 },
      { startTime: 50, endTime: 100, tag: 'done', note: '复习用', playbackRate: 1 },
    ];
    const subtitles = [
      cue('s1', 0, 40, '开场'),
      cue('s2', 40, 90, '第二个知识点'),
      cue('s3', 90, 100, '收尾'),
    ];

    const slices = buildSlices({
      courseId: 'c1',
      subtitles,
      duration: 100,
      previousSlices,
    });

    expect(slices).toHaveLength(2);
    expect(slices[0]).toMatchObject({ tag: 'hard', note: '这里是重点', playbackRate: 1.5 });
    expect(slices[1]).toMatchObject({ tag: 'done', note: '复习用' });
    expect(slices.flatMap((slice) => slice.note)).toEqual(['这里是重点', '复习用']);
  });

  it('merges several old notes into one semantic slice without losing any', () => {
    const previousSlices = [
      { startTime: 0, endTime: 10, tag: 'hard', note: '笔记一', playbackRate: 1.25 },
      { startTime: 10, endTime: 20, tag: 'review', note: '笔记二', playbackRate: 1 },
      { startTime: 20, endTime: 30, tag: 'done', note: '笔记三', playbackRate: 1 },
    ];
    const subtitles = [cue('s1', 0, 30, '一段连续的讲解')];

    const slices = buildSlices({
      courseId: 'c1',
      subtitles,
      duration: 30,
      previousSlices,
    });

    expect(slices).toHaveLength(1);
    expect(slices[0].tag).toBe('hard');
    expect(slices[0].playbackRate).toBe(1.25);
    expect(slices[0].note).toBe('笔记一\n\n笔记二\n\n笔记三');
  });

  it('returns one slice when there are no explicit transitions', () => {
    const subtitles = [cue('s1', 0, 30, '一段完整的讲解')];
    const slices = buildSlices({ courseId: 'c1', subtitles, duration: 30 });
    expect(slices).toHaveLength(1);
    expect(slices[0].endTime).toBe(30);
  });

  it('uses the last subtitle end when video duration is unknown', () => {
    const subtitles = [cue('s1', 0, 30, '开场'), cue('s2', 30, 140, '第二个知识点')];
    const slices = buildSlices({ courseId: 'c1', subtitles, duration: 0 });
    expect(slices[0].startTime).toBe(0);
    expect(slices[slices.length - 1].endTime).toBe(140);
  });

  it('returns no slices without subtitles', () => {
    expect(buildSlices({ courseId: 'c1', subtitles: [], duration: 120 })).toEqual([]);
  });
});

describe('slice helpers', () => {
  const subtitles = [cue('s1', 0, 20, '开场'), cue('s2', 40, 80, '第二个知识点 内容')];
  const slices = buildSlices({ courseId: 'c1', subtitles, duration: 80 });

  it('finds the slice containing a timestamp', () => {
    expect(findSliceAtTime(slices, 0).startTime).toBe(0);
    expect(findSliceAtTime(slices, 39.9).startTime).toBe(0);
    expect(findSliceAtTime(slices, 40).startTime).toBe(40);
    expect(findSliceAtTime(slices, 999).startTime).toBe(40);
  });

  it('resolves subtitle ids back to cues', () => {
    expect(getSliceCues(slices[0], subtitles).map((item) => item.id)).toEqual(['s1']);
    expect(getSliceCues(slices[1], subtitles).map((item) => item.id)).toEqual(['s2']);
  });
});
