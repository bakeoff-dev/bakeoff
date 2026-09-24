import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { RaceEvent } from '@contract';
import { defaultDeps, runRace, type RaceInput } from '../../src/core/race';
import { makeRepo } from '../helpers/repo';
import { fakeExec } from '../helpers/exec';
import { exec, must, type Exec } from '../../src/core/exec';
import type { Driver } from '../../src/core/drivers/types';
import type { Config } from '../../src/core/config';

const POLL_MS = 20;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Long enough for several polls to land. */
const settle = () => sleep(POLL_MS * 10);

const baseConfig: Config = {
  test: 'true', agents: ['claude'], budget_usd: 1, timeout: '1m', ci_timeout: '0s',
  judge: { enabled: false, model: 'x' },
};

/** What Claude did in the demo race: shell writes and a mid-run commit. */
const shellWrites = async (wt: string): Promise<void> => {
  writeFileSync(join(wt, 'a.txt'), 'fixed');
  mkdirSync(join(wt, 'src', 'deep'), { recursive: true });
  writeFileSync(join(wt, 'src', 'deep', 'new.ts'), 'export {}\n');
  // state the agent should never be charged with
  mkdirSync(join(wt, '.bakeoff'), { recursive: true });
  writeFileSync(join(wt, '.bakeoff', 'scratch.json'), '{}');
  await settle();
};

/** A driver that does its work straight on disk and never emits a `file` event. */
function silentDriver(work: (worktree: string) => Promise<void>, end: 'ok' | 'throw'): Driver {
  return {
    id: 'claude', displayName: 'claude', color: '#000',
    doctor: async () => ({ found: true, version: '0', authOk: true, notes: [] }),
    launch: async (i) => {
      await work(i.worktree);
      if (end === 'throw') throw new Error('driver exploded');
      return { exitCode: 0, status: 'ok', tokens: null, costUsd: null, durationMs: 1, raw: null, model: null };
    },
  };
}

let seq = 0;
async function race(work: (wt: string) => Promise<void>, opts: { end?: 'ok' | 'throw'; setup?: string } = {}) {
  const runId = `20260902-f${(seq += 1)}`;
  const repo = await makeRepo({ 'a.txt': 'broken', 'bakeoff.yml': 'test: true\n' });
  const { run: fake } = fakeExec([[/^git push/, {}], [/^gh label create/, {}], [/^gh pr create/, { stdout: 'https://github.com/o/r/pull/1\n' }]]);
  const polls = { n: 0 };
  const routed: Exec = (cmd, args, o) => {
    if (cmd === 'git' && args[0] === '--no-optional-locks') polls.n += 1;
    return cmd === 'gh' || (cmd === 'git' && args[0] === 'push') ? fake(cmd, args, o) : exec(cmd, args, o);
  };
  const events: RaceEvent[] = [];
  const input: RaceInput = {
    repoRoot: repo.dir,
    repo: { owner: 'o', name: 'r', defaultBranch: 'main', baseSha: repo.sha },
    issue: { info: { number: 1, title: 'Fix a', url: 'https://github.com/o/r/issues/1' }, body: '', comments: [] },
    config: opts.setup ? { ...baseConfig, setup: opts.setup } : baseConfig,
    agents: [{ driver: 'claude', model: null }],
    caps: { budgetUsd: 1, timeoutMs: 60_000, maxTurns: null }, runId,
  };
  await runRace(input, {
    ...defaultDeps(),
    exec: routed,
    getDriver: () => silentDriver(work, opts.end ?? 'ok'),
    baseline: async () => ({ testsGreen: true, lintGreen: null, typecheckGreen: null, setupError: null }),
    scoreAgent: null, finalize: null, persistLadder: null,
    filesPollMs: POLL_MS,
    onEvent: (e) => events.push(e),
  });
  return Object.assign(events, { polls });
}

const progressFiles = (events: RaceEvent[]) =>
  events.flatMap((e) => (e.type === 'agent.progress' ? [e.filesTouched] : []));

describe('live files count', () => {
  it('counts files an agent writes through the shell, with no driver file event', async () => {
    const events = await race(shellWrites);
    // a.txt modified + src/deep/new.ts untracked; .bakeoff/ is ours, not the agent's
    expect(progressFiles(events)).toContain(2);
    expect(Math.max(...progressFiles(events))).toBe(2);
  });

  it('emits only when the count changes', async () => {
    const counts = progressFiles(await race(shellWrites));
    expect(counts.length).toBeGreaterThan(0);
    for (let k = 1; k < counts.length; k += 1) expect(counts[k]).not.toBe(counts[k - 1]);
  });

  it('counts from the base commit, so a commit mid-run does not reset the count', async () => {
    const counts = progressFiles(
      await race(async (wt) => {
        writeFileSync(join(wt, 'one.txt'), '1');
        await settle();
        await must('git', ['add', '-A'], { cwd: wt });
        await must('git', ['commit', '-q', '-m', 'wip'], { cwd: wt });
        await settle();
        writeFileSync(join(wt, 'two.txt'), '2');
        await settle();
      }),
    );
    expect(counts).toEqual([1, 2]);
  });

  it('does not charge the agent with untracked files left by setup', async () => {
    const counts = progressFiles(
      await race(
        async (wt) => {
          writeFileSync(join(wt, 'a.txt'), 'fixed');
          await settle();
        },
        { setup: 'mkdir -p build && echo x > build/out.js && echo y > setup.log' },
      ),
    );
    expect(counts).toEqual([1]);
  });

  it('stops polling once the agent exits, even when the driver throws', async () => {
    const events = await race(shellWrites, { end: 'throw' });
    expect(progressFiles(events)).toContain(2);
    const exited = events.findIndex((e) => e.type === 'agent.exited');
    const pollsAtEnd = events.polls.n;
    expect(pollsAtEnd).toBeGreaterThan(0);
    await sleep(POLL_MS * 5);
    expect(events.polls.n).toBe(pollsAtEnd);
    expect(events.slice(exited).some((e) => e.type === 'agent.progress')).toBe(false);
  });
});
