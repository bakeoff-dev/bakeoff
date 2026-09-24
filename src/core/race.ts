import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_VERSION, type AgentResult, type Baseline, type Caps, type Configured, type DriverId, type RaceEvent, type RepoInfo, type RunRecord, type ScoreComponent, type TokenUsage } from '@contract';
import type { AgentSpec } from './agentspec';
import type { BudgetMeter } from './budget';
import { configuredFlags, parseDuration, type Config } from './config';
import { getDriver as registryGet } from './drivers/registry';
import { addTokens, type AgentEvent, type Driver } from './drivers/types';
import { exec as realExec, type Exec } from './exec';
import type { IssueData } from './issue';
import { NAMES, branchName, runLabel } from './names';
import { buildPacket, readGuidance } from './packet';
import { defaultMeter } from './pricing';
import { commitLeftovers, createPr, ensureLabels, pushBranch } from './publish';
import { appendEvent, paths, writeRun } from './store';
import { oneLine } from './text';
import { createWorktree, removeWorktree, worktreeDir } from './worktree';
import { computeBaseline } from './scorer/checks';
import { ciComponent } from './scorer/ci';
import { finalizeScores, scoreAgent as realScoreAgent } from './scorer';
import { updateLadder } from './ladder';
import { readLadder, writeLadder } from './store';
import { runProcess } from './process';
import { FILES_POLL_MS, listUntracked, watchChangedPaths } from './livefiles';

export interface RaceInput {
  repoRoot: string; repo: RepoInfo; issue: IssueData; config: Config;
  agents: readonly AgentSpec[]; caps: Caps; runId: string; keepWorktrees?: boolean;
}
export interface ScoreCtx {
  worktree: string; repoRoot: string; baseSha: string; config: Config;
  agent: AgentResult; hiddenDir: string; repo: RepoInfo;
}
export type ScoreAgentFn = (
  ctx: ScoreCtx,
  baselineGreen: boolean | null,
  ci: ScoreComponent | null | Promise<ScoreComponent | null>,
) => Promise<Pick<AgentResult, 'score' | 'filesTouched' | 'linesAdded' | 'linesRemoved' | 'testFilesTouched' | 'testLinesChanged' | 'docFilesTouched' | 'docLinesChanged'>>;
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
  /** Called once the record is final, before race.finished. null skips the ladder. */
  persistLadder: ((repoRoot: string, rec: RunRecord) => void) | null;
  onEvent?: (e: RaceEvent) => void;
  abort?: AbortRegistry;
  /** How often the live files count reads `git status` in each worktree. */
  filesPollMs?: number;
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
    baseline: (i) =>
      computeBaseline({ repoRoot: i.repoRoot, baseSha: i.repo.baseSha, runId: i.runId, config: i.config }),
    scoreAgent: realScoreAgent,
    finalize: finalizeScores,
    persistLadder: (repoRoot, rec) => writeLadder(repoRoot, updateLadder(readLadder(repoRoot), rec)),
  };
}

const LABEL_COLOR = 'F59E0B';
const SETUP_TIMEOUT_MS = 15 * 60_000;

/** Workflows register seconds after a PR opens; without any, "no checks" is final. */
async function hasWorkflowFiles(repoRoot: string, baseSha: string, run: Exec): Promise<boolean> {
  const r = await run('git', ['ls-tree', '-r', '--name-only', baseSha, '--', '.github/workflows'], { cwd: repoRoot });
  return r.code === 0 && r.stdout.trim().length > 0;
}

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

const LIVE_TAIL_LINES = 20;
const LIVE_TAIL_BYTES = 4096;

/**
 * Recent log for the live drawer: short, one line per line, and bounded. It rides on
 * every progress event, so it has to stay small enough not to swamp the SSE stream.
 */
function liveTail(file: string): string {
  if (!existsSync(file)) return '';
  const lines = readFileSync(file, 'utf8').trimEnd().split('\n').slice(-LIVE_TAIL_LINES).map(oneLine);
  const text = lines.filter((l) => l.length > 0).join('\n');
  return text.length <= LIVE_TAIL_BYTES ? text : text.slice(-LIVE_TAIL_BYTES);
}

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

  // Whether CI can ever report: a repo with no workflow files never will.
  const hasWorkflows = await hasWorkflowFiles(repoRoot, repo.baseSha, deps.exec);
  const packet = buildPacket({ issue, guidance: readGuidance(repoRoot), config });
  const baseline = await deps.baseline(input);
  const configured = configuredFlags(config);
  const record: RunRecord = {
    schemaVersion: SCHEMA_VERSION,
    id: runId,
    createdAt: at(),
    finishedAt: null,
    repo,
    issue: issue.info,
    packetHash: packet.hash,
    caps: input.caps,
    baseline,
    configured,
    // `model` starts as the request and is replaced by whatever the CLI reports;
    // `requestedModel` never changes, because it is what the ladder rates.
    // Nothing here can tell whether the issue was solved: no hidden suite, and the
    // visible one was already green, so every check can only show nothing broke.
    noAcceptanceTest: !configured.hiddenTests && baseline.testsGreen === true,
    agents: input.agents.map(({ driver: d, model }) => ({
      driver: d, model, requestedModel: model, status: 'running',
      branch: branchName(issue.info.number, d, runId),
      exitCode: null, durationMs: 0, costUsd: null, tokens: null,
      filesTouched: [], linesAdded: 0, linesRemoved: 0,
      testFilesTouched: [], testLinesChanged: 0, docFilesTouched: [], docLinesChanged: 0,
      prUrl: null, prNumber: null, score: null, rank: null, logTail: '',
    })),
    winner: null,
  };
  writeRun(repoRoot, record);
  emit({
    type: 'race.started', at: at(), runId, issue: issue.info, repo,
    agents: input.agents.map((a) => a.driver), caps: input.caps, baseline,
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
  if (deps.persistLadder) {
    try {
      deps.persistLadder(repoRoot, record);
    } catch (err) {
      // A ladder write must not cost us the run record.
      appendFileSync(p.log(runId, 'race'), `[${NAMES.bin}] ladder update failed: ${(err as Error).message}\n`);
    }
  }
  writeRun(repoRoot, record);
  emit({ type: 'race.finished', at: record.finishedAt, record });
  return record;

  /**
   * Install dependencies in an agent's worktree before it starts, so every agent begins
   * from the same working repo. Returns null on success, or the reason it failed.
   */
  async function runSetup(dir: string, logPath: string): Promise<string | null> {
    const cmd = config.setup;
    if (!cmd) return null;
    appendFileSync(logPath, `[${NAMES.bin}] setup: ${cmd}\n`);
    const r = await runProcess({
      cmd: 'sh', args: ['-c', cmd], cwd: dir, timeoutMs: SETUP_TIMEOUT_MS, logPath,
    });
    if (r.status !== 'ok') {
      const why = r.status === 'timeout' ? 'setup timed out' : `setup failed (exit ${r.exitCode ?? '?'})`;
      appendFileSync(logPath, `[${NAMES.bin}] ${why}\n`);
      return why;
    }
    // Untracked output is fine; a modified tracked file is not. Lockfile churn from a
    // non-frozen install would otherwise land in every agent's diff and be scored.
    const dirty = await deps.exec('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: dir });
    if (dirty.stdout.trim().length > 0) {
      const why = 'setup modified tracked files; use a frozen install';
      appendFileSync(logPath, `[${NAMES.bin}] ${why}\n${dirty.stdout.trim()}\n`);
      return why;
    }
    return null;
  }

  async function runOne(agent: AgentResult): Promise<AgentResult> {
    const driver = deps.getDriver(agent.driver);
    const dir = worktreeDir(runId, agent.driver);
    const logPath = p.log(runId, agent.driver);
    const meter = deps.meterFor(input.caps.budgetUsd);
    const files = new Set<string>();
    // Driver file events are a fallback; git status in the worktree is the main source.
    let polledFiles = 0;
    let sentFiles = 0;
    const filesCount = (): number => Math.max(files.size, polledFiles);
    let lastAction = '';
    let lastProgress = 0;
    let tokens: TokenUsage | null = null;

    await gitLock(() => createWorktree({ repoRoot, baseSha: repo.baseSha, branch: agent.branch, dir }, deps.exec));
    if (config.setup) {
      const failure = await runSetup(dir, logPath);
      if (failure !== null) {
        const failed: AgentResult = { ...agent, status: 'crashed', exitCode: null, durationMs: 0 };
        emit({
          type: 'agent.exited', at: at(), driver: agent.driver, status: 'crashed',
          exitCode: null, durationMs: 0, costUsd: null, tokens: null, model: agent.model,
        });
        failed.logTail = tail(logPath);
        if (!input.keepWorktrees) await gitLock(() => removeWorktree({ repoRoot, dir }, deps.exec));
        return failed;
      }
    }
    // Announced once the agent can actually start: setup runs before it, and a setup
    // failure means it never does.
    emit({
      type: 'agent.started', at: at(), driver: agent.driver, branch: agent.branch,
      model: agent.model, requestedModel: agent.requestedModel,
    });

    const onEvent = (e: AgentEvent): void => {
      // Agent text is untrusted: a heredoc commit message arrives with real newlines.
      if (e.kind === 'action') lastAction = oneLine(e.text);
      if (e.kind === 'file') files.add(e.path);
      if (e.kind === 'usage') tokens = addTokens(tokens, e.tokens);
      const nowMs = Date.now();
      // Throttle the cosmetic stream: actions and files arrive faster than anyone can read.
      // Metrics always get through, so cost and tokens never sit stale behind the throttle.
      const isMetric = e.kind === 'cost' || e.kind === 'usage';
      if (isMetric || nowMs - lastProgress > PROGRESS_MIN_MS) sendProgress();
    };
    const sendProgress = (): void => {
      lastProgress = Date.now();
      sentFiles = filesCount();
      emit({
        type: 'agent.progress', at: at(), driver: agent.driver,
        costUsd: meter.costUsd, tokens, lastAction, filesTouched: sentFiles,
        logTail: liveTail(logPath),
      });
    };

    let out: AgentResult = { ...agent };
    // Whatever is untracked now (setup output) predates the agent and is not its work.
    const preexisting = new Set((await listUntracked(dir, deps.exec)) ?? []);
    const watched = { dir, baseSha: repo.baseSha, preexisting };
    const stopWatching = watchChangedPaths(watched, deps.exec, deps.filesPollMs ?? FILES_POLL_MS, (n) => {
      polledFiles = n;
      if (filesCount() !== sentFiles) sendProgress();
    });
    try {
      const r = await driver.launch({
        packet: packet.text, packetPath, worktree: dir, branch: agent.branch, model: agent.model,
        caps: input.caps, meter, onEvent, signal: abort.signalFor(agent.driver), logPath,
      });
      // Prefer what the CLI says it ran over what we asked for; fall back to the request.
      out = {
        ...out, status: r.status, exitCode: r.exitCode, durationMs: r.durationMs,
        costUsd: r.costUsd, tokens: r.tokens, model: r.model ?? agent.model,
      };
    } catch (err) {
      out = { ...out, status: 'crashed', exitCode: null, durationMs: 0 };
      writeFileSync(logPath, `\n[${NAMES.bin}] driver threw: ${(err as Error).message}\n`, { flag: 'a' });
    } finally {
      stopWatching();
    }
    emit({
      type: 'agent.exited', at: at(), driver: agent.driver, status: out.status,
      exitCode: out.exitCode, durationMs: out.durationMs, costUsd: out.costUsd, tokens: out.tokens,
      model: out.model,
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
        // CI polls from the moment the PR exists, alongside this agent's local checks.
        const ci: Promise<ScoreComponent | null> =
          out.prNumber !== null && configured.ci
            ? ciComponent({
                repo,
                prNumber: out.prNumber,
                timeoutMs: parseDuration(config.ci_timeout),
                hasWorkflows,
                run: deps.exec,
              }).catch(() => null)
            : Promise.resolve(null);
        try {
          const s = await deps.scoreAgent(
            { worktree: dir, repoRoot, baseSha: repo.baseSha, config, agent: out, hiddenDir: p.hiddenDir, repo },
            baseline.testsGreen,
            ci,
          );
          out = { ...out, ...s };
          if (out.score) emit({ type: 'agent.scored', at: at(), driver: agent.driver, score: out.score });
        } catch (err) {
          // Scoring is the last thing that happens to an agent; losing it must not cost
          // the run, the agent's status, or its PR. It scores null and ranks nowhere.
          await ci.catch(() => null);
          out = { ...out, score: null, rank: null };
          appendFileSync(logPath, `\n[${NAMES.bin}] scoring failed: ${(err as Error).message}\n`);
        }
      }
    }

    out.logTail = tail(logPath);
    if (!input.keepWorktrees) await gitLock(() => removeWorktree({ repoRoot, dir }, deps.exec));
    return out;
  }
}
