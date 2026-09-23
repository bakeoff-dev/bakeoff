import { useEffect, useState } from 'react';
import {
  LadderSchema, RaceEventSchema, applyEvent, initialState, parseEventLines, reduceEvents,
  type DriverId, type Ladder, type RaceEvent, type RaceState,
} from '@contract';

/** Served by the watch server alongside the SSE stream. */
const LADDER_URL = '/ladder.json';

/**
 * Every watch-server route but `/` wants the run's token, and the page is opened at
 * `/?t=<token>`. A static export has no query and never calls any of them.
 */
export function tokenFrom(search: string): string | null {
  return new URLSearchParams(search).get('t');
}

export function withToken(path: string, token: string | null): string {
  return token === null ? path : `${path}?t=${encodeURIComponent(token)}`;
}

/**
 * What the events carry and `AgentLane` does not. The reducer is contract-owned and
 * shared with the terminal, so the UI folds the same stream a second time rather than
 * widening it: `requestedModel` (only on `agent.started`), the model the CLI actually
 * reported (only on `agent.exited`), and the running log tail (only on `agent.progress`).
 */
export interface LaneExtra {
  model: string | null;
  requestedModel: string | null;
  logTail: string;
}
export type LaneExtras = Partial<Record<DriverId, LaneExtra>>;

export const noExtra: LaneExtra = { model: null, requestedModel: null, logTail: '' };

export function applyExtra(x: LaneExtras, e: RaceEvent): LaneExtras {
  const at = (driver: DriverId, f: (p: LaneExtra) => LaneExtra): LaneExtras => ({
    ...x, [driver]: f(x[driver] ?? noExtra),
  });
  switch (e.type) {
    case 'agent.started':
      return at(e.driver, (p) => ({ ...p, model: e.model, requestedModel: e.requestedModel }));
    case 'agent.progress':
      return at(e.driver, (p) => ({ ...p, logTail: e.logTail }));
    case 'agent.exited':
      // A CLI that named no model on exit has not retracted the one it started with.
      return at(e.driver, (p) => ({ ...p, model: e.model ?? p.model }));
    default:
      return x;
  }
}

export const laneExtrasOf = (events: RaceEvent[]): LaneExtras => events.reduce(applyExtra, {});

export type Bootstrap =
  | { mode: 'static'; events: RaceEvent[]; ladder?: Ladder }
  | { mode: 'live'; eventsUrl: string };

declare global {
  interface Window { __BAKEOFF__?: Bootstrap }
}

/** Injected JSON wins, then a window global, then the dev fixture. Events are always validated. */
export function parseBootstrap(json: string | null, win: Window | null, fallback: string | null): Bootstrap {
  if (json) {
    const b = JSON.parse(json) as Bootstrap;
    if (b.mode === 'static') b.events = b.events.map((e) => RaceEventSchema.parse(e));
    return b;
  }
  if (win?.__BAKEOFF__) return win.__BAKEOFF__;
  if (fallback) return { mode: 'static', events: parseEventLines(fallback) };
  return { mode: 'static', events: [] };
}

export function loadBootstrap(): Bootstrap {
  const tag = document.getElementById('bakeoff-data');
  const devEvents = import.meta.env.DEV
    ? (window as unknown as { __DEV_EVENTS__?: string }).__DEV_EVENTS__ ?? null
    : null;
  return parseBootstrap(tag?.textContent ?? null, window, devEvents);
}

export interface Race {
  state: RaceState;
  extras: LaneExtras;
}

/** One pass over the stream feeds both the shared reducer and the UI's own lane extras. */
export function useRace(b: Bootstrap): Race {
  const [race, setRace] = useState<Race>(() =>
    b.mode === 'static'
      ? { state: reduceEvents(b.events), extras: laneExtrasOf(b.events) }
      : { state: initialState, extras: {} },
  );
  useEffect(() => {
    if (b.mode !== 'live') return;
    const es = new EventSource(b.eventsUrl);
    es.onmessage = (m) => {
      const e = RaceEventSchema.parse(JSON.parse(m.data));
      setRace((r) => ({ state: applyEvent(r.state, e), extras: applyExtra(r.extras, e) }));
    };
    return () => es.close();
  }, [b]);
  return race;
}

/**
 * Static exports carry the ladder inline. A watched run only has one worth showing once the
 * race is over and the ratings have been written, so the fetch waits for `finished`.
 */
export function useLadder(b: Bootstrap, finished: boolean): Ladder | null {
  const [ladder, setLadder] = useState<Ladder | null>(b.mode === 'static' ? b.ladder ?? null : null);
  useEffect(() => {
    if (b.mode !== 'live' || !finished) return;
    let live = true;
    void fetch(withToken(LADDER_URL, tokenFrom(window.location.search)))
      .then((r) => (r.ok ? r.json() : null))
      .then((j: unknown) => {
        const parsed = j === null ? null : LadderSchema.safeParse(j);
        if (live && parsed?.success) setLadder(parsed.data);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [b, finished]);
  return ladder;
}
