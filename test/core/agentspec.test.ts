import { describe, expect, it } from 'vitest';
import { formatAgentSpec, parseAgentSpec, parseAgentSpecs } from '../../src/core/agentspec';
import { normalizeModel } from '../../src/core/drivers/types';

describe('parseAgentSpec', () => {
  it('reads a bare driver as the CLI default model', () => {
    expect(parseAgentSpec('claude')).toEqual({ driver: 'claude', model: null });
    expect(parseAgentSpec('codex')).toEqual({ driver: 'codex', model: null });
  });

  it('reads driver:model', () => {
    expect(parseAgentSpec('claude:claude-opus-5')).toEqual({ driver: 'claude', model: 'claude-opus-5' });
    expect(parseAgentSpec('codex:gpt-5.6-sol')).toEqual({ driver: 'codex', model: 'gpt-5.6-sol' });
  });

  it('treats auto as the CLI default, same as omitting it', () => {
    expect(parseAgentSpec('claude:auto')).toEqual({ driver: 'claude', model: null });
    expect(parseAgentSpec('claude:AUTO')).toEqual({ driver: 'claude', model: null });
  });

  it('keeps a provider-qualified model intact', () => {
    // only the first colon separates; the rest is the model verbatim
    expect(parseAgentSpec('opencode:anthropic/claude-opus-5')).toEqual({
      driver: 'opencode', model: 'anthropic/claude-opus-5',
    });
  });

  it('tolerates surrounding whitespace', () => {
    expect(parseAgentSpec('  claude : claude-opus-5 ')).toEqual({ driver: 'claude', model: 'claude-opus-5' });
  });

  it('accepts every driver the registry ships', () => {
    for (const id of ['claude', 'codex', 'gemini', 'cursor']) {
      expect(parseAgentSpec(id).driver).toBe(id);
    }
  });

  it('rejects an unknown driver', () => {
    expect(() => parseAgentSpec('aider')).toThrow(/aider/);
    expect(() => parseAgentSpec('aider:some-model')).toThrow(/aider/);
  });

  it('rejects an empty model after the colon', () => {
    expect(() => parseAgentSpec('claude:')).toThrow(/model/i);
    expect(() => parseAgentSpec('claude:   ')).toThrow(/model/i);
  });

  it('rejects an empty spec', () => {
    expect(() => parseAgentSpec('')).toThrow();
    expect(() => parseAgentSpec('   ')).toThrow();
  });
});

describe('parseAgentSpecs', () => {
  it('parses a comma-separated list', () => {
    expect(parseAgentSpecs('claude:claude-opus-5,codex')).toEqual([
      { driver: 'claude', model: 'claude-opus-5' },
      { driver: 'codex', model: null },
    ]);
  });

  it('parses an array, as bakeoff.yml supplies it', () => {
    expect(parseAgentSpecs(['claude', 'codex:gpt-5.6-sol'])).toEqual([
      { driver: 'claude', model: null },
      { driver: 'codex', model: 'gpt-5.6-sol' },
    ]);
  });

  it('rejects the same driver twice, whatever the models', () => {
    // branches, worktrees and lanes are all keyed by driver in v1
    expect(() => parseAgentSpecs('claude:claude-opus-5,claude:claude-sonnet-5')).toThrow(/claude/);
    expect(() => parseAgentSpecs('claude,claude')).toThrow(/once/i);
  });

  it('rejects an empty list', () => {
    expect(() => parseAgentSpecs('')).toThrow();
    expect(() => parseAgentSpecs([])).toThrow();
  });

  it('ignores blank entries from a trailing comma', () => {
    expect(parseAgentSpecs('claude,')).toEqual([{ driver: 'claude', model: null }]);
  });
});

describe('formatAgentSpec', () => {
  it('round-trips', () => {
    expect(formatAgentSpec({ driver: 'claude', model: null })).toBe('claude');
    expect(formatAgentSpec({ driver: 'claude', model: 'claude-opus-5' })).toBe('claude:claude-opus-5');
    expect(parseAgentSpec(formatAgentSpec({ driver: 'codex', model: 'gpt-5.6-sol' }))).toEqual({
      driver: 'codex', model: 'gpt-5.6-sol',
    });
  });
});

describe('a pinned model is normalized to its ladder form', () => {
  it('does not split a row on case', () => {
    expect(parseAgentSpec('claude:Claude-Opus-5').model).toBe('claude-opus-5');
    expect(parseAgentSpec('claude:CLAUDE-OPUS-5').model).toBe('claude-opus-5');
  });

  it('does not split a row on spacing', () => {
    expect(parseAgentSpec('cursor:Codex 5.3 Low').model).toBe('codex-5.3-low');
    expect(parseAgentSpec('cursor:  Codex  5.3  Low  ').model).toBe('codex-5.3-low');
  });

  it('matches what a driver reports, so the request and the report share one row', () => {
    // cursor announces "Codex 5.3 Low"; pinning that name must land on the same key
    expect(parseAgentSpec('cursor:Codex 5.3 Low').model).toBe(normalizeModel('Codex 5.3 Low'));
  });

  it('leaves a provider-qualified id alone', () => {
    expect(parseAgentSpec('opencode:anthropic/claude-opus-5').model).toBe('anthropic/claude-opus-5');
  });
});
