import { describe, expect, it } from 'vitest';
import { createClaudeStream } from '../../../src/core/drivers/claude';
import { agentStatus } from '../../../src/core/drivers/types';

const usage = (over: Record<string, unknown> = {}) => ({
  input_tokens: 2, output_tokens: 10, cache_read_input_tokens: 100, cache_creation_input_tokens: 0,
  cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 0 },
  ...over,
});

const line = (id: string, u: Record<string, unknown>) =>
  JSON.stringify({ type: 'assistant', parent_tool_use_id: null, message: { id, model: 'claude-opus-5', usage: u, content: [] } });

const usageEvents = (lines: string[]) => {
  const s = createClaudeStream();
  return lines.flatMap((l) => s.push(l).events).filter((e) => e.kind === 'usage');
};

describe('metering repeated usage lines', () => {
  it('meters an identical repeat exactly once', () => {
    const events = usageEvents([line('m1', usage()), line('m1', usage())]);
    expect(events).toHaveLength(1);
  });

  it('meters the growth when a later line for the same message reports more', () => {
    // Claude repeats a message's usage on every content block, and the output count
    // climbs as the message streams. Only the increment is new spend.
    const events = usageEvents([
      line('m1', usage({ output_tokens: 10 })),
      line('m1', usage({ output_tokens: 250 })),
    ]);
    expect(events).toHaveLength(2);
    expect(events[0]?.kind === 'usage' && events[0].tokens.output).toBe(10);
    expect(events[1]?.kind === 'usage' && events[1].tokens.output).toBe(240);
    // the unchanged components must not be billed twice
    expect(events[1]?.kind === 'usage' && events[1].tokens.cacheRead).toBe(0);
    expect(events[1]?.kind === 'usage' && events[1].tokens.input).toBe(0);
  });

  it('totals the deltas to the largest usage the message ever reported', () => {
    const events = usageEvents([
      line('m1', usage({ output_tokens: 10, cache_read_input_tokens: 100 })),
      line('m1', usage({ output_tokens: 250, cache_read_input_tokens: 100 })),
      line('m1', usage({ output_tokens: 900, cache_read_input_tokens: 140 })),
    ]);
    const total = events.reduce(
      (a, e) => (e.kind === 'usage' ? { out: a.out + e.tokens.output, read: a.read + e.tokens.cacheRead } : a),
      { out: 0, read: 0 },
    );
    expect(total).toEqual({ out: 900, read: 140 });
  });

  it('never bills a negative delta if a line reports less', () => {
    const events = usageEvents([
      line('m1', usage({ output_tokens: 900 })),
      line('m1', usage({ output_tokens: 10 })),
    ]);
    const out = events.reduce((a, e) => a + (e.kind === 'usage' ? e.tokens.output : 0), 0);
    expect(out).toBe(900);
  });

  it('meters cache-write growth in the tier it was written to', () => {
    const events = usageEvents([
      line('m1', usage({ cache_creation_input_tokens: 100, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 100 } })),
      line('m1', usage({ cache_creation_input_tokens: 400, cache_creation: { ephemeral_5m_input_tokens: 0, ephemeral_1h_input_tokens: 400 } })),
    ]);
    expect(events).toHaveLength(2);
    expect(events[1]?.kind === 'usage' && events[1].cacheWrite).toEqual({ m5: 0, h1: 300 });
  });

  it('keeps separate messages separate', () => {
    const events = usageEvents([line('m1', usage()), line('m2', usage()), line('m1', usage())]);
    expect(events).toHaveLength(2);
  });
});

describe('agentStatus', () => {
  it('reports a CLI that stopped itself on cost as over budget, not crashed', () => {
    expect(agentStatus('ok', { isError: true, budgetStop: true })).toBe('budget_exceeded');
  });

  it('reports a real CLI error as crashed', () => {
    expect(agentStatus('ok', { isError: true, budgetStop: false })).toBe('crashed');
  });

  it('passes a clean run through', () => {
    expect(agentStatus('ok', { isError: false, budgetStop: false })).toBe('ok');
    expect(agentStatus('ok', null)).toBe('ok');
  });

  it('lets the process outcome win when the process did not finish cleanly', () => {
    expect(agentStatus('timeout', null)).toBe('timeout');
    expect(agentStatus('budget_exceeded', null)).toBe('budget_exceeded');
    expect(agentStatus('crashed', null)).toBe('crashed');
    // an abort is our own doing; there is no separate agent status for it
    expect(agentStatus('aborted', null)).toBe('crashed');
  });
});
