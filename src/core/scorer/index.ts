import type { AgentResult, Configured, ScoreBreakdown, ScoreComponent } from '@contract';
import type { Config } from '../config';
import type { ScoreCtx } from '../race';
import { defaultTestPaths } from './checks';
import { diffDiscipline, diffStats } from './diff';
import { checkComponents } from './lint';
import { tamperFlags } from './tamper';
import { hiddenTestsComponent, visibleTestsComponent } from './tests';

export const TAMPER_PENALTY = -25;
const round1 = (n: number) => Math.round(n * 10) / 10;

/** The denominator: components that did not run are not part of what was on offer. */
export function maxPossibleOf(components: ScoreComponent[]): number {
  return round1(components.filter((c) => c.awarded !== null).reduce((s, c) => s + c.max, 0));
}

/** Raw, so a tampered run can read negative; the display clamps, the record does not. */
export function totalOf(components: ScoreComponent[], tamperPenalty: number): number {
  return round1(components.reduce((s, c) => s + (c.awarded ?? 0), 0) + tamperPenalty);
}

/**
 * Total desc, then cost asc with null last, then duration asc. Only agents that finished
 * with a score are ranked; the rest keep `rank: null` and trail the ranked ones in order.
 */
export function rankAgents(agents: AgentResult[]): AgentResult[] {
  const finished = (a: AgentResult) => a.status === 'ok' && a.score !== null;
  const ranked = agents
    .filter(finished)
    .sort(
      (x, y) =>
        y.score!.total - x.score!.total ||
        (x.costUsd ?? Infinity) - (y.costUsd ?? Infinity) ||
        x.durationMs - y.durationMs,
    )
    .map((a, i) => ({ ...a, rank: i + 1 }));
  return [...ranked, ...agents.filter((a) => !finished(a)).map((a) => ({ ...a, rank: null }))];
}

/**
 * Everything that can be judged from one worktree. `diff` needs every agent's numbers and
 * so is left to finalizeScores; `ci` is polled by the race once the PR exists and handed
 * back here; `judge` waits for Task 36.
 *
 * Order matters: tamper and the diff stats read the agent's commits before the visible-test
 * restore and the hidden-test copy put the scorer's own files into the worktree.
 */
export async function scoreAgent(
  ctx: ScoreCtx,
  baselineGreen: boolean | null = null,
  /** May be a promise: it is only awaited once the local checks are done, so both run at once. */
  ci: ScoreComponent | null | Promise<ScoreComponent | null> = null,
): Promise<Pick<AgentResult, 'score' | 'filesTouched' | 'linesAdded' | 'linesRemoved' | 'testFilesTouched' | 'testLinesChanged'>> {
  const cfg: Config = ctx.config;
  const testPaths = cfg.test_paths ?? (await defaultTestPaths(ctx.worktree, ctx.baseSha));
  const stats = await diffStats(ctx.worktree, ctx.baseSha, testPaths);
  const flags = await tamperFlags({
    worktree: ctx.worktree,
    baseSha: ctx.baseSha,
    testPaths,
    hiddenDest: cfg.hidden_tests?.dest ?? null,
  });

  const visible = await visibleTestsComponent({
    worktree: ctx.worktree,
    baseSha: ctx.baseSha,
    config: cfg,
    testPaths,
    hiddenConfigured: !!cfg.hidden_tests,
    baselineGreen,
  });
  const hidden: ScoreComponent = cfg.hidden_tests
    ? await hiddenTestsComponent({ worktree: ctx.worktree, hiddenDir: ctx.hiddenDir, hidden: cfg.hidden_tests })
    : { id: 'hidden_tests', max: 20, awarded: null, detail: 'n/a' };
  const [typecheck, lint] = await checkComponents({ worktree: ctx.worktree, config: cfg });

  const settledCi = await ci;
  const components: ScoreComponent[] = [
    visible,
    hidden,
    typecheck,
    lint,
    settledCi ?? { id: 'ci', max: 10, awarded: null, detail: 'n/a' },
    { id: 'diff', max: 10, awarded: null, detail: '' },
    { id: 'judge', max: 15, awarded: null, detail: 'n/a' },
  ];
  const tamperPenalty = flags.length ? TAMPER_PENALTY : 0;
  const score: ScoreBreakdown = {
    components,
    tamperFlags: flags,
    tamperPenalty,
    total: totalOf(components, tamperPenalty),
    maxPossible: maxPossibleOf(components),
  };
  return {
    score,
    filesTouched: stats.files,
    linesAdded: stats.added,
    linesRemoved: stats.removed,
    testFilesTouched: stats.testFiles,
    testLinesChanged: stats.testLines,
  };
}

/**
 * The cross-agent pass: diff discipline is relative to the other finishers, so it can only
 * be awarded once every agent is in. Everything else on the agent is passed through.
 */
export function finalizeScores(agents: AgentResult[], _configured: Configured): AgentResult[] {
  const finishers = agents.filter((a) => a.status === 'ok' && a.score);
  const diff = diffDiscipline(
    finishers.map((a) => ({
      driver: a.driver,
      // The product change: tests are the evidence, not the cost.
      files: a.filesTouched.filter((f) => !a.testFilesTouched.includes(f)),
      lines: Math.max(0, a.linesAdded + a.linesRemoved - a.testLinesChanged),
    })),
  );
  const withDiff = agents.map((a) => {
    const d = diff.get(a.driver);
    if (!a.score || !d) return a;
    const components = a.score.components.map((c) => (c.id === 'diff' ? d : c));
    return {
      ...a,
      score: { ...a.score, components, total: totalOf(components, a.score.tamperPenalty), maxPossible: maxPossibleOf(components) },
    };
  });
  return rankAgents(withDiff);
}
