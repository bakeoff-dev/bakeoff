import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { claudeArgs, parseClaudeLine, probeAuthOk } from '../../../src/core/drivers/claude';

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
