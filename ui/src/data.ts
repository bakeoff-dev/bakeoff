import { useEffect, useState } from 'react';
import {
  RaceEventSchema, applyEvent, initialState, parseEventLines, reduceEvents,
  type Ladder, type RaceEvent, type RaceState,
} from '@contract';

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

export function useRaceState(b: Bootstrap): RaceState {
  const [state, setState] = useState<RaceState>(() => (b.mode === 'static' ? reduceEvents(b.events) : initialState));
  useEffect(() => {
    if (b.mode !== 'live') return;
    const es = new EventSource(b.eventsUrl);
    es.onmessage = (m) => setState((s) => applyEvent(s, RaceEventSchema.parse(JSON.parse(m.data))));
    return () => es.close();
  }, [b]);
  return state;
}
