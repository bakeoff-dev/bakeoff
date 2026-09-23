import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { SCHEMA_VERSION, type Ladder, type RunRecord } from '@contract';
import { readRunJson } from '../../src/contract/migrate';
import { finalTable, modelLabel } from '../../src/cli/render/table';

const rec: RunRecord = readRunJson(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

const ladder: Ladder = {
  schemaVersion: SCHEMA_VERSION,
  entries: {
    'claude:claude-opus-5': {
      driver: 'claude', model: 'claude-opus-5', mu: 27, sigma: 8, rating: 1240,
      races: 1, wins: 1, avgCostUsd: 1.42, avgDurationMs: 412_000, history: [],
    },
    'codex:gpt-5.6-sol': {
      driver: 'codex', model: 'gpt-5.6-sol', mu: 25, sigma: 8, rating: 1180,
      races: 1, wins: 0, avgCostUsd: 0.97, avgDurationMs: 388_000, history: [],
    },
  },
};

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');

describe('the final table', () => {
  afterEach(() => {
    delete process.env.NO_COLOR;
    delete process.env.FORCE_COLOR;
  });

  it('heads with the repo and issue', () => {
    process.env.NO_COLOR = '1';
    const out = finalTable({ record: rec });
    expect(out).toContain('bakeoff  bakeoff-dev/scratch #7  Fix off-by-one in paginate()');
  });

  it('lists agents in rank order, with the winner first', () => {
    process.env.NO_COLOR = '1';
    const rows = finalTable({ record: rec }).split('\n').filter((l) => /^\s+\d\s/.test(l));
    expect(rows[0]).toMatch(/^\s+1\s+Claude Code/);
    expect(rows[1]).toMatch(/^\s+2\s+Codex/);
  });

  it('carries the numbers a reader needs on one line', () => {
    process.env.NO_COLOR = '1';
    const line = finalTable({ record: rec }).split('\n').find((l) => l.includes('Claude Code'))!;
    expect(line).toContain('claude-opus-5');
    expect(line).toContain('$1.42');
    expect(line).toContain('6:52');
    expect(line).toContain('+18 -4');
    expect(line).toContain('2 files');
    expect(line).toContain('PR #12');
  });

  it('shows a status word instead of a score for an agent that did not finish', () => {
    process.env.NO_COLOR = '1';
    const line = finalTable({ record: rec }).split('\n').find((l) => l.includes('OpenCode'))!;
    // opencode timed out in the fixture: no score, no diff, no test count
    expect(line).toContain('timed out');
    expect(line).not.toMatch(/\+\d+ -\d+/);
  });

  it('says auto when the agent ran on whatever the provider picked', () => {
    process.env.NO_COLOR = '1';
    const line = finalTable({ record: rec }).split('\n').find((l) => l.includes('OpenCode'))!;
    expect(line).toContain('auto');
  });

  it('prints the ladder when there is one, and the run record always', () => {
    process.env.NO_COLOR = '1';
    const out = finalTable({ record: rec, ladder });
    expect(out).toContain('Ladder      Claude Code 1240  Codex 1180');
    expect(out).toContain('Run record  .bakeoff/runs/20260902-k7q2.json');
  });

  it('omits the scoreboard line until the HTML export exists', () => {
    process.env.NO_COLOR = '1';
    expect(finalTable({ record: rec })).not.toContain('Scoreboard');
    expect(finalTable({ record: rec, scoreboardPath: '.bakeoff/runs/x.html' })).toContain(
      'Scoreboard  .bakeoff/runs/x.html',
    );
  });

  it('is plain text under NO_COLOR', () => {
    process.env.NO_COLOR = '1';
    const out = finalTable({ record: rec, ladder });
    expect(out).toBe(plain(out));
  });

  it('paints only the winner row when colour is on', () => {
    process.env.FORCE_COLOR = '3';
    const lines = finalTable({ record: rec }).split('\n');
    const winner = lines.find((l) => plain(l).includes('Claude Code'))!;
    const second = lines.find((l) => plain(l).includes('Codex'))!;
    // Claude's identity colour paints the winning row; Codex's never paints its own.
    expect(winner).toContain('\x1b[38;2;245;158;107m');
    expect(second).not.toContain('\x1b[38;2;94;200;206m');
  });

  it('carries no emoji and no box drawing', () => {
    process.env.NO_COLOR = '1';
    const out = finalTable({ record: rec, ladder });
    expect(/\p{Extended_Pictographic}/u.test(out)).toBe(false);
    expect(/[─-╿]/.test(out)).toBe(false);
  });

  it('flattens an issue title that spans lines', () => {
    process.env.NO_COLOR = '1';
    const out = finalTable({ record: { ...rec, issue: { ...rec.issue, title: 'a\nb' } } });
    expect(out).toContain('#7  a b');
  });

  it('shows the first tamper flag at the end of the row', () => {
    process.env.NO_COLOR = '1';
    const tampered: RunRecord = {
      ...rec,
      agents: rec.agents.map((a, i) =>
        i === 0 && a.score
          ? {
              ...a,
              score: {
                ...a.score,
                tamperFlags: [{ rule: 'test_skipped' as const, file: 'export.test.ts', detail: 'x' }],
              },
            }
          : a,
      ),
    };
    const line = finalTable({ record: tampered }).split('\n').find((l) => l.includes('Claude Code'))!;
    expect(line).toContain('test skipped: export.test.ts');
  });
});

describe('modelLabel', () => {
  it('names the model when one was pinned', () => {
    expect(modelLabel('claude-opus-5', 'claude-opus-5')).toBe('claude-opus-5');
  });

  it('marks a provider-chosen model as auto', () => {
    expect(modelLabel('gpt-5.6-sol', null)).toBe('auto: gpt-5.6-sol');
  });

  it('falls back to auto when nothing is known', () => {
    expect(modelLabel(null, null)).toBe('auto');
    expect(modelLabel(null, 'claude-opus-5')).toBe('claude-opus-5');
  });
});
