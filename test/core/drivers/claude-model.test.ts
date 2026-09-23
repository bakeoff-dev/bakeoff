import { describe, expect, it } from 'vitest';
import { createClaudeStream } from '../../../src/core/drivers/claude';

const usage = (output: number) => ({
  input_tokens: 2, output_tokens: output, cache_read_input_tokens: 10, cache_creation_input_tokens: 0,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
});

const assistant = (id: string, model: string, parent: string | null, output = 100) =>
  JSON.stringify({
    type: 'assistant',
    parent_tool_use_id: parent,
    message: { id, model, usage: usage(output), content: [{ type: 'text' }] },
  });

const result = (modelUsage: Record<string, { outputTokens: number; canonicalModel?: string }>) =>
  JSON.stringify({
    type: 'result', subtype: 'success', is_error: false, duration_ms: 1000, total_cost_usd: 0.5,
    usage: usage(500), modelUsage,
  });

const drive = (lines: string[]) => {
  const stream = createClaudeStream();
  for (const l of lines) stream.push(l);
  return stream;
};

describe('the model a race is credited to', () => {
  it('ignores a subagent running on another model', () => {
    // A Task subagent can run on a cheaper model. Crediting the race to it would
    // put the run on the wrong ladder row.
    const stream = drive([
      assistant('m1', 'claude-opus-5', null),
      assistant('m2', 'claude-haiku-4-5', 'toolu_01'),
      assistant('m3', 'claude-haiku-4-5', 'toolu_01'),
    ]);
    expect(stream.model()).toBe('claude-opus-5');
  });

  it('still meters the subagent, whose tokens cost real money', () => {
    const stream = createClaudeStream();
    const events = [
      assistant('m1', 'claude-opus-5', null),
      assistant('m2', 'claude-haiku-4-5', 'toolu_01'),
    ].flatMap((l) => stream.push(l).events);
    const models = events.filter((e) => e.kind === 'usage').map((e) => (e.kind === 'usage' ? e.model : ''));
    expect(models).toEqual(['claude-opus-5', 'claude-haiku-4-5']);
  });

  it('prefers the result line and picks the model with the most output', () => {
    const stream = drive([
      assistant('m1', 'claude-opus-5', null),
      assistant('m2', 'claude-haiku-4-5', 'toolu_01'),
      result({ 'claude-opus-5': { outputTokens: 9000 }, 'claude-haiku-4-5': { outputTokens: 120 } }),
    ]);
    expect(stream.model()).toBe('claude-opus-5');
  });

  it('uses the canonical model, so a context-window suffix does not split the ladder', () => {
    const stream = drive([
      assistant('m1', 'claude-opus-5', null),
      result({ 'claude-opus-5[1m]': { outputTokens: 9000, canonicalModel: 'claude-opus-5' } }),
    ]);
    expect(stream.model()).toBe('claude-opus-5');
  });

  it('falls back to the last top-level message when the run never reached a result', () => {
    // timeout or crash: no result envelope is ever written
    const stream = drive([
      assistant('m1', 'claude-opus-5', null),
      assistant('m2', 'claude-haiku-4-5', 'toolu_01'),
    ]);
    expect(stream.model()).toBe('claude-opus-5');
  });

  it('reports nothing when the stream never named a model', () => {
    expect(createClaudeStream().model()).toBeNull();
    expect(drive(['not json', '{"type":"system"}']).model()).toBeNull();
  });

  it('treats a missing parent_tool_use_id as top level', () => {
    const line = JSON.stringify({
      type: 'assistant',
      message: { id: 'm1', model: 'claude-opus-5', usage: usage(10), content: [] },
    });
    expect(drive([line]).model()).toBe('claude-opus-5');
  });
});
