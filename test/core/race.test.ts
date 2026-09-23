import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentSpec } from '../../src/core/agentspec';
import { defaultDeps, runRace, type RaceInput } from '../../src/core/race';
import { readEvents, readRun } from '../../src/core/store';
import { makeRepo } from '../helpers/repo';
import { fakeExec } from '../helpers/exec';
import { exec } from '../../src/core/exec';
import type { Driver } from '../../src/core/drivers/types';
import type { Config } from '../../src/core/config';

const TOKENS = { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 };

const MULTILINE_ACTION = 'Bash git commit -q -m "$(cat <<\'EOF\'\r\nAdd list command with';

function fakeDriver(
  id: 'claude' | 'codex',
  behaviour: 'ok' | 'crash' | 'throw',
  reportedModel: string | null = null,
): Driver {
  return {
    id,
    displayName: id,
    color: '#000',
    doctor: async () => ({ found: true, version: '0', authOk: true, notes: [] }),
    launch: async (i) => {
      i.onEvent({ kind: 'action', text: 'Edit a.txt' });
      i.onEvent({ kind: 'action', text: MULTILINE_ACTION });
      i.onEvent({ kind: 'usage', tokens: TOKENS, model: 'gpt-5' });
      i.onEvent({ kind: 'usage', tokens: TOKENS, model: 'gpt-5' });
      if (behaviour === 'throw') throw new Error('driver exploded');
      if (behaviour === 'ok') {
        i.onEvent({ kind: 'file', path: 'a.txt' });
        writeFileSync(join(i.worktree, 'a.txt'), `fixed by ${id}`);
      }
      return {
        exitCode: behaviour === 'ok' ? 0 : 1,
        status: behaviour === 'ok' ? 'ok' : 'crashed',
        tokens: TOKENS,
        costUsd: 0.01,
        durationMs: 50,
        raw: null,
        model: reportedModel,
      };
    },
  };
}

const config: Config = {
  test: 'true',
  agents: ['claude'],
  budget_usd: 1,
  timeout: '1m',
  ci_timeout: '0s',
  judge: { enabled: false, model: 'x' },
};

let seq = 0;

async function setup(
  behaviours: { claude: 'ok' | 'crash' | 'throw'; codex: 'ok' | 'crash' | 'throw' },
  spy?: (cmd: string, args: string[], phase: 'enter' | 'exit') => void,
  opts: { specs?: AgentSpec[]; reportedModel?: string | null } = {},
) {
  const specs: AgentSpec[] = opts.specs ?? [
    { driver: 'claude', model: null },
    { driver: 'codex', model: null },
  ];
  // worktree paths are keyed by run id, so each test needs its own
  const runId = `20260902-t${(seq += 1)}`;
  const repo = await makeRepo({ 'a.txt': 'broken', 'bakeoff.yml': 'test: true\n' });
  // route git push / gh through a fake, everything else through the real exec
  const { run: fake, calls } = fakeExec([
    [/^git push/, {}],
    [/^gh label create/, {}],
    [/^gh pr create .*--head bakeoff\/1-claude/, { stdout: 'https://github.com/o/r/pull/1\n' }],
    [/^gh pr create .*--head bakeoff\/1-codex/, { stdout: 'https://github.com/o/r/pull/2\n' }],
  ]);
  const routed = async (cmd: string, args: string[], opts?: Parameters<typeof exec>[2]) => {
    spy?.(cmd, args, 'enter');
    try {
      return cmd === 'gh' || (cmd === 'git' && args[0] === 'push')
        ? await fake(cmd, args, opts)
        : await exec(cmd, args, opts);
    } finally {
      spy?.(cmd, args, 'exit');
    }
  };
  const input: RaceInput = {
    repoRoot: repo.dir,
    repo: { owner: 'o', name: 'r', defaultBranch: 'main', baseSha: repo.sha },
    issue: {
      info: { number: 1, title: 'Fix a', url: 'https://github.com/o/r/issues/1' },
      body: 'a is broken',
      comments: [],
    },
    config,
    agents: specs,
    caps: { budgetUsd: 1, timeoutMs: 60_000, maxTurns: null },
    runId,
  };
  const drivers = {
    claude: fakeDriver('claude', behaviours.claude, opts.reportedModel ?? null),
    codex: fakeDriver('codex', behaviours.codex),
  };
  const rec = await runRace(input, {
    ...defaultDeps(),
    exec: routed,
    getDriver: (id) => drivers[id as 'claude' | 'codex'],
    baseline: async () => ({ testsGreen: true, lintGreen: null, typecheckGreen: null }),
    scoreAgent: null,
    finalize: null,
  });
  return { repo, rec, calls };
}

describe('runRace', () => {
  it('runs agents in worktrees, publishes, writes record and events', async () => {
    const { repo, rec, calls } = await setup({ claude: 'ok', codex: 'crash' });

    expect(rec.id).toMatch(/^20260902-t\d+$/);
    expect(rec.packetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.baseline.testsGreen).toBe(true);

    const claude = rec.agents.find((a) => a.driver === 'claude')!;
    expect(claude.status).toBe('ok');
    expect(claude.prUrl).toBe('https://github.com/o/r/pull/1');
    expect(claude.prNumber).toBe(1);
    expect(claude.branch).toBe(`bakeoff/1-claude-${rec.id}`);

    const codex = rec.agents.find((a) => a.driver === 'codex')!;
    expect(codex.status).toBe('crashed');
    expect(codex.prUrl).toBeNull();

    expect(readRun(repo.dir, rec.id)).toEqual(rec);
    const types = readEvents(repo.dir, rec.id).map((e) => e.type);
    expect(types[0]).toBe('race.started');
    expect(types).toContain('agent.pr_opened');
    expect(types.at(-1)).toBe('race.finished');
    expect(calls.some((c) => c.startsWith('git push -u origin bakeoff/1-claude'))).toBe(true);
    expect(calls.some((c) => c.startsWith('git push -u origin bakeoff/1-codex'))).toBe(false);
  });

  it('keeps the record and the events file in agreement', async () => {
    const { repo, rec } = await setup({ claude: 'ok', codex: 'crash' });
    const events = readEvents(repo.dir, rec.id);
    const finished = events.at(-1);
    expect(finished?.type).toBe('race.finished');
    // the file is the source of truth: the terminal and SSE are views of it
    expect(finished?.type === 'race.finished' && finished.record).toEqual(rec);
    const started = events.find((e) => e.type === 'agent.started' && e.driver === 'codex');
    expect(started).toBeDefined();
    const exited = events.find((e) => e.type === 'agent.exited' && e.driver === 'codex');
    expect(exited?.type === 'agent.exited' && exited.status).toBe('crashed');
  });

  it('reports running token totals on agent.progress', async () => {
    const { repo, rec } = await setup({ claude: 'ok', codex: 'crash' });
    const progress = readEvents(repo.dir, rec.id).filter(
      (e) => e.type === 'agent.progress' && e.driver === 'claude',
    );
    expect(progress.length).toBeGreaterThan(0);
    const withTokens = progress.filter((e) => e.type === 'agent.progress' && e.tokens !== null);
    // the driver emitted usage; the live view must not show "- tok" for the whole race
    expect(withTokens.length).toBeGreaterThan(0);
    const last = withTokens.at(-1);
    // two usage events of the same size accumulate
    expect(last?.type === 'agent.progress' && last.tokens).toEqual({
      input: TOKENS.input * 2, output: TOKENS.output * 2, cacheRead: 0, cacheWrite: 0,
    });
  });

  it('normalises a multi-line action to one line before anyone renders it', async () => {
    const { repo, rec } = await setup({ claude: 'ok', codex: 'crash' });
    const progress = readEvents(repo.dir, rec.id).filter((e) => e.type === 'agent.progress');
    const actions = progress.map((e) => (e.type === 'agent.progress' ? e.lastAction : ''));
    expect(actions.some((a) => a.includes('Add list command with'))).toBe(true);
    // a raw newline here becomes an extra terminal row the live view cannot account for
    for (const a of actions) expect(a).not.toMatch(/[\r\n\t]/);
  });

  it('records the requested model and announces it on agent.started', async () => {
    const { repo, rec } = await setup({ claude: 'ok', codex: 'crash' }, undefined, {
      specs: [
        { driver: 'claude', model: 'claude-sonnet-5' },
        { driver: 'codex', model: null },
      ],
    });
    expect(rec.agents.find((a) => a.driver === 'claude')?.model).toBe('claude-sonnet-5');
    expect(rec.agents.find((a) => a.driver === 'codex')?.model).toBeNull();

    const started = readEvents(repo.dir, rec.id).filter((e) => e.type === 'agent.started');
    const claudeStart = started.find((e) => e.type === 'agent.started' && e.driver === 'claude');
    expect(claudeStart?.type === 'agent.started' && claudeStart.model).toBe('claude-sonnet-5');
  });

  it('prefers the model the CLI reports over the one we asked for', async () => {
    // the CLI is the authority on what actually ran: an alias or a fallback resolves here
    const { rec } = await setup({ claude: 'ok', codex: 'crash' }, undefined, {
      specs: [
        { driver: 'claude', model: 'sonnet' },
        { driver: 'codex', model: null },
      ],
      reportedModel: 'claude-sonnet-5',
    });
    expect(rec.agents.find((a) => a.driver === 'claude')?.model).toBe('claude-sonnet-5');
  });

  it('falls back to the requested model when the CLI reports none', async () => {
    const { rec } = await setup({ claude: 'ok', codex: 'crash' }, undefined, {
      specs: [
        { driver: 'claude', model: 'claude-opus-5' },
        { driver: 'codex', model: null },
      ],
      reportedModel: null,
    });
    expect(rec.agents.find((a) => a.driver === 'claude')?.model).toBe('claude-opus-5');
  });

  it('survives a driver that throws, recording it as crashed', async () => {
    const { rec } = await setup({ claude: 'throw', codex: 'crash' });
    const claude = rec.agents.find((a) => a.driver === 'claude')!;
    expect(claude.status).toBe('crashed');
    expect(claude.prUrl).toBeNull();
    expect(claude.logTail).toContain('driver threw');
  });

  it('serializes the git calls that write the shared .git/config', async () => {
    // git locks .git/config per repo, so two agents setting up at once would fail
    let inFlight = 0;
    let maxInFlight = 0;
    const isRepoWide = (cmd: string, args: string[]) =>
      cmd === 'git' && (args[0] === 'worktree' || args[0] === 'sparse-checkout');
    await setup({ claude: 'ok', codex: 'ok' }, (cmd, args, phase) => {
      if (!isRepoWide(cmd, args)) return;
      if (phase === 'enter') {
        inFlight += 1;
        maxInFlight = Math.max(maxInFlight, inFlight);
      } else {
        inFlight -= 1;
      }
    });
    expect(maxInFlight).toBe(1);
  });

  it('cleans up worktrees and leaves .bakeoff untouched in the branch', async () => {
    const { repo, rec } = await setup({ claude: 'ok', codex: 'crash' });
    const { existsSync } = await import('node:fs');
    const { worktreeDir } = await import('../../src/core/worktree');
    for (const a of rec.agents) expect(existsSync(worktreeDir(rec.id, a.driver))).toBe(false);
    // the run state still lives in the host repo
    expect(existsSync(join(repo.dir, '.bakeoff', 'runs', `${rec.id}.json`))).toBe(true);
  });
});
