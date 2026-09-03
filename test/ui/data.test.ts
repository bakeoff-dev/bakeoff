import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseBootstrap } from '../../ui/src/data';

describe('parseBootstrap', () => {
  it('prefers the script tag, then window, then fallback', () => {
    const fx = readFileSync('src/contract/fixtures/events.jsonl', 'utf8');
    expect(parseBootstrap('{"mode":"live","eventsUrl":"/events"}', null, fx)).toEqual({ mode: 'live', eventsUrl: '/events' });
    expect(parseBootstrap(null, { __BAKEOFF__: { mode: 'live', eventsUrl: '/x' } } as unknown as Window, fx).mode).toBe('live');
    const b = parseBootstrap(null, null, fx);
    expect(b.mode === 'static' && b.events.length).toBeGreaterThan(8);
    expect(parseBootstrap(null, null, null)).toEqual({ mode: 'static', events: [] });
  });

  it('validates events embedded in the script tag', () => {
    expect(() => parseBootstrap('{"mode":"static","events":[{"type":"nope"}]}', null, null)).toThrow();
  });
});
