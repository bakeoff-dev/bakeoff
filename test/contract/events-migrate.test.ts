import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../src/contract/schema';
import { parseEventLines, reduceEvents } from '../../src/contract/reducer';

// Trimmed verbatim from bakeoff-scratch run 20260923-mosj, written before models
// existed: agent.started carries no model, and race.finished embeds a v1 record.
const v1 = readFileSync('test/fixtures/v1/events.jsonl', 'utf8');

describe('reading a version-1 event log', () => {
  it('parses instead of rejecting', () => {
    const events = parseEventLines(v1);
    expect(events.length).toBe(7);
    expect(events.map((e) => e.type)).toEqual([
      'race.started', 'agent.started', 'agent.progress', 'agent.progress',
      'agent.exited', 'agent.pr_opened', 'race.finished',
    ]);
  });

  it('defaults agent.started to a null model', () => {
    const started = parseEventLines(v1).find((e) => e.type === 'agent.started');
    expect(started?.type === 'agent.started' && started.model).toBeNull();
  });

  it('migrates the record embedded in race.finished', () => {
    const finished = parseEventLines(v1).at(-1);
    expect(finished?.type).toBe('race.finished');
    if (finished?.type !== 'race.finished') throw new Error('unreachable');
    expect(finished.record.schemaVersion).toBe(SCHEMA_VERSION);
    for (const a of finished.record.agents) expect(a.model).toBeNull();
  });

  it('replays into a usable state, which is what the UI does with it', () => {
    const state = reduceEvents(parseEventLines(v1));
    expect(state.finished).toBe(true);
    expect(state.agents).toHaveLength(1);
    expect(state.agents[0]?.driver).toBe('claude');
    expect(state.agents[0]?.model).toBeNull();
    expect(state.agents[0]?.status).toBe('ok');
    expect(state.agents[0]?.prNumber).toBe(5);
  });

  it('still reads a current log', () => {
    const current = readFileSync('src/contract/fixtures/events.jsonl', 'utf8');
    const events = parseEventLines(current);
    const started = events.find((e) => e.type === 'agent.started');
    expect(started?.type === 'agent.started' && started.model).toBe('claude-opus-5');
  });

  it('still rejects a line that is not an event at all', () => {
    expect(() => parseEventLines('{"type":"nope"}')).toThrow();
    expect(() => parseEventLines('{"type":"agent.started"}')).toThrow();
  });
});
