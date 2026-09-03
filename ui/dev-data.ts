import events from '../src/contract/fixtures/events.jsonl?raw';

(window as unknown as { __DEV_EVENTS__?: string }).__DEV_EVENTS__ = events;
