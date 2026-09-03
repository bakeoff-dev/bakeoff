import { describe, expect, it } from 'vitest';
import type { RaceEvent } from '@contract';
import { progressRenderer } from '../../src/cli/render/progress';

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
    r.onEvent({ type: 'agent.started', at: 'x', driver: 'claude', branch: 'b' });
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
