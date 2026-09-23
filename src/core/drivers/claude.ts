import { tmpdir } from 'node:os';
import type { Caps, TokenUsage } from '@contract';
import { exec } from '../exec';
import { runProcess } from '../process';
import type { CacheWriteSplit } from '../budget';
import { addTokens, helpHasFlags, type AgentEvent, type Driver, type LaunchInput, type LaunchResult } from './types';

export interface ClaudeResult {
  costUsd: number | null;
  tokens: TokenUsage | null;
  isError: boolean;
  durationMs: number | null;
}

const REQUIRED_FLAGS = ['--print', '--output-format', '--max-budget-usd', '--permission-mode', '--add-dir'];
/** Cheapest model that still exercises the full auth path; the probe costs a few cents on Opus. */
const PROBE_MODEL = 'claude-haiku-4-5';
const PROBE_BUDGET_USD = '0.25';
const WRITE_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'];
const ACTION_MAX = 100;

/**
 * 2.1.259 has no `--max-turns`, so `caps.maxTurns` is deliberately dropped here.
 * The budget cap is enforced twice: by the CLI via `--max-budget-usd` and by our
 * own meter in `runProcess`, which kills the process group when it trips.
 */
export function claudeArgs(i: { caps: Caps; worktree: string }, opts: { bare: boolean }): string[] {
  const args = [
    '-p',
    '--output-format', 'stream-json',
    '--verbose',
    '--permission-mode', 'acceptEdits',
    '--max-budget-usd', String(i.caps.budgetUsd),
    '--add-dir', i.worktree,
  ];
  if (opts.bare) args.push('--bare');
  return args;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

function usageFrom(u: unknown): TokenUsage | null {
  if (!u || typeof u !== 'object') return null;
  const o = u as Record<string, unknown>;
  return {
    input: num(o.input_tokens),
    output: num(o.output_tokens),
    cacheRead: num(o.cache_read_input_tokens),
    cacheWrite: num(o.cache_creation_input_tokens),
  };
}

/**
 * Cache writes split by TTL. The two tiers bill differently (1.25x vs 2x input), and
 * Claude Code writes 1h entries, so metering the total at the 5m rate under-bills.
 * When the breakdown is missing, attribute everything to 5m -- the cheaper, safer read.
 */
function cacheWriteFrom(u: unknown): CacheWriteSplit {
  const o = obj(u);
  const c = obj(o.cache_creation);
  const m5 = num(c.ephemeral_5m_input_tokens);
  const h1 = num(c.ephemeral_1h_input_tokens);
  if (m5 === 0 && h1 === 0) return { m5: num(o.cache_creation_input_tokens), h1: 0 };
  return { m5, h1 };
}

function actionText(name: string, input: Record<string, unknown>): string {
  const target =
    str(input.file_path) || str(input.command) || str(input.pattern) || str(input.path) || str(input.url) || '';
  return `${name} ${target}`.trim().slice(0, ACTION_MAX);
}

/** Every field access is guarded: the envelope is untrusted and its shape churns between versions. */
export interface ParsedLine { events: AgentEvent[]; result: ClaudeResult | null; messageId?: string | null }

/** Pure per-line parse. Usage here is per-message, not per-stream: see `createClaudeStream`. */
export function parseClaudeLine(line: string): ParsedLine {
  let j: unknown;
  try {
    j = JSON.parse(line);
  } catch {
    return { events: [], result: null };
  }
  if (!j || typeof j !== 'object') return { events: [], result: null };
  const o = j as Record<string, unknown>;
  const events: AgentEvent[] = [];

  if (o.type === 'assistant') {
    const msg = obj(o.message);
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const block of content) {
      const b = obj(block);
      if (b.type !== 'tool_use') continue;
      const input = obj(b.input);
      const name = str(b.name);
      events.push({ kind: 'action', text: actionText(name, input) });
      if (WRITE_TOOLS.includes(name) && str(input.file_path)) events.push({ kind: 'file', path: str(input.file_path) });
    }
    const tokens = usageFrom(msg.usage);
    if (tokens) {
      events.push({
        kind: 'usage', tokens, model: str(msg.model) || 'claude', cacheWrite: cacheWriteFrom(msg.usage),
      });
    }
    const messageId = str(msg.id);
    return messageId ? { events, result: null, messageId } : { events, result: null };
  }

  if (o.type === 'result') {
    const costUsd = typeof o.total_cost_usd === 'number' ? o.total_cost_usd : null;
    if (costUsd !== null) events.push({ kind: 'cost', costUsd });
    return {
      events,
      result: {
        costUsd,
        tokens: usageFrom(o.usage),
        isError: o.is_error === true,
        durationMs: typeof o.duration_ms === 'number' ? o.duration_ms : null,
      },
    };
  }

  return { events, result: null };
}

/**
 * Did the auth probe reach the API? A budget stop counts as yes: Claude bills the
 * system-prompt cache write before the first token, so a tight cap trips on turn one
 * without saying anything about credentials. Anything unparseable counts as no.
 */
export function probeAuthOk(stdout: string): boolean {
  let j: unknown;
  try {
    j = JSON.parse(stdout);
  } catch {
    return false;
  }
  const o = obj(j);
  if (o.is_error !== true) return true;
  return str(o.subtype).startsWith('error_max_budget');
}

/**
 * Stateful wrapper over `parseClaudeLine`.
 *
 * Claude emits one line per content block, and every line repeats the *whole* message's
 * usage. Metering each line therefore counts a two-block message twice -- the recorded
 * 20260923-mosj race billed 28 lines for 14 messages and overestimated by about 18%.
 * Counting each message id once turns those repeats back into per-message deltas.
 */
export function createClaudeStream(): { push(line: string): ParsedLine } {
  const metered = new Set<string>();
  return {
    push(line: string): ParsedLine {
      const parsed = parseClaudeLine(line);
      const id = parsed.messageId;
      if (!id) return parsed;
      if (metered.has(id)) {
        return { ...parsed, events: parsed.events.filter((e) => e.kind !== 'usage') };
      }
      metered.add(id);
      return parsed;
    },
  };
}

export const claudeDriver: Driver = {
  id: 'claude',
  displayName: 'Claude Code',
  color: '#F59E6B',

  async doctor() {
    const v = await exec('claude', ['--version']);
    if (v.code !== 0) return { found: false, version: null, authOk: false, notes: ['install: npm i -g @anthropic-ai/claude-code'] };
    const version = v.stdout.trim().split(/\s+/)[0] ?? null;
    const help = await exec('claude', ['--help']);
    const missing = helpHasFlags(help.stdout + help.stderr, REQUIRED_FLAGS);
    const notes = missing.length ? [`missing flags: ${missing.join(' ')}`] : [];

    // Real probe: a one-line prompt with a tiny budget. Exit 0 and no is_error means auth works.
    const probeLines: string[] = [];
    const probe = await runProcess({
      cmd: 'claude',
      args: ['-p', 'say ok', '--model', PROBE_MODEL, '--max-budget-usd', PROBE_BUDGET_USD, '--output-format', 'json'],
      cwd: tmpdir(),
      timeoutMs: 60_000,
      stdin: '',
      onStdoutLine: (l) => probeLines.push(l),
    });
    const authOk = probe.status === 'ok' && probeAuthOk(probeLines.join(''));
    if (!authOk) {
      notes.push(
        probe.status === 'timeout'
          ? 'auth probe timed out (workspace trust prompt? see Task 15)'
          : 'auth probe failed: run `claude` once interactively to log in',
      );
    }
    return { found: true, version, authOk: authOk && missing.length === 0, notes };
  },

  async launch(input: LaunchInput): Promise<LaunchResult> {
    const bare = process.env.BAKEOFF_BARE === '1' && !!process.env.ANTHROPIC_API_KEY;
    let tokens: TokenUsage | null = null;
    let result: ClaudeResult | null = null;
    const stream = createClaudeStream();
    const r = await runProcess({
      cmd: 'claude',
      args: claudeArgs(input, { bare }),
      cwd: input.worktree,
      stdin: input.packet,
      timeoutMs: input.caps.timeoutMs,
      signal: input.signal,
      meter: input.meter,
      logPath: input.logPath,
      onStdoutLine: (line) => {
        const parsed = stream.push(line);
        for (const e of parsed.events) {
          if (e.kind === 'usage') {
            tokens = addTokens(tokens, e.tokens);
            input.meter.addUsage(e.tokens, e.model, e.cacheWrite);
          }
          if (e.kind === 'cost') input.meter.setCost(e.costUsd);
          input.onEvent(e);
        }
        if (parsed.result) result = parsed.result;
      },
    });
    const res = result as ClaudeResult | null;
    const status =
      r.status === 'ok' && res?.isError ? 'crashed' : r.status === 'aborted' ? 'crashed' : r.status;
    return {
      exitCode: r.exitCode,
      status,
      tokens: res?.tokens ?? tokens,
      costUsd: res?.costUsd ?? input.meter.costUsd,
      durationMs: r.durationMs,
      raw: res,
    };
  },
};
