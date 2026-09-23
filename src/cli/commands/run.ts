import * as p from '@clack/prompts';
import type { DriverId } from '@contract';
import { formatAgentSpec, parseAgentSpecs, type AgentSpec } from '../../core/agentspec';
import { loadConfig, parseDuration } from '../../core/config';
import { fetchIssue, listOpenIssues, parseIssueRef, type IssueRef } from '../../core/issue';
import { NAMES } from '../../core/names';
import { defaultDeps, runRace } from '../../core/race';
import { detectRepo } from '../../core/repo';
import { newRunId } from '../../core/store';
import { progressRenderer } from '../render/progress';
import { DRIVER_NAME, STATUS_WORD, dim, fmtClock, fmtCost, paint, DRIVER_HEX } from '../render/style';
import { doctorReport } from './doctor';

export interface RunOpts {
  agents?: string; budget?: string; timeout?: string; watch?: boolean; keepWorktrees?: boolean;
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
  const live = progressRenderer();
  deps.onEvent = live.onEvent;
  const rec = await runRace(
    { repoRoot: repo.root, repo, issue, config, agents, caps, runId, keepWorktrees: opts.keepWorktrees },
    deps,
  );
  live.stop();

  console.log('');
  for (const a of rec.agents) {
    const name = paint(DRIVER_HEX[a.driver], DRIVER_NAME[a.driver].padEnd(12));
    const model = a.model ? dim(` (${a.model})`) : '';
    console.log(
      `  ${name} ${STATUS_WORD[a.status].padEnd(11)} ${fmtCost(a.costUsd).padStart(6)}  ` +
        `${fmtClock(a.durationMs).padStart(5)}  ${a.prUrl ?? 'no PR'}${model}`,
    );
  }
  console.log(`\n  Run record  ${NAMES.stateDir}/runs/${runId}.json\n`);
}
