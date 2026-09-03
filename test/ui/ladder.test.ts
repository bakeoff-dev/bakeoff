import { describe, expect, it } from 'vitest';
import type { Ladder, LadderEntry } from '@contract';
import { sparklinePoints } from '../../ui/src/components/Sparkline';
import { ladderRows, ratingDomain } from '../../ui/src/screens/Ladder';

const entry = (over: Partial<LadderEntry> & Pick<LadderEntry, 'driver'>): LadderEntry => ({
  mu: 25, sigma: 8.333, rating: 1500, races: 0, wins: 0, avgCostUsd: null, avgDurationMs: 0,
  history: [], ...over,
});
const history = (ratings: number[]) =>
  ratings.map((rating, i) => ({ runId: `r${i}`, at: '2026-09-02T18:00:00.000Z', rating }));

describe('sparklinePoints', () => {
  it('spans the 140x28 viewBox inset the way the handoff does', () => {
    const pts = sparklinePoints([1500, 1580], [1500, 1580]);
    expect(pts[0]).toEqual([4, 24]);
    expect(pts[1]).toEqual([136, 4]);
  });

  it('places rows on a shared domain so trends are comparable', () => {
    const rising = sparklinePoints([1500, 1580], [1370, 1580]);
    const falling = sparklinePoints([1500, 1370], [1370, 1580]);
    // The same 1500 rating lands at the same height in both rows.
    expect(rising[0]![1]).toBeCloseTo(falling[0]![1]);
    expect(rising[1]![1]).toBe(4);
    expect(falling[1]![1]).toBe(24);
  });

  it('falls back to its own values when no domain is given', () => {
    expect(sparklinePoints([1400, 1500], null)[1]![1]).toBe(4);
  });

  it('draws a flat line rather than dividing by a zero span', () => {
    expect(sparklinePoints([1500, 1500, 1500], [1500, 1500])).toEqual([[4, 24], [70, 24], [136, 24]]);
  });

  it('has nothing to draw for fewer than two points', () => {
    expect(sparklinePoints([1500], null)).toEqual([]);
    expect(sparklinePoints([], null)).toEqual([]);
  });
});

describe('ladderRows', () => {
  it('ranks by rating, highest first, and skips drivers that never raced', () => {
    const ladder: Ladder = {
      schemaVersion: 1,
      entries: {
        codex: entry({ driver: 'codex', rating: 1490 }),
        claude: entry({ driver: 'claude', rating: 1580 }),
        opencode: entry({ driver: 'opencode', rating: 1410 }),
      },
    };
    expect(ladderRows(ladder).map((r) => r.driver)).toEqual(['claude', 'codex', 'opencode']);
  });

  it('is empty when there is no ladder yet', () => {
    expect(ladderRows(null)).toEqual([]);
    expect(ladderRows({ schemaVersion: 1, entries: {} })).toEqual([]);
  });
});

describe('ratingDomain', () => {
  it('covers every row history so one scale fits the whole column', () => {
    const rows = [
      entry({ driver: 'claude', history: history([1500, 1580]) }),
      entry({ driver: 'gemini', history: history([1500, 1370]) }),
    ];
    expect(ratingDomain(rows)).toEqual([1370, 1580]);
  });

  it('is null when no row has any history', () => {
    expect(ratingDomain([entry({ driver: 'claude' })])).toBeNull();
    expect(ratingDomain([])).toBeNull();
  });
});
