import { describe, expect, it } from 'vitest';
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { RunRecordSchema, type AgentResult, type ScoreComponent } from '@contract';
import { ConfigSchema, type Config } from '../../../src/core/config';
import type { ScoreCtx } from '../../../src/core/race';
import { finalizeScores, maxPossibleOf, rankAgents, scoreAgent, totalOf } from '../../../src/core/scorer/index';
import { makeRepo } from '../../helpers/repo';

const fixture = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));
const first = fixture.agents[0]!;

/** Everything finalizeScores is expected to compute, blanked out. */
const strip = (a: AgentResult): AgentResult =>
  a.score
    ? {
        ...a,
        rank: null,
        score: {
          ...a.score,
          total: 0,
          maxPossible: 0,
          components: a.score.components.map((c) => (c.id === 'diff' ? { ...c, awarded: null, detail: '' } : c)),
        },
      }
    : a;

describe('totalOf and maxPossibleOf', () => {
  const components: ScoreComponent[] = [
    { id: 'visible_tests', max: 50, awarded: 50, detail: '' },
    { id: 'lint', max: 7.5, awarded: 0, detail: '' },
    { id: 'ci', max: 10, awarded: null, detail: 'n/a' },
  ];
  it('counts awarded points and only the configured maxes', () => {
    expect(totalOf(components, 0)).toBe(50);
    expect(maxPossibleOf(components)).toBe(57.5);
  });
  it('keeps a tampered total negative rather than clamping', () => {
    expect(totalOf([{ id: 'diff', max: 10, awarded: 2, detail: '' }], -25)).toBe(-23);
  });
});

describe('finalizeScores', () => {
  it('reproduces the fixture totals, ranks and winner order', () => {
    const out = finalizeScores(fixture.agents.map(strip), fixture.configured);
    expect(out).toEqual(fixture.agents);
  });

  it('passes each agent model through untouched', () => {
    const out = finalizeScores(fixture.agents.map(strip), fixture.configured);
    expect(out.map((a) => [a.driver, a.model])).toEqual(fixture.agents.map((a) => [a.driver, a.model]));
  });

  it('leaves a crashed agent unscored and unranked', () => {
    const dead: AgentResult = { ...first, driver: 'opencode', status: 'crashed', score: null, rank: 3 };
    const out = finalizeScores([...fixture.agents.map(strip), dead], fixture.configured);
    const back = out.find((a) => a.driver === 'opencode' && a.status === 'crashed')!;
    expect(back.score).toBeNull();
    expect(back.rank).toBeNull();
  });

  it('tiebreaks on cost then duration; nulls last', () => {
    const mk = (driver: AgentResult['driver'], total: number, cost: number | null, dur: number): AgentResult => ({
      ...first,
      driver,
      costUsd: cost,
      durationMs: dur,
      score: { ...first.score!, total },
    });
    const r = rankAgents([mk('claude', 50, null, 1), mk('codex', 50, 2, 9), mk('opencode', 50, 2, 3)]);
    expect(r.map((a) => [a.driver, a.rank])).toEqual([
      ['opencode', 1],
      ['codex', 2],
      ['claude', 3],
    ]);
  });
});

const ctx = (repo: { dir: string; sha: string }, config: Partial<Config>): ScoreCtx => ({
  worktree: repo.dir,
  repoRoot: repo.dir,
  baseSha: repo.sha,
  config: ConfigSchema.parse({ agents: ['claude'], ...config }),
  agent: { ...first, score: null },
  hiddenDir: join(repo.dir, '.bakeoff', 'hidden'),
  repo: fixture.repo,
});

describe('scoreAgent', () => {
  it('scores a green worktree with a tamper flag', async () => {
    const repo = await makeRepo({ 'test/a.sh': 'exit 0', 'src/x.ts': '1\n' });
    await repo.commit({ 'src/x.ts': '2\n', 'vitest.config.ts': '' }, 'agent work');
    const s = await scoreAgent(ctx(repo, { test: 'sh test/a.sh', typecheck: 'true' }));
    expect(s.filesTouched.sort()).toEqual(['src/x.ts', 'vitest.config.ts']);
    expect(s.linesAdded).toBe(1);
    expect(s.linesRemoved).toBe(1);
    expect(s.score!.tamperFlags[0]!.rule).toBe('config_write');
    expect(s.score!.tamperPenalty).toBe(-25);
    const by = (id: ScoreComponent['id']) => s.score!.components.find((c) => c.id === id)!;
    expect(by('visible_tests').awarded).toBe(50);
    expect(by('typecheck').awarded).toBe(15);
    expect(by('lint')).toMatchObject({ max: 0, awarded: null });
    expect(by('hidden_tests').awarded).toBeNull();
    expect(by('ci').awarded).toBeNull();
    expect(by('judge').awarded).toBeNull();
    expect(by('diff').awarded).toBeNull(); // filled by finalizeScores, which needs every agent
    expect(s.score!.total).toBe(40);
  });

  // Scoring restores the test paths and copies the hidden tests into the worktree. Both
  // land before the components run, so tamper and diff have to read the tree first.
  it('flags a deleted test it is about to restore, and never flags its own hidden copy', async () => {
    const repo = await makeRepo({ 'test/a.sh': 'exit 0', 'src/x.ts': '1\n' });
    rmSync(join(repo.dir, 'test/a.sh'));
    await repo.commit({ 'src/x.ts': '2\n' }, 'delete the test');
    const hiddenDir = join(repo.dir, '.bakeoff', 'hidden');
    mkdirSync(hiddenDir, { recursive: true });
    writeFileSync(join(hiddenDir, 'h.sh'), 'test -f src/x.ts');
    const s = await scoreAgent(
      ctx(repo, {
        test: 'sh test/a.sh',
        hidden_tests: { source: '.bakeoff/hidden', dest: 'tests/hidden', command: 'sh tests/hidden/h.sh' },
      }),
    );
    expect(s.score!.tamperFlags.map((f) => f.rule)).toEqual(['test_deleted']);
    expect(s.score!.tamperPenalty).toBe(-25);
    expect(s.filesTouched.sort()).toEqual(['src/x.ts', 'test/a.sh']);
    const by = (id: ScoreComponent['id']) => s.score!.components.find((c) => c.id === id)!;
    expect(by('visible_tests')).toMatchObject({ max: 30, awarded: 30 });
    expect(by('hidden_tests')).toMatchObject({ max: 20, awarded: 20 });
  });

  it('splices in the CI component the race polled for it', async () => {
    const repo = await makeRepo({ 'src/x.ts': '1\n' });
    await repo.commit({ 'src/x.ts': '2\n' }, 'agent work');
    const ci: ScoreComponent = { id: 'ci', max: 10, awarded: 10, detail: '3/3 checks passed' };
    const s = await scoreAgent(ctx(repo, { test: 'true' }), null, ci);
    expect(s.score!.components.find((c) => c.id === 'ci')).toEqual(ci);
    expect(s.score!.total).toBe(60);
    expect(s.score!.maxPossible).toBe(60);
  });

  it('notes a red baseline on the visible-tests component', async () => {
    const repo = await makeRepo({ 'src/x.ts': '1\n' });
    await repo.commit({ 'src/x.ts': '2\n' }, 'agent work');
    const s = await scoreAgent(ctx(repo, { test: 'exit 1' }), false);
    expect(s.score!.components.find((c) => c.id === 'visible_tests')!.detail).toContain('baseline red');
  });
});
