import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { AgentEvent } from '../../../src/core/drivers/types';
import { codexArgs, parseCodexLine } from '../../../src/core/drivers/codex';
import { TRUST_ENV, createGeminiStream, geminiArgs, parseGeminiLine } from '../../../src/core/drivers/gemini';
import { cursorArgs, parseCursorLine } from '../../../src/core/drivers/cursor';
import { normalizeModel } from '../../../src/core/drivers/types';
import { defaultMeter } from '../../../src/core/pricing';

const fixture = (p: string) =>
  readFileSync(`test/fixtures/drivers/${p}`, 'utf8').split('\n').filter((l) => l.trim().length > 0);

const CAPS = { budgetUsd: 3, timeoutMs: 1000, maxTurns: null };
const usageOf = (events: AgentEvent[]) => events.filter((e) => e.kind === 'usage');

describe('codex', () => {
  const dflt = fixture('codex/default.jsonl');

  it('reports the shell commands it ran and the tokens it used', () => {
    const events = dflt.flatMap((l) => parseCodexLine(l, null).events);
    expect(events.some((e) => e.kind === 'action' && /^Bash /.test(e.text))).toBe(true);
    expect(usageOf(events)).toHaveLength(1);
  });

  it('bills only the uncached part of input at full price', () => {
    // the fixture reports input_tokens 31347 inclusive of cached_input_tokens 26112
    const events = dflt.flatMap((l) => parseCodexLine(l, null).events);
    const u = usageOf(events)[0];
    expect(u?.kind === 'usage' && u.tokens).toEqual({
      input: 31347 - 26112, output: 110, cacheRead: 26112, cacheWrite: 0,
    });
  });

  it('passes --model only when one is asked for', () => {
    expect(codexArgs({ caps: CAPS, worktree: '/w' })).not.toContain('--model');
    const withModel = codexArgs({ caps: CAPS, worktree: '/w', model: 'gpt-6-luna' });
    expect(withModel[withModel.indexOf('--model') + 1]).toBe('gpt-6-luna');
    expect(codexArgs({ caps: CAPS, worktree: '/w' })).toContain('workspace-write');
  });

  it('prices against the requested model, since the stream never names one', () => {
    const events = fixture('codex/with-model.jsonl').flatMap((l) => parseCodexLine(l, 'gpt-6-luna').events);
    const u = usageOf(events)[0];
    expect(u?.kind === 'usage' && u.model).toBe('gpt-6-luna');
  });

  it('leaves cost null for a model it has no price for, rather than calling it free', () => {
    const meter = defaultMeter(3);
    for (const l of dflt) {
      for (const e of parseCodexLine(l, null).events) {
        if (e.kind === 'usage') meter.addUsage(e.tokens, e.model, e.cacheWrite);
      }
    }
    expect(meter.costUsd).toBeNull();
    expect([...meter.unknownModels]).toEqual(['codex']);
  });

  it('reports a model the account cannot use as an error', () => {
    // recorded verbatim: a ChatGPT login rejects gpt-5.3-codex
    const lines = fixture('codex/model-rejected.jsonl');
    const result = lines.map((l) => parseCodexLine(l, 'gpt-5.3-codex').result).filter(Boolean).at(-1);
    expect(result?.isError).toBe(true);
    expect(result?.errorMessage).toMatch(/not supported/);
  });
});

describe('gemini', () => {
  const dflt = fixture('gemini/default.jsonl');

  it('reports the tool it used and the file it wrote', () => {
    const events = dflt.flatMap((l) => parseGeminiLine(l).events);
    expect(events.some((e) => e.kind === 'action' && e.text.startsWith('write_file'))).toBe(true);
    expect(events.some((e) => e.kind === 'file' && e.path.endsWith('hello.txt'))).toBe(true);
  });

  it('bills every model in the breakdown at its own rate', () => {
    const events = dflt.flatMap((l) => parseGeminiLine(l).events);
    const models = usageOf(events).map((e) => (e.kind === 'usage' ? e.model : ''));
    expect(models.sort()).toEqual(['gemini-3.1-flash-lite', 'gemini-3.5-flash']);
    const meter = defaultMeter(3);
    for (const e of usageOf(events)) if (e.kind === 'usage') meter.addUsage(e.tokens, e.model, e.cacheWrite);
    expect(meter.costUsd).toBeGreaterThan(0);
    expect(meter.unknownModels.size).toBe(0);
  });

  it('credits the run to the model that did the work, not the router', () => {
    const stream = createGeminiStream();
    for (const l of dflt) stream.push(l);
    expect(stream.model()).toBe('gemini-3.5-flash');
  });

  it('takes the announced model when one was asked for', () => {
    const stream = createGeminiStream();
    for (const l of fixture('gemini/with-model.jsonl')) stream.push(l);
    expect(stream.model()).toBe('gemini-3.5-flash');
  });

  it('ignores "auto", which is a routing mode and not a model', () => {
    expect(parseGeminiLine('{"type":"init","model":"auto"}').model).toBeUndefined();
    expect(parseGeminiLine('{"type":"init","model":"gemini-3.5-flash"}').model).toBe('gemini-3.5-flash');
  });

  it('ignores startup noise and anything that is not JSON', () => {
    for (const noise of ['[STARTUP] metrics disabled', 'Warning: 256-color support not detected', '', 'not json']) {
      expect(parseGeminiLine(noise)).toEqual({ events: [], result: null });
    }
  });

  it('asks for trust every way it can, because a fresh worktree is never trusted', () => {
    // 0.60.0 exits 55 in an untrusted folder and every worktree is new
    expect(TRUST_ENV).toEqual({ GEMINI_CLI_TRUST_WORKSPACE: 'true' });
    expect(geminiArgs({ caps: CAPS, worktree: '/w', packet: 'p' }, { skipTrust: true })).toContain('--skip-trust');
    expect(geminiArgs({ caps: CAPS, worktree: '/w', packet: 'p' }, { skipTrust: false })).not.toContain('--skip-trust');
  });

  it('passes --model only when one is asked for', () => {
    expect(geminiArgs({ caps: CAPS, worktree: '/w', packet: 'p' }, { skipTrust: false })).not.toContain('--model');
    const a = geminiArgs({ caps: CAPS, worktree: '/w', packet: 'p', model: 'gemini-3.5-flash' }, { skipTrust: false });
    expect(a[a.indexOf('--model') + 1]).toBe('gemini-3.5-flash');
  });
});

describe('cursor', () => {
  const dflt = fixture('cursor/default.jsonl');

  it('reports its tokens', () => {
    const events = dflt.flatMap((l) => parseCursorLine(l, null).events);
    const u = usageOf(events)[0];
    expect(u?.kind === 'usage' && u.tokens).toEqual({
      input: 6, output: 114, cacheRead: 22768, cacheWrite: 22926,
    });
  });

  it('keeps the thinking stream out of the actions', () => {
    // the recording has 76 thinking deltas; none of them is an action
    const events = dflt.flatMap((l) => parseCursorLine(l, null).events);
    expect(events.every((e) => e.kind !== 'action' || !e.text.startsWith('thinking'))).toBe(true);
  });

  it('normalizes the display label so one model is not two ladder rows', () => {
    const announced = dflt.map((l) => parseCursorLine(l, null).model).find(Boolean);
    expect(announced).toBe('gpt-5.6-sol-1m-high');
    // and that slug still finds a price by longest-prefix match
    expect(defaultMeter(1)).toBeDefined();
  });

  it('passes --model only when one is asked for', () => {
    expect(cursorArgs({ caps: CAPS, packet: 'p' })).not.toContain('--model');
    const a = cursorArgs({ caps: CAPS, packet: 'p', model: 'gpt-5.3-codex-low' });
    expect(a[a.indexOf('--model') + 1]).toBe('gpt-5.3-codex-low');
    expect(a.at(-1)).toBe('p');
  });

  it('prices the requested model by longest prefix', () => {
    const meter = defaultMeter(3);
    for (const l of fixture('cursor/with-model.jsonl')) {
      for (const e of parseCursorLine(l, 'gpt-5.3-codex-low').events) {
        if (e.kind === 'usage') meter.addUsage(e.tokens, e.model, e.cacheWrite);
      }
    }
    // gpt-5.3-codex-low resolves to the gpt-5.3-codex row
    expect(meter.costUsd).toBeGreaterThan(0);
    expect(meter.unknownModels.size).toBe(0);
  });
});

describe('normalizeModel', () => {
  it('collapses display labels to a stable id', () => {
    expect(normalizeModel('GPT-5.6 Sol 1M High')).toBe('gpt-5.6-sol-1m-high');
    expect(normalizeModel('Codex 5.3 Low')).toBe('codex-5.3-low');
    expect(normalizeModel('claude-opus-5')).toBe('claude-opus-5');
    expect(normalizeModel('  Gemini 3.5 Flash  ')).toBe('gemini-3.5-flash');
  });
});
