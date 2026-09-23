import type { Caps, TokenUsage } from '@contract';
import { runProcess } from '../process';
import { actionLabel, jsonLine, num, obj, probeDoctor, str } from './shared';
import {
  addTokens, agentStatus, dominantModel, normalizeModel,
  type AgentEvent, type Driver, type LaunchInput, type LaunchResult, type ModelShare,
} from './types';

export interface GeminiResult {
  tokens: TokenUsage | null;
  isError: boolean;
  budgetStop: boolean;
  model: string | null;
}

const REQUIRED_FLAGS = ['--model', '--output-format', '--approval-mode', 'yolo'];
/**
 * Every Bakeoff worktree is a directory Gemini has never seen, and 0.60.0 exits 55
 * rather than run in one. The env var is the reliable opt-in; `--skip-trust` does the
 * same job and is feature-detected, so a build that drops either still works.
 */
export const TRUST_ENV = { GEMINI_CLI_TRUST_WORKSPACE: 'true' } as const;
const TRUST_FLAG = '--skip-trust';
const WRITE_TOOLS = ['write_file', 'replace', 'edit'];
/** Gemini prints "[STARTUP] ..." and other diagnostics on the stream; they are not events. */
const NOISE = /^\s*\[[A-Z]+\]/;

/** 0.60.0 reads the prompt from stdin, so the packet never has to fit in argv. */
export function geminiArgs(
  i: { caps: Caps; worktree: string; model?: string | null },
  opts: { skipTrust: boolean },
): string[] {
  const args = ['--output-format', 'stream-json', '--approval-mode', 'yolo'];
  if (i.model) args.push('--model', i.model);
  if (opts.skipTrust) args.push(TRUST_FLAG);
  return args;
}

/** `input` is the uncached remainder; `cached` is what was served from context cache. */
function usageFrom(stats: unknown): TokenUsage | null {
  const s = obj(stats);
  if (Object.keys(s).length === 0) return null;
  return {
    input: num(s.input),
    output: num(s.output_tokens),
    cacheRead: num(s.cached),
    cacheWrite: 0,
  };
}

function modelShares(stats: unknown): ModelShare[] {
  return Object.entries(obj(obj(stats).models)).map(([model, value]) => {
    const v = obj(value);
    return { model, output: num(v.output_tokens), total: num(v.total_tokens) };
  });
}

export interface ParsedGeminiLine { events: AgentEvent[]; result: GeminiResult | null; model?: string }

export function parseGeminiLine(line: string): ParsedGeminiLine {
  if (NOISE.test(line)) return { events: [], result: null };
  const o = jsonLine(line);
  if (o === null) return { events: [], result: null };
  const type = str(o.type);
  const events: AgentEvent[] = [];

  if (type === 'init') {
    const model = str(o.model);
    // "auto" is a routing mode, not a model; the result's breakdown names the real one.
    return model && model !== 'auto' ? { events, result: null, model: normalizeModel(model) } : { events, result: null };
  }

  if (type === 'tool_use') {
    const tool = str(o.tool_name);
    const params = obj(o.parameters);
    const path = str(params.file_path) || str(params.path) || str(params.absolute_path);
    events.push({ kind: 'action', text: actionLabel(tool, path || str(params.command)) });
    if (WRITE_TOOLS.includes(tool) && path) events.push({ kind: 'file', path });
    return { events, result: null };
  }

  if (type === 'result') {
    const stats = obj(o.stats);
    const perModel = modelShares(stats);
    // Bill each model its own share so a router model is priced at its own rate.
    for (const [model, value] of Object.entries(obj(stats.models))) {
      const tokens = usageFrom(value);
      if (tokens) events.push({ kind: 'usage', tokens, model: normalizeModel(model) });
    }
    if (perModel.length === 0) {
      const tokens = usageFrom(stats);
      if (tokens) events.push({ kind: 'usage', tokens, model: 'gemini' });
    }
    return {
      events,
      result: {
        tokens: usageFrom(stats),
        isError: str(o.status) !== 'success',
        budgetStop: false,
        model: dominantModel(perModel),
      },
    };
  }

  return { events, result: null };
}

export function createGeminiStream(): { push(line: string): ParsedGeminiLine; model(): string | null } {
  let announced: string | null = null;
  let fromResult: string | null = null;
  return {
    push(line: string) {
      const parsed = parseGeminiLine(line);
      if (parsed.model) announced = parsed.model;
      if (parsed.result?.model) fromResult = parsed.result.model;
      return parsed;
    },
    model: () => fromResult ?? announced,
  };
}

export const geminiDriver: Driver = {
  id: 'gemini',
  displayName: 'Gemini CLI',
  color: '#9BCB6E',

  async doctor() {
    return probeDoctor({
      bin: 'gemini',
      installHint: 'install: npm i -g @google/gemini-cli',
      requiredFlags: REQUIRED_FLAGS,
      probeArgs: ['--output-format', 'stream-json', '--approval-mode', 'yolo'],
      probeEnv: { ...TRUST_ENV },
      probeStdin: 'say ok',
      probeOk: (stdout) =>
        stdout.split('\n').some((l) => {
          const o = jsonLine(l);
          return str(o?.type) === 'result' && str(o?.status) === 'success';
        }),
    });
  },

  async launch(input: LaunchInput): Promise<LaunchResult> {
    const help = await import('../exec').then((m) => m.exec('gemini', ['--help']));
    const skipTrust = (help.stdout + help.stderr).includes(TRUST_FLAG);
    let tokens: TokenUsage | null = null;
    let result: GeminiResult | null = null;
    const stream = createGeminiStream();
    const r = await runProcess({
      cmd: 'gemini',
      args: geminiArgs(input, { skipTrust }),
      cwd: input.worktree,
      env: { ...TRUST_ENV },
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
          input.onEvent(e);
        }
        if (parsed.result) result = parsed.result;
      },
    });
    const res = result as GeminiResult | null;
    return {
      exitCode: r.exitCode,
      status: agentStatus(r.status, res),
      tokens: res?.tokens ?? tokens,
      costUsd: input.meter.costUsd,
      durationMs: r.durationMs,
      raw: res,
      model: stream.model(),
    };
  },
};
