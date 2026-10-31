import { describe, expect, it } from 'vitest';
import { parseSubtitles } from '../src/lib/subtitles.js';

describe('parseSubtitles', () => {
  it('parses a standard SRT file with CRLF, BOM and HTML tags', () => {
    const input =
      '\uFEFF1\r\n00:00:01,250 --> 00:00:04,500\r\n<b>基金</b>与证券的区别\r\n\r\n' +
      '2\r\n00:00:05,000 --> 00:00:08,000\r\n第一行<br>第二行\r\n';

    const result = parseSubtitles(input, { courseId: 'c1' });

    expect(result.format).toBe('srt');
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      courseId: 'c1',
      start: 1.25,
      end: 4.5,
      text: '基金与证券的区别',
    });
    expect(result.items[1].text).toBe('第一行 第二行');
    expect(result.skipped).toBe(0);
  });

  it('parses WebVTT including cue identifiers and cue settings', () => {
    const input = [
      'WEBVTT',
      '',
      'intro',
      '00:01.000 --> 00:03.500 align:center',
      '欢迎来到基金从业课程',
      '',
      '01:02:03.000 --> 01:02:06.000',
      '长期收益与风险',
    ].join('\n');

    const result = parseSubtitles(input);

    expect(result.format).toBe('vtt');
    expect(result.items).toHaveLength(2);
    expect(result.items[0].start).toBe(1);
    expect(result.items[1].start).toBe(3723);
    expect(result.items[1].text).toBe('长期收益与风险');
  });

  it('skips malformed cues and removes exact duplicates', () => {
    const input = [
      '1',
      '00:00:01,000 --> 00:00:02,000',
      '重复内容',
      '',
      '2',
      '00:00:01,000 --> 00:00:02,000',
      '重复内容',
      '',
      '3',
      'not a timestamp',
      '坏字幕',
      '',
      '4',
      '00:00:03,000 --> 00:00:02,000',
      '倒序时间',
    ].join('\n');

    const result = parseSubtitles(input);

    expect(result.items).toHaveLength(1);
    expect(result.skipped).toBe(3);
  });

  it('rejects empty or invalid files', () => {
    expect(() => parseSubtitles('')).toThrow('字幕文件是空的');
    expect(() => parseSubtitles('just some text')).toThrow('没有找到有效字幕');
  });
});
