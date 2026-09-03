import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fmtClock, fmtCost, fmtTok, segmentsOf } from '../../ui/src/theme';
import { RunRecordSchema } from '../../src/contract/schema';

const rec = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

describe('theme', () => {
  it('formats', () => {
    expect(fmtClock(412000)).toBe('6:52');
    expect(fmtTok({ input: 118000, output: 6100, cacheRead: 0, cacheWrite: 0 })).toBe('118k / 6.1k');
    expect(fmtTok(null)).toBe('—');
    expect(fmtCost(1.42)).toBe('$1.42');
    expect(fmtCost(null)).toBe('n/a');
  });

  it('merges typecheck+lint, keeps n/a as dashed, sizes by the track max', () => {
    const segs = segmentsOf(rec.agents[0]!.score!);
    expect(segs.map((s) => s.id)).toEqual(['visible_tests', 'hidden_tests', 'checks', 'ci', 'diff', 'judge']);
    const checks = segs.find((s) => s.id === 'checks')!;
    expect(checks).toMatchObject({ awarded: 15, max: 15, na: false });
    expect(segs.find((s) => s.id === 'ci')).toMatchObject({ na: true, max: 10 });
    // track max = sum of all maxes with max > 0 = 50+20+15+10+10+15 = 120
    expect(segs.find((s) => s.id === 'visible_tests')!.widthPct).toBeCloseTo((50 / 120) * 100, 5);
    expect(segs.find((s) => s.id === 'ci')!.widthPct).toBeCloseTo((10 / 120) * 100, 5);
  });

  it('drops components whose max is zero', () => {
    const segs = segmentsOf(rec.agents[0]!.score!);
    expect(segs.some((s) => s.max === 0)).toBe(false);
  });
});
