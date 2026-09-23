import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fmtClock, fmtCost, fmtTok, modelLabel, segmentsOf } from '../../ui/src/theme';
import { RunRecordSchema } from '../../src/contract/schema';

const rec = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

describe('theme', () => {
  it('formats', () => {
    expect(fmtClock(412000)).toBe('6:52');
    expect(fmtTok({ input: 118000, output: 6100, cacheRead: 0, cacheWrite: 0 })).toBe('118k / 6.1k');
    expect(fmtTok(null)).toBe('—');
    // Claude bills nearly all of its context through the cache, so the in number has to
    // count cache reads and writes or a whole race reads as 0k. Same four fields the
    // terminal sums in src/cli/render/style.ts.
    expect(fmtTok({ input: 28, output: 6100, cacheRead: 468000, cacheWrite: 12000 })).toBe('480k / 6.1k');
    expect(fmtCost(1.42)).toBe('$1.42');
    expect(fmtCost(null)).toBe('n/a');
    // A cheap model rounding to $0.00 reads as free rather than nearly free.
    expect(fmtCost(0.004)).toBe('<$0.01');
    expect(fmtCost(0.005)).toBe('$0.01');
    expect(fmtCost(0)).toBe('$0.00');
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

describe('modelLabel', () => {
  it('names the model that ran when the user pinned it', () => {
    expect(modelLabel('claude-opus-5', 'claude-opus-5')).toBe('claude-opus-5');
    expect(modelLabel('claude-opus-5-20260801', 'claude-opus-5')).toBe('claude-opus-5-20260801');
  });

  it('marks a model the provider chose', () => {
    expect(modelLabel('gpt-5.6-sol', null)).toBe('auto: gpt-5.6-sol');
  });

  it('says auto when nobody named a model', () => {
    expect(modelLabel(null, null)).toBe('auto');
  });

  it('falls back to what was asked for when the CLI never reported what ran', () => {
    expect(modelLabel(null, 'claude-opus-5')).toBe('claude-opus-5');
  });

  it('claims nothing about routing where the request is unknown, as in a live lane', () => {
    expect(modelLabel('claude-opus-5', undefined)).toBe('claude-opus-5');
    expect(modelLabel(null, undefined)).toBe('auto');
  });
});
