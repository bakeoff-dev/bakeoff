import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { Ladder, RaceEvent } from '@contract';
import { uiHtmlPath } from '../render/assets';
import { paths, readEvents, readLadder } from '../core/store';

/** The comment `ui/index.html` leaves for us; everything else in the bundle is untouched. */
const ANCHOR = '<!--BAKEOFF_DATA-->';

export interface Bootstrap {
  mode: 'static' | 'live';
  events?: RaceEvent[];
  ladder?: Ladder;
  eventsUrl?: string;
}

/**
 * JSON inside a script tag has to survive being read as HTML. `</script>` anywhere in the
 * data would close the tag early, and `<!--` can start a comment in a legacy parser, so
 * both are escaped in a way `JSON.parse` still reads back identically.
 */
export function embedJson(value: unknown): string {
  return JSON.stringify(value)
    .replace(/</g, '\\u003c')
    .replace(/>/g, '\\u003e')
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029');
}

/** Put a bootstrap into the single-file UI. The result opens from `file://` with no server. */
export function injectBootstrap(html: string, boot: Bootstrap): string {
  const tag = `<script id="bakeoff-data" type="application/json">${embedJson(boot)}</script>`;
  if (!html.includes(ANCHOR)) {
    throw new Error(`ui.html has no ${ANCHOR} anchor; rebuild the UI`);
  }
  return html.replace(ANCHOR, tag);
}

export function renderScoreboard(boot: Bootstrap): string {
  return injectBootstrap(readFileSync(uiHtmlPath(), 'utf8'), boot);
}

/**
 * Write `.bakeoff/runs/<id>.html`: the whole race in one file, openable offline.
 * The ladder rides along because a static export has nowhere to fetch it from.
 */
export function exportScoreboard(repoRoot: string, runId: string): string {
  const events = readEvents(repoRoot, runId);
  if (events.length === 0) throw new Error(`No events for run ${runId}`);
  const html = renderScoreboard({ mode: 'static', events, ladder: readLadder(repoRoot) });
  const out = paths(repoRoot).html(runId);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  return out;
}
