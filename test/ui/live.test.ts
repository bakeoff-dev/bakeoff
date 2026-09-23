import { describe, expect, it } from 'vitest';
import type { RaceEvent } from '@contract';
import { laneExtrasOf, noExtra, tokenFrom, withToken } from '../../ui/src/data';
import { laneLog } from '../../ui/src/components/Lane';

const started = (over: Partial<Extract<RaceEvent, { type: 'agent.started' }>> = {}): RaceEvent => ({
  type: 'agent.started', at: '2026-09-23T10:00:00.000Z', driver: 'claude', branch: 'b',
  model: 'claude-opus-5', requestedModel: 'claude-opus-5', ...over,
});
const progress = (logTail: string): RaceEvent => ({
  type: 'agent.progress', at: '2026-09-23T10:01:00.000Z', driver: 'claude', costUsd: 0.4,
  tokens: null, lastAction: 'editing', filesTouched: 1, logTail,
});
const exited = (model: string | null): RaceEvent => ({
  type: 'agent.exited', at: '2026-09-23T10:05:00.000Z', driver: 'claude', status: 'ok',
  exitCode: 0, durationMs: 300000, costUsd: 0.8, tokens: null, model,
});

describe('tokenFrom', () => {
  it('reads the token the watch server opened the page with', () => {
    expect(tokenFrom('?t=abc123')).toBe('abc123');
    expect(tokenFrom('?tab=race&t=abc123')).toBe('abc123');
  });

  it('is null for a page opened without one, as a static export is', () => {
    expect(tokenFrom('')).toBeNull();
    expect(tokenFrom('?tab=race')).toBeNull();
  });
});

describe('withToken', () => {
  it('sends the token the server asks for', () => {
    expect(withToken('/ladder.json', 'abc123')).toBe('/ladder.json?t=abc123');
  });

  it('escapes a token that would otherwise change the query', () => {
    expect(withToken('/ladder.json', 'a&b=c')).toBe('/ladder.json?t=a%26b%3Dc');
  });

  it('leaves the path alone when there is no token to send', () => {
    expect(withToken('/ladder.json', null)).toBe('/ladder.json');
  });
});

describe('laneExtrasOf', () => {
  it('keeps the requested model the reducer drops, so a live lane can say auto:', () => {
    expect(laneExtrasOf([started({ requestedModel: null })])?.claude).toMatchObject({
      model: 'claude-opus-5', requestedModel: null,
    });
  });

  it('takes the model the CLI reported on exit over the one it started with', () => {
    const x = laneExtrasOf([started({ model: null }), exited('claude-opus-5-20260801')]);
    expect(x.claude?.model).toBe('claude-opus-5-20260801');
  });

  it('keeps the started model when the exit reports none', () => {
    expect(laneExtrasOf([started(), exited(null)]).claude?.model).toBe('claude-opus-5');
  });

  it('carries the latest log tail from progress', () => {
    const x = laneExtrasOf([started(), progress('first'), progress('first\nsecond')]);
    expect(x.claude?.logTail).toBe('first\nsecond');
  });

  it('has nothing to say about a driver that never started', () => {
    expect(laneExtrasOf([]).claude).toBeUndefined();
    expect(noExtra).toEqual({ model: null, requestedModel: null, logTail: '' });
  });
});

describe('laneLog', () => {
  it('shows the live tail while the agent is still running', () => {
    expect(laneLog('running tail', '')).toBe('running tail');
  });

  it('prefers the finished record, which holds the whole tail', () => {
    expect(laneLog('partial', 'final tail')).toBe('final tail');
  });

  it('says so when there is nothing to show yet', () => {
    expect(laneLog('', '')).toBe('Waiting for the first log lines');
  });
});
