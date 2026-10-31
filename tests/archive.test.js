import { describe, expect, it } from 'vitest';
import { safeCourseName } from '../server/archive.mjs';

describe('safeCourseName', () => {
  it('keeps readable Chinese course names', () => {
    expect(safeCourseName('1.1-行列式的概念')).toBe('1.1-行列式的概念');
  });

  it('replaces Windows-illegal filename characters', () => {
    expect(safeCourseName('第1讲: 函数/极限?')).toBe('第1讲_ 函数_极限_');
  });

  it('falls back for blank names and reserved device names', () => {
    expect(safeCourseName('   ')).toBe('未命名课程');
    expect(safeCourseName('CON')).toBe('_CON');
  });
});
