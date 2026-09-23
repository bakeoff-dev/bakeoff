import type { Caps, TokenUsage } from '@contract';
import { runProcess } from '../process';
import { ZERO_TOKENS, actionLabel, jsonLine, num, obj, probeDoctor, str } from './shared';
import {
  addTokens, agentStatus, type AgentEvent, type Driver, type LaunchInput, type LaunchResult,
} from './types';

export interface CodexResult {
  tokens: TokenUsage | null;
  isError: boolean;
  /** Codex has no budget flag of its own, so it never stops itself on cost. */
  budgetStop: boolean;
  errorMessage: string | null;
}

const REQUIRED_FLAGS = ['--json', '--model', '--sandbox', '--cd'];
const WRITE_ITEMS = ['file_change', 'patch_apply'];

/**
 * Codex writes files by running shell commands, so `-s workspace-write` is what makes
 * the run able to do anything at all. The prompt goes on stdin: passed as an argument
 * Codex still blocks waiting for stdin to close.
 */
export function codexArgs(i: { caps: Caps; worktree: string; model?: string | null }): string[] {
  const args = ['exec', '--json', '--sandbox', 'workspace-write', '--cd', i.worktree];
  if (i.model) args.push('--model', i.model);
  return args;
}

/** Codex reports `input_tokens` inclusive of the cached part; only the rest is full price. */
function usageFrom(u: unknown): TokenUsage | null {
  if (!u || typeof u !== 'object') return null;
  const o = obj(u);
  const cacheRead = num(o.cached_input_tokens);
  return {
    input: Math.max(0, num(o.input_tokens) - cacheRead),
    output: num(o.output_tokens),
    cacheRead,
    cacheWrite: num(o.cache_write_input_tokens),
  };
}

export interface ParsedCodexLine { events: AgentEvent[]; result: CodexResult | null }

export function parseCodexLine(line: string, model: string | null): ParsedCodexLine {
  const o = jsonLine(line);
  if (o === null) return { events: [], result: null };
  const events: AgentEvent[] = [];
  const type = str(o.type);

  if (type === 'item.started' || type === 'item.completed') {
    const item = obj(o.item);
    const kind = str(item.type);
    if (kind === 'command_execution' && str(item.command)) {
      events.push({ kind: 'action', text: actionLabel('Bash', str(item.command)) });
    }
    if (WRITE_ITEMS.includes(kind)) {
      for (const path of filePaths(item)) events.push({ kind: 'file', path });
    }
    if (kind === 'error' && str(item.message)) {
      events.push({ kind: 'action', text: actionLabel('Error', str(item.message)) });
    }
    return { events, result: null };
  }

  if (type === 'turn.completed') {
    const tokens = usageFrom(o.usage);
    // Codex reports no model at all, so price against whatever was requested.
    if (tokens) events.push({ kind: 'usage', tokens, model: model ?? 'codex' });
    return { events, result: { tokens, isError: false, budgetStop: false, errorMessage: null } };
  }

  if (type === 'turn.failed' || type === 'error') {
    const message = str(obj(o.error).message) || str(o.message);
    return { events, result: { tokens: null, isError: true, budgetStop: false, errorMessage: message || null } };
  }

  return { events, result: null };
}

function filePaths(item: Record<string, unknown>): string[] {
  const changes = Array.isArray(item.changes) ? item.changes : [];
  const paths = changes.map((c) => str(obj(c).path)).filter((p) => p.length > 0);
  const single = str(item.path);
  return paths.length > 0 ? paths : single ? [single] : [];
}

export const codexDriver: Driver = {
  id: 'codex',
  displayName: 'Codex',
  color: '#5EC8CE',

  async doctor() {
    return probeDoctor({
      bin: 'codex',
      installHint: 'install: npm i -g @openai/codex',
      requiredFlags: REQUIRED_FLAGS,
      helpArgs: ['exec', '--help'],
      probeArgs: ['exec', '--json', '--sandbox', 'read-only', '--skip-git-repo-check'],
      probeStdin: 'say ok',
      // A completed turn means the request reached the provider; a failed turn does not.
      probeOk: (stdout) =>
        stdout.split('\n').some((l) => str(jsonLine(l)?.type) === 'turn.completed'),
    });
  },

  async launch(input: LaunchInput): Promise<LaunchResult> {
    let tokens: TokenUsage | null = null;
    let result: CodexResult | null = null;
    const r = await runProcess({
      cmd: 'codex',
      args: codexArgs(input),
      cwd: input.worktree,
      stdin: input.packet,
      timeoutMs: input.caps.timeoutMs,
      signal: input.signal,
      meter: input.meter,
      logPath: input.logPath,
      onStdoutLine: (line) => {
        const parsed = parseCodexLine(line, input.model);
        for (const e of parsed.events) {
          if (e.kind === 'usage') {
            tokens = addTokens(tokens, e.tokens);
            input.meter.addUsage(e.tokens, e.model, e.cacheWrite);
          }
          input.onEvent(e);
        }
        // A failed turn must not erase the usage a completed one already reported.
        if (parsed.result) result = { ...parsed.result, tokens: parsed.result.tokens ?? result?.tokens ?? null };
      },
    });
    const res = result as CodexResult | null;
    return {
      exitCode: r.exitCode,
      status: agentStatus(r.status, res),
      tokens: res?.tokens ?? tokens,
      costUsd: input.meter.costUsd,
      durationMs: r.durationMs,
      raw: res,
      // Codex names no model anywhere in its stream; the race falls back to the request.
      model: null,
    };
  },
};

export { ZERO_TOKENS };
