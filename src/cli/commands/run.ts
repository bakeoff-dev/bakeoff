import { existsSync, readdirSync } from 'node:fs';
import * as p from '@clack/prompts';
import type { Baseline, DriverId } from '@contract';
import { formatAgentSpec, parseAgentSpecs, type AgentSpec } from '../../core/agentspec';
import { loadConfig, parseDuration, type Config } from '../../core/config';
import { fetchIssue, listOpenIssues, parseIssueRef, type IssueRef } from '../../core/issue';
import { NAMES, NO_ACCEPTANCE_TEST } from '../../core/names';
import { createAbortRegistry, defaultDeps, runRace } from '../../core/race';
import { computeBaseline } from '../../core/scorer/checks';
import { newRunId, paths, readEvents, readLadder } from '../../core/store';
import { detectRepo } from '../../core/repo';

import { progressRenderer } from '../render/progress';
import { finalTable } from '../render/table';
import { exportScoreboard } from '../scoreboard';
import { startWatchServer, type WatchServer } from '../server';
import { openInBrowser } from '../open';
import { writeCard } from './share';
import { doctorReport } from './doctor';

export interface RunOpts {
  agents?: string; budget?: string; timeout?: string; watch?: boolean; keepWorktrees?: boolean;
}

/**
 * Things worth knowing before the agents start: a broken install, a red baseline, or
 * hidden tests configured with nothing behind them. None of these stop the race.
 */
export function preflightWarnings(
  config: Config,
  baseline: Baseline,
  repoRoot: string,
): string[] {
  const out: string[] = [];
  if (baseline.setupError) {
    out.push(`${baseline.setupError} in the baseline worktree; every check will read red`);
  }
  if (baseline.testsGreen === false) {
    out.push(
      'baseline tests already fail at the base commit. If the repo is broken, fix it first; ' +
        'if the issue is itself a failing test, this is expected and the agents are scored on fixing it',
    );
  }
  if (!config.hidden_tests && baseline.testsGreen === true) {
    out.push(NO_ACCEPTANCE_TEST);
  }
  if (config.hidden_tests) {
    const dir = config.hidden_tests.source || paths(repoRoot).hiddenDir;
    const entries = existsSync(dir) ? readdirSync(dir) : [];
    if (entries.length === 0) {
      out.push(`hidden_tests is configured but ${dir} is empty or missing; that component will score n/a`);
    }
  }
  return out;
}

export async function runCommand(issueArg: string | undefined, opts: RunOpts): Promise<void> {
  p.intro(`${NAMES.brand} run`);
  const repo = await detectRepo(process.cwd());
  const config = loadConfig(repo.root);
  let agents: AgentSpec[];
  try {
    agents = parseAgentSpecs(opts.agents ?? config.agents);
  } catch (e) {
    // A bad --agents value is user input, not a crash: say so and stop.
    p.log.error((e as Error).message);
    p.cancel('Nothing to race.');
    process.exit(1);
  }
  const drivers: DriverId[] = agents.map((a) => a.driver);
  const caps = {
    budgetUsd: opts.budget ? Number(opts.budget) : config.budget_usd,
    timeoutMs: parseDuration(opts.timeout ?? config.timeout),
    maxTurns: config.max_turns ?? null,
  };

  const doc = await doctorReport(drivers);
  for (const l of doc) if (!l.ok) p.log.error(`${l.name}: ${l.detail}`);
  if (doc.some((l) => !l.ok)) {
    p.cancel('Preflight failed.');
    process.exit(1);
  }

  let ref: IssueRef;
  if (issueArg) {
    ref = parseIssueRef(issueArg, repo);
  } else {
    const issues = await listOpenIssues(repo);
    if (issues.length === 0) {
      p.cancel('No open issues in this repository.');
      process.exit(1);
    }
    const pick = await p.select({
      message: 'Which issue?',
      options: issues.map((i) => ({ value: i.number, label: `#${i.number} ${i.title}` })),
    });
    if (p.isCancel(pick)) {
      p.cancel('Aborted.');
      process.exit(1);
    }
    ref = { owner: repo.owner, name: repo.name, number: pick as number };
  }

  const issue = await fetchIssue(ref);
  const runId = newRunId();
  p.log.info(
    `#${issue.info.number} ${issue.info.title}\n` +
      `agents: ${agents.map(formatAgentSpec).join(', ')} · budget $${caps.budgetUsd} · ` +
      `timeout ${opts.timeout ?? config.timeout} · run ${runId}`,
  );

  const deps = defaultDeps();
  const abort = createAbortRegistry();
  deps.abort = abort;

  // The baseline runs before any agent, so its warnings arrive before anything is spent.
  const baseline = await computeBaseline({
    repoRoot: repo.root, baseSha: repo.baseSha, runId, config,
  });
  deps.baseline = async () => baseline;
  for (const w of preflightWarnings(config, baseline, repo.root)) p.log.warn(w);

  let watch: WatchServer | null = null;
  if (opts.watch) {
    try {
      watch = await startWatchServer({
        history: () => readEvents(repo.root, runId),
        ladder: () => readLadder(repo.root),
        abort: (driver) => abort.abort(driver),
      });
      p.log.info(`watching at ${watch.url}`);
      await openInBrowser(watch.url);
    } catch (e) {
      // A browser view is a convenience; the race still runs and still records.
      p.log.warn(`could not start the watch server: ${(e as Error).message}`);
    }
  }

  const live = progressRenderer();
  const publish = watch;
  deps.onEvent = (e) => {
    live.onEvent(e);
    publish?.publish(e);
  };
  const rec = await runRace(
    { repoRoot: repo.root, repo, issue, config, agents, caps, runId, keepWorktrees: opts.keepWorktrees },
    deps,
  );
  live.stop();
  await watch?.close();

  // Both are niceties; a race that produced a record must not fail on either.
  let scoreboardPath: string | null = null;
  try {
    scoreboardPath = exportScoreboard(repo.root, runId);
  } catch (e) {
    p.log.warn(`could not write the scoreboard: ${(e as Error).message}`);
  }
  try {
    await writeCard(repo.root, runId);
  } catch (e) {
    p.log.warn(`could not render the share card: ${(e as Error).message}`);
  }

  console.log(finalTable({ record: rec, ladder: readLadder(repo.root), scoreboardPath }));
}
