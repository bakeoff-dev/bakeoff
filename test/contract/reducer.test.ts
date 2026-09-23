import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEventLines, reduceEvents, applyEvent, initialState } from '../../src/contract/reducer';
import { RunRecordSchema } from '../../src/contract/schema';

const events = parseEventLines(readFileSync('src/contract/fixtures/events.jsonl', 'utf8'));
const record = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

describe('reducer', () => {
  it('parses every fixture line', () => {
    expect(events.length).toBeGreaterThan(8);
    expect(events[0]?.type).toBe('race.started');
    expect(events.at(-1)?.type).toBe('race.finished');
  });
  it('replays to the fixture record', () => {
    const s = reduceEvents(events);
    expect(s.finished).toBe(true);
    expect(s.record).toEqual(record);
  });
  it('tracks live lane state before the race finishes', () => {
    const s = reduceEvents(events.slice(0, -1));
    expect(s.finished).toBe(false);
    const claude = s.agents.find((a) => a.driver === 'claude')!;
    expect(claude.status).toBe('ok');
    expect(claude.costUsd).toBe(1.42);
    expect(claude.prNumber).toBe(12);
    expect(claude.score?.total).toBe(75);
    const oc = s.agents.find((a) => a.driver === 'opencode')!;
    expect(oc.status).toBe('timeout');
    expect(oc.lastAction).toBe('reading src/index.ts');
  });
  it('ignores events for unknown drivers', () => {
    const s = applyEvent(initialState, { type: 'agent.started', at: 'x', driver: 'codex', branch: 'b', model: null });
    expect(s.agents).toHaveLength(0);
  });
});
