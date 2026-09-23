import type { Caps, TokenUsage } from '@contract';
import { runProcess } from '../process';
import { actionLabel, jsonLine, num, obj, probeDoctor, str } from './shared';
import {
  addTokens, agentStatus, normalizeModel,
  type AgentEvent, type Driver, type LaunchInput, type LaunchResult,
} from './types';

export interface CursorResult {
  tokens: TokenUsage | null;
  isError: boolean;
  /** cursor-agent has no budget flag, so it never stops itself on cost. */
  budgetStop: boolean;
}

const REQUIRED_FLAGS = ['--print', '--output-format', '--model', '--force'];
const WRITE_TOOLS = ['write', 'edit', 'create', 'str_replace', 'apply_patch'];

export function cursorArgs(i: { caps: Caps; model?: string | null; packet: string }): string[] {
  const args = ['--print', '--output-format', 'stream-json', '--force'];
  if (i.model) args.push('--model', i.model);
  args.push(i.packet);
  return args;
}

function usageFrom(u: unknown): TokenUsage | null {
  if (!u || typeof u !== 'object') return null;
  const o = obj(u);
  return {
    input: num(o.inputTokens),
    output: num(o.outputTokens),
    cacheRead: num(o.cacheReadTokens),
    cacheWrite: num(o.cacheWriteTokens),
  };
}

function toolTarget(input: unknown): string {
  const o = obj(input);
  return str(o.path) || str(o.file_path) || str(o.command) || str(o.pattern) || '';
}

export interface ParsedCursorLine { events: AgentEvent[]; result: CursorResult | null; model?: string }

export function parseCursorLine(line: string, model: string | null): ParsedCursorLine {
  const o = jsonLine(line);
  if (o === null) return { events: [], result: null };
  const type = str(o.type);
  const events: AgentEvent[] = [];

  if (type === 'system' && str(o.subtype) === 'init') {
    const label = str(o.model);
    return label ? { events, result: null, model: normalizeModel(label) } : { events, result: null };
  }

  if (type === 'tool_call') {
    const name = str(o.tool_name) || str(obj(o.tool).name) || 'tool';
    const target = toolTarget(o.input ?? o.parameters ?? obj(o.tool).input);
    events.push({ kind: 'action', text: actionLabel(name, target) });
    if (WRITE_TOOLS.some((w) => name.toLowerCase().includes(w)) && target) {
      events.push({ kind: 'file', path: target });
    }
    return { events, result: null };
  }

  if (type === 'result') {
    const tokens = usageFrom(o.usage);
    // cursor-agent names no model on the result line; price against what we asked for.
    if (tokens) events.push({ kind: 'usage', tokens, model: model ?? 'cursor' });
    return { events, result: { tokens, isError: o.is_error === true, budgetStop: false } };
  }

  // `thinking` deltas arrive dozens per turn and say nothing a reader needs.
  return { events, result: null };
}

export const cursorDriver: Driver = {
  id: 'cursor',
  displayName: 'Cursor',
  color: '#A99BF0',

  async doctor() {
    return probeDoctor({
      bin: 'cursor-agent',
      installHint: 'install: curl https://cursor.com/install -fsS | bash',
      requiredFlags: REQUIRED_FLAGS,
      // --force also answers the workspace-trust prompt, which a fresh temp dir always
      // raises; without it the probe sits on "Do you trust the contents of this directory?".
      probeArgs: ['--print', '--output-format', 'stream-json', '--force', 'say ok'],
      probeOk: (stdout) =>
        stdout.split('\n').some((l) => {
          const o = jsonLine(l);
          return str(o?.type) === 'result' && o?.is_error !== true;
        }),
    });
  },

  async launch(input: LaunchInput): Promise<LaunchResult> {
    let tokens: TokenUsage | null = null;
    let result: CursorResult | null = null;
    let announced: string | null = null;
    const r = await runProcess({
      cmd: 'cursor-agent',
      args: cursorArgs({ ...input, packet: input.packet }),
      cwd: input.worktree,
      stdin: '',
      timeoutMs: input.caps.timeoutMs,
      signal: input.signal,
      meter: input.meter,
      logPath: input.logPath,
      onStdoutLine: (line) => {
        const parsed = parseCursorLine(line, input.model);
        if (parsed.model) announced = parsed.model;
        for (const e of parsed.events) {
          if (e.kind === 'usage') {
            tokens = addTokens(tokens, e.tokens);
            input.meter.addUsage(e.tokens, e.model, e.cacheWrite);
          }
          input.onEvent(e);
        }
        if (parsed.result) result = parsed.result;
      },
    });
    const res = result as CursorResult | null;
    return {
      exitCode: r.exitCode,
      status: agentStatus(r.status, res),
      tokens: res?.tokens ?? tokens,
      costUsd: input.meter.costUsd,
      durationMs: r.durationMs,
      raw: res,
      /*
       * cursor-agent reports a display label ("Codex 5.3 Low"), not the id we passed
       * ("gpt-5.3-codex-low"). Taking the label when a model was requested would rename
       * it and put the run on a different ladder row than the one asked for, so the
       * request wins and the label only fills in for `auto`.
       */
      model: input.model ?? announced,
    };
  },
};
