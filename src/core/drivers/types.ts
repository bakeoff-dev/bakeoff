import type { AgentStatus, Caps, DriverId, TokenUsage } from '@contract';
import type { BudgetMeter, CacheWriteSplit } from '../budget';
import type { ProcessStatus } from '../process';

export interface DriverDoctor { found: boolean; version: string | null; authOk: boolean; notes: string[] }

export type AgentEvent =
  | { kind: 'action'; text: string }
  | { kind: 'usage'; tokens: TokenUsage; model: string; cacheWrite?: CacheWriteSplit }
  | { kind: 'cost'; costUsd: number }
  | { kind: 'file'; path: string };

export interface LaunchInput {
  packet: string; packetPath: string; worktree: string; branch: string;
  /** Requested model, or null to let the CLI choose -- drivers pass no model flag then. */
  model: string | null;
  caps: Caps; meter: BudgetMeter; onEvent: (e: AgentEvent) => void; signal: AbortSignal;
  logPath: string;
}
export interface LaunchResult {
  exitCode: number | null; status: Exclude<AgentStatus, 'running'>;
  tokens: TokenUsage | null; costUsd: number | null; durationMs: number; raw: unknown;
  /** The model the CLI reported actually running, when it says; null when it does not. */
  model: string | null;
}
export interface Driver {
  id: DriverId; displayName: string; color: string;
  doctor(): Promise<DriverDoctor>;
  launch(input: LaunchInput): Promise<LaunchResult>;
}

export function helpHasFlags(helpText: string, flags: string[]): string[] {
  return flags.filter((f) => !helpText.includes(f));
}

export function addTokens(a: TokenUsage | null, b: TokenUsage): TokenUsage {
  return {
    input: (a?.input ?? 0) + b.input,
    output: (a?.output ?? 0) + b.output,
    cacheRead: (a?.cacheRead ?? 0) + b.cacheRead,
    cacheWrite: (a?.cacheWrite ?? 0) + b.cacheWrite,
  };
}

/**
 * Fold how the process ended together with the CLI's own verdict.
 *
 * A CLI that stops itself on its own budget flag exits 0 and reports an error; that
 * is a spend limit, not a crash, and calling it one would hide why the agent stopped.
 */
export function agentStatus(
  process: ProcessStatus,
  cli?: { isError?: boolean; budgetStop?: boolean } | null,
): Exclude<AgentStatus, 'running'> {
  if (process === 'aborted') return 'crashed';
  if (process !== 'ok') return process;
  if (cli?.budgetStop) return 'budget_exceeded';
  if (cli?.isError) return 'crashed';
  return 'ok';
}

/**
 * Per-message usage accounting for CLIs that repeat a message's running totals on
 * every line. Only growth past the largest figure yet seen for that message is new
 * spend; an identical repeat bills nothing, and a smaller one bills nothing either.
 */
export function createUsageLedger(): {
  delta(id: string, tokens: TokenUsage, cacheWrite?: CacheWriteSplit): { tokens: TokenUsage; cacheWrite: CacheWriteSplit } | null;
} {
  const seen = new Map<string, { tokens: TokenUsage; cacheWrite: CacheWriteSplit }>();
  const grow = (next: number, prev: number): number => Math.max(0, next - prev);
  return {
    delta(id, tokens, cacheWrite) {
      const split = cacheWrite ?? { m5: tokens.cacheWrite, h1: 0 };
      const prev = seen.get(id);
      if (!prev) {
        seen.set(id, { tokens, cacheWrite: split });
        return { tokens, cacheWrite: split };
      }
      const d = {
        tokens: {
          input: grow(tokens.input, prev.tokens.input),
          output: grow(tokens.output, prev.tokens.output),
          cacheRead: grow(tokens.cacheRead, prev.tokens.cacheRead),
          cacheWrite: grow(tokens.cacheWrite, prev.tokens.cacheWrite),
        },
        cacheWrite: { m5: grow(split.m5, prev.cacheWrite.m5), h1: grow(split.h1, prev.cacheWrite.h1) },
      };
      // Keep the high-water mark so a line that reports less never un-bills anything.
      seen.set(id, {
        tokens: {
          input: Math.max(tokens.input, prev.tokens.input),
          output: Math.max(tokens.output, prev.tokens.output),
          cacheRead: Math.max(tokens.cacheRead, prev.tokens.cacheRead),
          cacheWrite: Math.max(tokens.cacheWrite, prev.tokens.cacheWrite),
        },
        cacheWrite: { m5: Math.max(split.m5, prev.cacheWrite.m5), h1: Math.max(split.h1, prev.cacheWrite.h1) },
      });
      const any = d.tokens.input || d.tokens.output || d.tokens.cacheRead || d.tokens.cacheWrite;
      return any ? d : null;
    },
  };
}

/**
 * A stable model id. CLIs report models inconsistently -- an id, a display label, a
 * variant suffix -- and the ladder keys on this string, so two spellings of one model
 * must not become two rows. `/` survives, because a provider-qualified id such as
 * `anthropic/claude-opus-5` is the model's real name, not punctuation.
 */
export function normalizeModel(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9./+-]+/g, '-').replace(/^-+|-+$/g, '');
}

export interface ModelShare { model: string; output: number; total: number }

/**
 * Which model a run should be credited to, given a per-model usage breakdown:
 * whichever produced the most output, breaking ties on total tokens. Helper and
 * router models show up in these tables and must not take the credit.
 */
export function dominantModel(shares: readonly ModelShare[]): string | null {
  let best: ModelShare | null = null;
  for (const s of shares) {
    if (s.model.trim().length === 0) continue;
    if (best === null || s.output > best.output || (s.output === best.output && s.total > best.total)) best = s;
  }
  return best === null ? null : normalizeModel(best.model);
}
