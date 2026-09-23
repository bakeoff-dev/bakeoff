import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Ladder } from '@contract';
import { ladderTable } from '../../src/cli/commands/ladder';

const entry = (over: Partial<Ladder['entries'][string]> & { driver: 'claude' | 'cursor' }) => ({
  model: null, mu: 25, sigma: 8, rating: 1000, races: 1, wins: 0,
  avgCostUsd: 0.5, avgDurationMs: 120_000, history: [], ...over,
});

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('bakeoff ladder', () => {
  it('says so when nothing has raced yet', () => {
    expect(ladderTable({ schemaVersion: SCHEMA_VERSION, entries: {} })).toMatch(/No races yet/);
  });

  it('shows a null model as auto', () => {
    process.env.NO_COLOR = '1';
    const out = ladderTable({
      schemaVersion: SCHEMA_VERSION,
      entries: { cursor: entry({ driver: 'cursor' }) },
    });
    expect(out).toContain('Cursor');
    expect(out).toContain('auto');
    delete process.env.NO_COLOR;
  });

  it('names a pinned model and sorts by rating', () => {
    process.env.NO_COLOR = '1';
    const out = plain(
      ladderTable({
        schemaVersion: SCHEMA_VERSION,
        entries: {
          cursor: entry({ driver: 'cursor', rating: 900 }),
          'claude:claude-opus-5': entry({ driver: 'claude', model: 'claude-opus-5', rating: 1200, wins: 2 }),
        },
      }),
    );
    const rows = out.split('\n').slice(1);
    expect(rows[0]).toContain('claude-opus-5');
    expect(rows[0]).toContain('1200');
    expect(rows[1]).toContain('auto');
    delete process.env.NO_COLOR;
  });

  it('renders an unavailable average cost as n/a, never zero', () => {
    process.env.NO_COLOR = '1';
    const out = ladderTable({
      schemaVersion: SCHEMA_VERSION,
      entries: { cursor: entry({ driver: 'cursor', avgCostUsd: null }) },
    });
    expect(out).toContain('n/a');
    expect(out).not.toContain('$0.00');
    delete process.env.NO_COLOR;
  });
});
