import { describe, expect, it } from 'vitest';
import type { AgentLane } from '@contract';
import { costFillPct, elapsedOf, logColor } from '../../ui/src/components/Lane';
import { T } from '../../ui/src/theme';

const lane = (over: Partial<AgentLane>): AgentLane => ({
  driver: 'claude', status: 'running', branch: 'b', startedAt: null, costUsd: null, tokens: null,
  lastAction: '', filesTouched: 0, durationMs: null, exitCode: null, prUrl: null, prNumber: null,
  score: null, ...over,
});

describe('logColor', () => {
  it('reds errors, greens checks, dims the rest', () => {
    expect(logColor('Error: ENOENT')).toBe('rgba(248,113,113,.8)');
    expect(logColor('✓ export respects custom DPI')).toBe('rgba(74,222,128,.7)');
    expect(logColor('> bun test')).toBe(T.dim);
  });
});

describe('elapsedOf', () => {
  const now = Date.parse('2026-09-02T18:04:00.000Z');
  it('counts from startedAt while running', () => {
    expect(elapsedOf(lane({ startedAt: '2026-09-02T18:00:00.000Z' }), now)).toBe(240000);
  });
  it('uses the recorded duration once the agent has exited', () => {
    expect(elapsedOf(lane({ status: 'ok', startedAt: '2026-09-02T18:00:00.000Z', durationMs: 412000 }), now)).toBe(412000);
  });
  it('is zero when a running lane has no start time yet', () => {
    expect(elapsedOf(lane({}), now)).toBe(0);
  });
  it('never goes negative if the clock is behind the start time', () => {
    expect(elapsedOf(lane({ startedAt: '2026-09-02T18:10:00.000Z' }), now)).toBe(0);
  });
});

describe('costFillPct', () => {
  it('is a percentage of the budget, clamped to 100', () => {
    expect(costFillPct(1.5, 3)).toBe(50);
    expect(costFillPct(9, 3)).toBe(100);
  });
  it('is zero for unavailable cost or a nonsense budget', () => {
    expect(costFillPct(null, 3)).toBe(0);
    expect(costFillPct(1, 0)).toBe(0);
  });
});
