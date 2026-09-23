import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { claudeArgs, createClaudeStream, parseClaudeLine, probeAuthOk } from '../../../src/core/drivers/claude';
import { addTokens } from '../../../src/core/drivers/types';
import { defaultMeter } from '../../../src/core/pricing';
import type { TokenUsage } from '@contract';

const lines = readFileSync('test/fixtures/drivers/claude/stream.jsonl', 'utf8').split('\n').filter(Boolean);

describe('claude parser', () => {
  it('turns tool_use into action + file events and the result line into totals', () => {
    const events = lines.flatMap((l) => parseClaudeLine(l).events);
    expect(events.some((e) => e.kind === 'action' && /^Write /.test(e.text))).toBe(true);
    expect(events.some((e) => e.kind === 'file' && e.path.endsWith('hello.txt'))).toBe(true);
    expect(events.some((e) => e.kind === 'usage')).toBe(true);
    const result = parseClaudeLine(lines.at(-1)!).result;
    expect(result).not.toBeNull();
    expect(result!.costUsd).toBeGreaterThan(0);
    expect(result!.tokens!.input).toBeGreaterThan(0);
    expect(result!.isError).toBe(false);
  });

  it('surfaces the model the CLI actually ran', () => {
    const models = lines.map((l) => parseClaudeLine(l).model).filter(Boolean);
    expect(models.length).toBeGreaterThan(0);
    expect(models[0]).toBe('claude-opus-5');
  });

  it('reports usage with the model the message came from', () => {
    const usage = lines.flatMap((l) => parseClaudeLine(l).events).filter((e) => e.kind === 'usage');
    const first = usage[0];
    expect(first?.kind).toBe('usage');
    if (first?.kind !== 'usage') throw new Error('unreachable');
    expect(first.model).toBe('claude-opus-5');
    // cache_creation_input_tokens maps to cacheWrite, cache_read_input_tokens to cacheRead
    expect(first.tokens.cacheWrite).toBeGreaterThan(0);
    expect(first.tokens.cacheRead).toBeGreaterThan(0);
  });

  it('is tolerant of garbage lines', () => {
    expect(parseClaudeLine('not json')).toEqual({ events: [], result: null });
    expect(parseClaudeLine('{"type":"weird"}')).toEqual({ events: [], result: null });
    expect(parseClaudeLine('null')).toEqual({ events: [], result: null });
    expect(parseClaudeLine('{"type":"assistant"}')).toEqual({ events: [], result: null });
    expect(parseClaudeLine('{"type":"assistant","message":{"content":"nope"}}')).toEqual({ events: [], result: null });
  });

  it('ignores the system, user and rate_limit lines the CLI interleaves', () => {
    const noise = lines.filter((l) => /"type":"(system|user|rate_limit_event)"/.test(l));
    expect(noise.length).toBeGreaterThan(0);
    for (const l of noise) expect(parseClaudeLine(l)).toEqual({ events: [], result: null });
  });
});

describe('claudeArgs', () => {
  it('builds the headless command', () => {
    const args = claudeArgs({ caps: { budgetUsd: 2.5, timeoutMs: 1, maxTurns: 10 }, worktree: '/w' }, { bare: false });
    expect(args).toEqual([
      '-p', '--output-format', 'stream-json', '--verbose',
      '--permission-mode', 'acceptEdits', '--max-budget-usd', '2.5', '--add-dir', '/w',
    ]);
    expect(claudeArgs({ caps: { budgetUsd: 1, timeoutMs: 1, maxTurns: null }, worktree: '/w' }, { bare: true })).toContain('--bare');
  });

  it('passes --model when one is requested', () => {
    const args = claudeArgs(
      { caps: { budgetUsd: 1, timeoutMs: 1, maxTurns: null }, worktree: '/w', model: 'claude-sonnet-5' },
      { bare: false },
    );
    expect(args).toContain('--model');
    expect(args[args.indexOf('--model') + 1]).toBe('claude-sonnet-5');
  });

  it('passes no model flag when none is requested, leaving the CLI default alone', () => {
    for (const model of [null, undefined]) {
      const args = claudeArgs(
        { caps: { budgetUsd: 1, timeoutMs: 1, maxTurns: null }, worktree: '/w', model },
        { bare: false },
      );
      expect(args).not.toContain('--model');
    }
  });

  it('never passes --max-turns, which 2.1.259 does not accept', () => {
    const args = claudeArgs({ caps: { budgetUsd: 1, timeoutMs: 1, maxTurns: 5 }, worktree: '/w' }, { bare: false });
    expect(args).not.toContain('--max-turns');
  });
});

describe('probeAuthOk', () => {
  it('accepts a clean probe result', () => {
    expect(probeAuthOk('{"type":"result","is_error":false,"subtype":"success"}')).toBe(true);
  });

  it('accepts a budget stop: being billed proves the API accepted us', () => {
    // Claude bills the system-prompt cache write before the first token, so a low
    // cap trips on turn one. That is a spend limit, not an auth failure.
    const line = '{"type":"result","is_error":true,"subtype":"error_max_budget_usd","total_cost_usd":0.21}';
    expect(probeAuthOk(line)).toBe(true);
  });

  it('rejects a real error, empty output, or garbage', () => {
    expect(probeAuthOk('{"type":"result","is_error":true,"subtype":"error_during_execution"}')).toBe(false);
    expect(probeAuthOk('')).toBe(false);
    expect(probeAuthOk('Invalid API key')).toBe(false);
  });
});

describe('cost metering against a recorded race', () => {
  const replay = readFileSync('test/fixtures/drivers/claude/usage-replay.jsonl', 'utf8')
    .split('\n')
    .filter(Boolean);

  // Recorded from bakeoff-dev/scratch run 20260923-mosj. The CLI's own result line
  // reported this, so it is ground truth for what the race actually cost.
  const REAL_COST = 0.651;

  const replayInto = (meter: ReturnType<typeof defaultMeter>) => {
    const stream = createClaudeStream();
    for (const line of replay) {
      for (const e of stream.push(line).events) {
        if (e.kind === 'usage') meter.addUsage(e.tokens, e.model, e.cacheWrite);
        if (e.kind === 'cost') meter.setCost(e.costUsd);
      }
    }
  };

  it('meters within a cent of what the run really cost', () => {
    const meter = defaultMeter(10);
    replayInto(meter);
    expect(meter.costUsd).not.toBeNull();
    expect(Math.abs((meter.costUsd ?? 0) - REAL_COST)).toBeLessThan(0.05);
  });

  it('no longer overestimates the live running cost', () => {
    // Before the fix this replay metered $0.79 against a real $0.65: every content
    // block repeated its message's usage, and 1h cache writes were billed at the 5m rate.
    const meter = defaultMeter(10);
    const stream = createClaudeStream();
    for (const line of replay) {
      for (const e of stream.push(line).events) {
        if (e.kind === 'usage') meter.addUsage(e.tokens, e.model, e.cacheWrite);
      }
    }
    const live = meter.costUsd ?? 0;
    expect(live).toBeLessThan(REAL_COST);
    expect(live).toBeGreaterThan(0.45);

    // The whole remaining gap is output tokens: Claude's assistant lines report a partial
    // count mid-stream (128 across the race) while the result envelope reports 6043.
    // Add those back and the live estimate reconciles exactly.
    const OUTPUT_RATE_PER_TOKEN = 25 / 1_000_000;
    const missingOutput = (6043 - 128) * OUTPUT_RATE_PER_TOKEN;
    expect(live + missingOutput).toBeCloseTo(0.650954, 5);
  });

  it('counts each message id once, however many content blocks repeat it', () => {
    const stream = createClaudeStream();
    const usage = replay.flatMap((l) => stream.push(l).events).filter((e) => e.kind === 'usage');
    // 29 recorded lines, 28 of them assistant blocks, but only 14 distinct messages
    expect(replay.length).toBe(29);
    expect(usage.length).toBe(14);
    const total = usage.reduce(
      (a, e) => (e.kind === 'usage' ? addTokens(a, e.tokens) : a),
      null as TokenUsage | null,
    );
    // matches the result envelope's own totals exactly
    expect(total?.input).toBe(28);
    expect(total?.cacheRead).toBe(468_158);
    expect(total?.cacheWrite).toBe(26_566);
  });

  it('bills a one-hour cache write at twice the input rate, not 1.25x', () => {
    const tokens = { input: 0, output: 0, cacheRead: 0, cacheWrite: 1_000_000 };
    const oneHour = defaultMeter(100);
    oneHour.addUsage(tokens, 'claude-opus-5', { m5: 0, h1: 1_000_000 });
    expect(oneHour.costUsd).toBeCloseTo(10, 6);

    const fiveMin = defaultMeter(100);
    fiveMin.addUsage(tokens, 'claude-opus-5', { m5: 1_000_000, h1: 0 });
    expect(fiveMin.costUsd).toBeCloseTo(6.25, 6);

    // no split reported: fall back to the 5m rate rather than guessing
    const unknown = defaultMeter(100);
    unknown.addUsage(tokens, 'claude-opus-5');
    expect(unknown.costUsd).toBeCloseTo(6.25, 6);
  });
});
