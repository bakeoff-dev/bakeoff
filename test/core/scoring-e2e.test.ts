import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '@contract';
import { defaultDeps, runRace, type RaceInput } from '../../src/core/race';
import { readLadder, readRun } from '../../src/core/store';
import { makeRepo } from '../helpers/repo';
import { fakeExec } from '../helpers/exec';
import { exec } from '../../src/core/exec';
import type { Driver } from '../../src/core/drivers/types';
import type { Config } from '../../src/core/config';

const TOKENS = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 };

const driver = (id: 'claude' | 'codex', write: boolean): Driver => ({
  id,
  displayName: id,
  color: '#000',
  doctor: async () => ({ found: true, version: '0', authOk: true, notes: [] }),
  launch: async (i) => {
    if (write) writeFileSync(join(i.worktree, 'a.txt'), `fixed by ${id}`);
    return {
      exitCode: 0, status: 'ok', tokens: TOKENS, costUsd: 0.01,
      durationMs: 50, raw: null, model: null,
    };
  },
});

const baseConfig: Config = {
  test: 'true',
  agents: ['claude'],
  budget_usd: 1,
  timeout: '1m',
  ci_timeout: '0s',
  judge: { enabled: false, model: 'x' },
};

let seq = 0;

async function race(over: {
  config?: Partial<Config>;
  files?: Record<string, string>;
  scoreAgent?: ReturnType<typeof defaultDeps>['scoreAgent'];
} = {}) {
  const runId = `20260923-e${(seq += 1)}`;
  const repo = await makeRepo({ 'a.txt': 'broken', ...over.files });
  const { run: fake } = fakeExec([
    [/^git push/, {}],
    [/^gh label create/, {}],
    [/^gh pr create/, { stdout: 'https://github.com/o/r/pull/1\n' }],
    [/^gh pr checks/, { stdout: '[]' }],
  ]);
  const routed = async (cmd: string, args: string[], opts?: Parameters<typeof exec>[2]) =>
    cmd === 'gh' || (cmd === 'git' && args[0] === 'push') ? fake(cmd, args, opts) : exec(cmd, args, opts);

  const config = { ...baseConfig, ...over.config } as Config;
  const input: RaceInput = {
    repoRoot: repo.dir,
    repo: { owner: 'o', name: 'r', defaultBranch: 'main', baseSha: repo.sha },
    issue: { info: { number: 1, title: 'Fix a', url: 'u' }, body: 'a is broken', comments: [] },
    config,
    agents: [{ driver: 'claude', model: null }],
    caps: { budgetUsd: 1, timeoutMs: 60_000, maxTurns: null },
    runId,
  };
  const deps = defaultDeps();
  const rec = await runRace(input, {
    ...deps,
    exec: routed,
    getDriver: () => driver('claude', true),
    ...(over.scoreAgent !== undefined ? { scoreAgent: over.scoreAgent } : {}),
  });
  return { repo, rec, runId };
}

describe('a race scores end to end', () => {
  it('produces a score, a rank and a winner without being told to', async () => {
    const { rec } = await race();
    const claude = rec.agents[0]!;
    expect(claude.status).toBe('ok');
    expect(claude.score).not.toBeNull();
    expect(claude.rank).toBe(1);
    expect(rec.winner).toBe('claude');
    // the diff component is the cross-agent pass, so finalize ran too
    expect(claude.score?.components.map((c) => c.id)).toContain('diff');
  });

  it('runs the real baseline instead of reporting nothing', async () => {
    const { rec } = await race();
    expect(rec.baseline.testsGreen).toBe(true);
    expect(rec.baseline.setupError).toBeNull();
  });

  it('writes the ladder before the race finishes', async () => {
    const { repo, rec } = await race();
    const ladder = readLadder(repo.dir);
    expect(ladder.schemaVersion).toBe(SCHEMA_VERSION);
    expect(ladder.entries.claude).toBeDefined();
    expect(ladder.entries.claude?.history.some((h) => h.runId === rec.id)).toBe(true);
  });

  it('keeps the run when scoring throws: status and PR survive, score does not', async () => {
    const { repo, rec } = await race({
      scoreAgent: async () => {
        throw new Error('scorer exploded');
      },
    });
    const claude = rec.agents[0]!;
    expect(claude.status).toBe('ok');
    expect(claude.prUrl).toBe('https://github.com/o/r/pull/1');
    expect(claude.score).toBeNull();
    expect(claude.rank).toBeNull();
    expect(claude.logTail).toContain('scoring failed: scorer exploded');
    // the race still reached the end and wrote a final record
    expect(rec.finishedAt).not.toBeNull();
    expect(readRun(repo.dir, rec.id).agents[0]?.score).toBeNull();
  });
});

describe('setup runs in every agent worktree', () => {
  it('runs before the agent launches', async () => {
    const { repo, rec } = await race({ config: { setup: 'echo installed > .setup-ran' } });
    expect(rec.agents[0]?.status).toBe('ok');
    const log = readFileSync(`${repo.dir}/.bakeoff/logs/${rec.id}/claude.log`, 'utf8');
    expect(log).toContain('setup: echo installed');
  });

  it('crashes the agent when setup fails, and never launches it', async () => {
    const { rec } = await race({ config: { setup: 'exit 3' } });
    const claude = rec.agents[0]!;
    expect(claude.status).toBe('crashed');
    expect(claude.logTail).toContain('setup failed (exit 3)');
    expect(claude.prUrl).toBeNull();
    // the agent never ran, so there is nothing to score
    expect(claude.score).toBeNull();
  });

  it('crashes the agent when setup dirties tracked files', async () => {
    // a non-frozen install rewrites the lockfile, and that churn would otherwise be
    // committed into every agent's diff and scored as their work
    const { rec } = await race({ config: { setup: 'echo churn >> a.txt' } });
    expect(rec.agents[0]?.status).toBe('crashed');
    expect(rec.agents[0]?.logTail).toContain('setup modified tracked files');
  });

  it('tolerates setup leaving untracked build output', async () => {
    const { rec } = await race({ config: { setup: 'mkdir -p node_modules && echo x > node_modules/x' } });
    expect(rec.agents[0]?.status).toBe('ok');
  });
});

describe('a race that cannot check the issue says so', () => {
  it('flags a green baseline with no hidden tests', async () => {
    const { rec } = await race();
    expect(rec.baseline.testsGreen).toBe(true);
    expect(rec.noAcceptanceTest).toBe(true);
  });

  it('does not flag a race whose baseline was red, because the suite proves the fix', async () => {
    const { rec } = await race({ config: { test: 'exit 1' } });
    expect(rec.baseline.testsGreen).toBe(false);
    expect(rec.noAcceptanceTest).toBe(false);
  });

  it('records the test share of each diff, so discipline can leave it out', async () => {
    const { rec } = await race();
    const claude = rec.agents[0]!;
    expect(claude.testFilesTouched).toEqual([]);
    expect(claude.testLinesChanged).toBe(0);
    expect(claude.filesTouched.length).toBeGreaterThan(0);
  });
});
