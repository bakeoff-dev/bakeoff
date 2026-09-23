import { describe, expect, it } from 'vitest';
import type { RaceEvent } from '@contract';
import { progressRenderer } from '../../src/cli/render/progress';
import { FakeTerm } from '../helpers/term';

function fakeOut(isTTY: boolean) {
  const chunks: string[] = [];
  const out = {
    isTTY,
    columns: 100,
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
  } as unknown as NodeJS.WriteStream;
  return { out, chunks, text: () => chunks.join('') };
}

const started: RaceEvent = {
  type: 'race.started',
  at: '2026-09-02T00:00:00.000Z',
  runId: 'r1',
  issue: { number: 7, title: 'Fix pagination', url: 'https://github.com/o/r/issues/7' },
  repo: { owner: 'o', name: 'r', defaultBranch: 'main', baseSha: 'abc' },
  agents: ['claude', 'codex'],
  caps: { budgetUsd: 3, timeoutMs: 1000, maxTurns: null },
  baseline: { testsGreen: true, lintGreen: null, typecheckGreen: null },
};

describe('progressRenderer', () => {
  it('prints nothing when stdout is not a TTY', () => {
    const { out, text } = fakeOut(false);
    const r = progressRenderer(out);
    r.onEvent(started);
    r.stop();
    expect(text()).toBe('');
  });

  it('renders a lane per agent with the issue header', () => {
    process.env.NO_COLOR = '1';
    const { out, text } = fakeOut(true);
    const r = progressRenderer(out);
    r.onEvent(started);
    const frame = text();
    expect(frame).toContain('o/r #7  Fix pagination');
    expect(frame).toContain('Claude Code');
    expect(frame).toContain('Codex');
    expect(frame).toContain('2 of 2 running');
    expect(frame).toContain('$3.00');
    r.stop();
    delete process.env.NO_COLOR;
  });

  it('redraws in place rather than scrolling, and clears on stop', () => {
    process.env.NO_COLOR = '1';
    const { out, chunks } = fakeOut(true);
    const r = progressRenderer(out);
    r.onEvent(started);
    const firstLines = (chunks.at(-1) ?? '').split('\n').length - 1;
    r.onEvent({ type: 'agent.started', at: 'x', driver: 'claude', branch: 'b', model: null });
    // second draw moves the cursor up by exactly the number of lines it drew
    expect(chunks.at(-2)).toBe(`\x1b[${firstLines}A\x1b[J`);
    r.stop();
    expect(chunks.at(-1)).toMatch(/\x1b\[\d+A\x1b\[J$/);
    delete process.env.NO_COLOR;
  });

  it('shows the last action dimmed under its agent', () => {
    process.env.NO_COLOR = '1';
    const { out, chunks } = fakeOut(true);
    const r = progressRenderer(out);
    r.onEvent(started);
    r.onEvent({
      type: 'agent.progress', at: 'x', driver: 'claude', costUsd: 1.2,
      tokens: null, lastAction: 'Edit src/paginate.ts', filesTouched: 3,
    });
    const frame = chunks.at(-1) ?? '';
    expect(frame).toContain('Edit src/paginate.ts');
    expect(frame).toContain('3 files');
    r.stop();
    delete process.env.NO_COLOR;
  });
});

describe('progressRenderer redraw under a wrapping terminal', () => {
  const started2: RaceEvent = {
    type: 'race.started',
    at: '2026-09-23T00:00:00.000Z',
    runId: '20260923-9c2b',
    issue: { number: 3, title: 'Add a --reverse flag to the list command', url: 'https://github.com/bakeoff-dev/scratch/issues/3' },
    repo: { owner: 'bakeoff-dev', name: 'scratch', defaultBranch: 'main', baseSha: 'abc' },
    agents: ['claude'],
    caps: { budgetUsd: 3, timeoutMs: 300_000, maxTurns: null },
    baseline: { testsGreen: null, lintGreen: null, typecheckGreen: null },
  };

  const drive = (term: FakeTerm, frames: number) => {
    const r = progressRenderer(term.stream);
    r.onEvent(started2);
    for (let i = 0; i < frames; i += 1) {
      r.onEvent({
        type: 'agent.progress', at: 'x', driver: 'claude', costUsd: 0.53,
        tokens: { input: 20, output: 2605, cacheRead: 300_308, cacheWrite: 23_783 },
        lastAction: 'Bash /opt/homebrew/bin/bun test', filesTouched: 0,
      });
    }
    return r;
  };

  it('replaces the frame rather than accumulating, at any terminal width', () => {
    process.env.NO_COLOR = '1';
    const bad: string[] = [];
    for (let columns = 20; columns <= 200; columns += 1) {
      const one = new FakeTerm(columns);
      drive(one, 1);
      const many = new FakeTerm(columns);
      drive(many, 8);
      // eight redraws must occupy exactly the same rows as one
      if (many.rows.length !== one.rows.length) {
        bad.push(`columns=${columns}: 1 frame=${one.rows.length} rows, 8 frames=${many.rows.length} rows`);
      }
      const headers = many.countMatching(/bakeoff-dev\/scratch #3/);
      if (headers > 1) bad.push(`columns=${columns}: ${headers} stale headers`);
    }
    expect(bad).toEqual([]);
    delete process.env.NO_COLOR;
  });

  it('wraps nothing: every emitted line fits the terminal', () => {
    process.env.NO_COLOR = '1';
    for (const columns of [20, 30, 40, 60, 76, 80, 81, 82, 100, 200]) {
      const emitted: string[] = [];
      const term = new FakeTerm(columns);
      const stream = {
        isTTY: true, columns,
        write: (s: string) => { emitted.push(s); term.write(s); return true; },
      } as unknown as NodeJS.WriteStream;
      const r = progressRenderer(stream);
      r.onEvent(started2);
      const body = emitted.at(-1) ?? '';
      for (const line of body.split('\n')) {
        expect(FakeTerm.width(line), `columns=${columns} line=${JSON.stringify(line)}`).toBeLessThan(columns);
      }
      r.stop();
    }
    delete process.env.NO_COLOR;
  });

  it('leaves a clean screen after stop()', () => {
    process.env.NO_COLOR = '1';
    const term = new FakeTerm(76);
    const r = drive(term, 5);
    r.stop();
    expect(term.screen().filter((l) => l.trim() !== '')).toEqual([]);
    delete process.env.NO_COLOR;
  });
});

describe('progressRenderer on resize', () => {
  it('does not clear rows it can no longer account for', () => {
    process.env.NO_COLOR = '1';
    const handlers: Record<string, () => void> = {};
    const writes: string[] = [];
    const out = {
      isTTY: true, columns: 100,
      write: (s: string) => { writes.push(s); return true; },
      on: (ev: string, fn: () => void) => { handlers[ev] = fn; },
      off: () => {},
    } as unknown as NodeJS.WriteStream;
    const r = progressRenderer(out);
    r.onEvent(started);
    writes.length = 0;
    handlers.resize?.();
    r.onEvent({ type: 'agent.started', at: 'x', driver: 'claude', branch: 'b', model: null });
    // no cursor-up: the rows on screen re-wrapped and their count is unknown
    expect(writes.some((w) => /\x1b\[\d+A/.test(w))).toBe(false);
    r.stop();
    delete process.env.NO_COLOR;
  });
});

describe('progressRenderer with hostile action text', () => {
  // Verbatim from the recorded Warp session (20260923, 120 cols): Claude ran a heredoc
  // commit message, so the tool argument the driver copied carried a real newline.
  const RECORDED_ACTION =
    'Bash git add list.ts list.test.ts && git commit -q -m "$(cat <<\'EOF\'\r\nAdd list command with';

  const started3: RaceEvent = {
    type: 'race.started', at: 'x', runId: '20260923-mosj',
    issue: { number: 3, title: 'Add a --reverse flag to the list command', url: 'u' },
    repo: { owner: 'bakeoff-dev', name: 'scratch', defaultBranch: 'main', baseSha: 'a' },
    agents: ['claude'], caps: { budgetUsd: 3, timeoutMs: 1, maxTurns: null },
    baseline: { testsGreen: null, lintGreen: null, typecheckGreen: null },
  };

  const frameHeight = (action: string, columns = 120) => {
    const term = new FakeTerm(columns);
    const r = progressRenderer(term.stream);
    r.onEvent(started3);
    r.onEvent({
      type: 'agent.progress', at: 'x', driver: 'claude', costUsd: 0.5,
      tokens: null, lastAction: action, filesTouched: 2,
    });
    const height = term.rows.length;
    r.stop();
    return height;
  };

  it('an action with an embedded newline does not make the frame taller', () => {
    process.env.NO_COLOR = '1';
    expect(frameHeight(RECORDED_ACTION)).toBe(frameHeight('Bash git add list.ts'));
    delete process.env.NO_COLOR;
  });

  it('strands nothing when the recorded action is replayed', () => {
    process.env.NO_COLOR = '1';
    const term = new FakeTerm(120);
    const r = progressRenderer(term.stream);
    r.onEvent(started3);
    for (let i = 0; i < 6; i += 1) {
      r.onEvent({
        type: 'agent.progress', at: 'x', driver: 'claude', costUsd: 0.5,
        tokens: null, lastAction: RECORDED_ACTION, filesTouched: 2,
      });
    }
    expect(term.countMatching(/bakeoff-dev\/scratch #3/)).toBe(1);
    r.stop();
    expect(term.screen().filter((l) => l.trim() !== '')).toEqual([]);
    delete process.env.NO_COLOR;
  });

  it('writes no row containing a control character', () => {
    process.env.NO_COLOR = '1';
    const writes: string[] = [];
    const term = new FakeTerm(120);
    const stream = {
      isTTY: true, columns: 120,
      write: (s: string) => { writes.push(s); term.write(s); return true; },
    } as unknown as NodeJS.WriteStream;
    const r = progressRenderer(stream);
    r.onEvent(started3);
    r.onEvent({
      type: 'agent.progress', at: 'x', driver: 'claude', costUsd: 0.5,
      tokens: null, lastAction: `${RECORDED_ACTION}\u0007\u001b[31m`, filesTouched: 2,
    });
    const body = writes.at(-1) ?? '';
    for (const line of body.split('\n')) {
      // colour codes are allowed; nothing else non-printable is
      expect(/[\u0000-\u0008\u000b-\u001a\u001c-\u001f]/.test(line)).toBe(false);
    }
    r.stop();
    delete process.env.NO_COLOR;
  });
});
