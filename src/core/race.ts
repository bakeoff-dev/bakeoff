import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentResult, Baseline, Caps, Configured, DriverId, RaceEvent, RepoInfo, RunRecord } from '@contract';
import type { BudgetMeter } from './budget';
import { configuredFlags, type Config } from './config';
import { getDriver as registryGet } from './drivers/registry';
import type { AgentEvent, Driver } from './drivers/types';
import { exec as realExec, type Exec } from './exec';
import type { IssueData } from './issue';
import { NAMES, branchName, runLabel } from './names';
import { buildPacket, readGuidance } from './packet';
import { defaultMeter } from './pricing';
import { commitLeftovers, createPr, ensureLabels, pushBranch } from './publish';
import { appendEvent, paths, writeRun } from './store';
import { createWorktree, removeWorktree, worktreeDir } from './worktree';

export interface RaceInput {
  repoRoot: string; repo: RepoInfo; issue: IssueData; config: Config;
  agents: readonly DriverId[]; caps: Caps; runId: string; keepWorktrees?: boolean;
}
export interface ScoreCtx {
  worktree: string; repoRoot: string; baseSha: string; config: Config;
  agent: AgentResult; hiddenDir: string; repo: RepoInfo;
}
export type ScoreAgentFn = (ctx: ScoreCtx) => Promise<Pick<AgentResult, 'score' | 'filesTouched' | 'linesAdded' | 'linesRemoved'>>;
export type FinalizeFn = (agents: AgentResult[], configured: Configured) => AgentResult[];

export interface AbortRegistry { signalFor(driver: DriverId): AbortSignal; abort(driver: DriverId): void }

export interface RaceDeps {
  getDriver: (id: DriverId) => Driver;
  exec: Exec;
  now: () => Date;
  meterFor: (capUsd: number) => BudgetMeter;
  baseline: (i: RaceInput) => Promise<Baseline>;
  /** Wired in Day 4. `null` means skip scoring. */
  scoreAgent: ScoreAgentFn | null;
  finalize: FinalizeFn | null;
  onEvent?: (e: RaceEvent) => void;
  abort?: AbortRegistry;
}

export function createAbortRegistry(): AbortRegistry {
  const m = new Map<DriverId, AbortController>();
  const get = (d: DriverId): AbortController => {
    const existing = m.get(d);
    if (existing) return existing;
    const created = new AbortController();
    m.set(d, created);
    return created;
  };
  return { signalFor: (d) => get(d).signal, abort: (d) => get(d).abort() };
}

export function defaultDeps(): RaceDeps {
  return {
    getDriver: registryGet,
    exec: realExec,
    now: () => new Date(),
    meterFor: defaultMeter,
    baseline: async () => ({ testsGreen: null, lintGreen: null, typecheckGreen: null }),
    scoreAgent: null,
    finalize: null,
  };
}

const LABEL_COLOR = 'F59E0B';

/**
 * Agents race in parallel, but `git worktree add`, `sparse-checkout set` and
 * `worktree remove` all write the shared `.git/config`, which git locks per repo.
 * Run through here and they queue instead of failing with "could not lock config file".
 */
function serialQueue(): <T>(fn: () => Promise<T>) => Promise<T> {
  let chain: Promise<unknown> = Promise.resolve();
  return <T>(fn: () => Promise<T>): Promise<T> => {
    const next = chain.then(fn, fn);
    chain = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  };
}

const PROGRESS_MIN_MS = 1000;

const tail = (file: string, n = 40): string =>
  existsSync(file) ? readFileSync(file, 'utf8').trimEnd().split('\n').slice(-n).join('\n') : '';

export async function runRace(input: RaceInput, deps: RaceDeps = defaultDeps()): Promise<RunRecord> {
  const { repoRoot, repo, issue, config, runId } = input;
  const p = paths(repoRoot);
  const abort = deps.abort ?? createAbortRegistry();
  const gitLock = serialQueue();
  // The file is the source of truth; SSE and the terminal are views of it.
  const emit = (e: RaceEvent): void => {
    appendEvent(repoRoot, runId, e);
    deps.onEvent?.(e);
  };
  const at = (): string => deps.now().toISOString();

  const packet = buildPacket({ issue, guidance: readGuidance(repoRoot), config });
  const baseline = await deps.baseline(input);
  const configured = configuredFlags(config);
  const record: RunRecord = {
    schemaVersion: 1,
    id: runId,
    createdAt: at(),
    finishedAt: null,
    repo,
    issue: issue.info,
    packetHash: packet.hash,
    caps: input.caps,
    baseline,
    configured,
    agents: input.agents.map((d) => ({
      driver: d, status: 'running', branch: branchName(issue.info.number, d, runId),
      exitCode: null, durationMs: 0, costUsd: null, tokens: null,
      filesTouched: [], linesAdded: 0, linesRemoved: 0,
      prUrl: null, prNumber: null, score: null, rank: null, logTail: '',
    })),
    winner: null,
  };
  writeRun(repoRoot, record);
  emit({
    type: 'race.started', at: at(), runId, issue: issue.info, repo,
    agents: [...input.agents], caps: input.caps, baseline,
  });

  mkdirSync(p.logsDir(runId), { recursive: true });
  const packetPath = join(p.logsDir(runId), 'packet.md');
  writeFileSync(packetPath, packet.text);
  await ensureLabels(
    repo,
    [{ name: NAMES.label, color: LABEL_COLOR }, { name: runLabel(runId), color: LABEL_COLOR }],
    deps.exec,
  );

  const results = await Promise.all(record.agents.map((a) => runOne(a)));
  record.agents = deps.finalize ? deps.finalize(results, configured) : results;
  record.winner = record.agents.find((a) => a.rank === 1)?.driver ?? null;
  record.finishedAt = at();
  writeRun(repoRoot, record);
  emit({ type: 'race.finished', at: record.finishedAt, record });
  return record;

  async function runOne(agent: AgentResult): Promise<AgentResult> {
    const driver = deps.getDriver(agent.driver);
    const dir = worktreeDir(runId, agent.driver);
    const logPath = p.log(runId, agent.driver);
    const meter = deps.meterFor(input.caps.budgetUsd);
    const files = new Set<string>();
    let lastAction = '';
    let lastProgress = 0;

    await gitLock(() => createWorktree({ repoRoot, baseSha: repo.baseSha, branch: agent.branch, dir }, deps.exec));
    emit({ type: 'agent.started', at: at(), driver: agent.driver, branch: agent.branch });

    const onEvent = (e: AgentEvent): void => {
      if (e.kind === 'action') lastAction = e.text;
      if (e.kind === 'file') files.add(e.path);
      const nowMs = Date.now();
      // Throttle: agents emit far faster than anyone can read. Cost always gets through.
      if (nowMs - lastProgress > PROGRESS_MIN_MS || e.kind === 'cost') {
        lastProgress = nowMs;
        emit({
          type: 'agent.progress', at: at(), driver: agent.driver,
          costUsd: meter.costUsd, tokens: null, lastAction, filesTouched: files.size,
        });
      }
    };

    let out: AgentResult = { ...agent };
    try {
      const r = await driver.launch({
        packet: packet.text, packetPath, worktree: dir, branch: agent.branch,
        caps: input.caps, meter, onEvent, signal: abort.signalFor(agent.driver), logPath,
      });
      out = { ...out, status: r.status, exitCode: r.exitCode, durationMs: r.durationMs, costUsd: r.costUsd, tokens: r.tokens };
    } catch (err) {
      out = { ...out, status: 'crashed', exitCode: null, durationMs: 0 };
      writeFileSync(logPath, `\n[${NAMES.bin}] driver threw: ${(err as Error).message}\n`, { flag: 'a' });
    }
    emit({
      type: 'agent.exited', at: at(), driver: agent.driver, status: out.status,
      exitCode: out.exitCode, durationMs: out.durationMs, costUsd: out.costUsd, tokens: out.tokens,
    });

    if (out.status === 'ok') {
      try {
        await commitLeftovers(dir, `${NAMES.bin}: final state (${agent.driver})`, deps.exec);
        await pushBranch(dir, agent.branch, deps.exec);
        const pr = await createPr(
          {
            worktree: dir, repo, branch: agent.branch, base: repo.defaultBranch,
            title: `${issue.info.title} (${driver.displayName})`,
            body: [
              `${NAMES.brand} run \`${runId}\` for #${issue.info.number}.`,
              `Agent: ${driver.displayName}`,
              `Packet sha256: \`${packet.hash}\``,
              `Scoreboard: ${NAMES.stateDir}/runs/${runId}.html`,
            ].join('\n'),
            labels: [NAMES.label, runLabel(runId)],
          },
          deps.exec,
        );
        out = { ...out, prUrl: pr.url, prNumber: pr.number };
        emit({ type: 'agent.pr_opened', at: at(), driver: agent.driver, prUrl: pr.url, prNumber: pr.number });
      } catch (err) {
        // A publish failure must not lose the run: record it and keep the agent's result.
        writeFileSync(logPath, `\n[${NAMES.bin}] publish failed: ${(err as Error).message}\n`, { flag: 'a' });
      }
      if (deps.scoreAgent) {
        const s = await deps.scoreAgent({
          worktree: dir, repoRoot, baseSha: repo.baseSha, config, agent: out, hiddenDir: p.hiddenDir, repo,
        });
        out = { ...out, ...s };
        if (out.score) emit({ type: 'agent.scored', at: at(), driver: agent.driver, score: out.score });
      }
    }

    out.logTail = tail(logPath);
    if (!input.keepWorktrees) await gitLock(() => removeWorktree({ repoRoot, dir }, deps.exec));
    return out;
  }
}
