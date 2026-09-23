import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseEventLines } from '@contract';
import { embedJson, injectBootstrap, renderScoreboard } from '../../src/cli/scoreboard';

const events = parseEventLines(readFileSync('src/contract/fixtures/events.jsonl', 'utf8'));

/**
 * The shell, inline. Reading dist/ui.html here made the suite depend on a build that
 * CI does not run until after the tests, so it passed locally on a stale dist and
 * failed everywhere else.
 */
const TEMPLATE = '<!doctype html><html><head><!--BAKEOFF_DATA--></head><body><div id="root"></div></body></html>';

describe('embedJson', () => {
  it('survives being read as HTML', () => {
    // a payload containing </script> would otherwise close the tag early
    const out = embedJson({ s: '</script><img src=x onerror=alert(1)>' });
    expect(out).not.toContain('</script>');
    expect(out).not.toContain('<img');
    expect(JSON.parse(out)).toEqual({ s: '</script><img src=x onerror=alert(1)>' });
  });

  it('round-trips ordinary data unchanged', () => {
    const value = { mode: 'static', n: 1, s: 'a "quoted" thing', nested: [1, null, true] };
    expect(JSON.parse(embedJson(value))).toEqual(value);
  });
});

describe('injectBootstrap', () => {
  it('replaces the anchor with a data script', () => {
    const html = injectBootstrap('<head><!--BAKEOFF_DATA--></head>', { mode: 'static', events: [] });
    expect(html).toContain('<script id="bakeoff-data" type="application/json">');
    expect(html).not.toContain('<!--BAKEOFF_DATA-->');
  });

  it('says what to do when the anchor is missing', () => {
    expect(() => injectBootstrap('<head></head>', { mode: 'static', events: [] })).toThrow(/rebuild the UI/);
  });
});

describe('the exported scoreboard', () => {
  const html = renderScoreboard({ mode: 'static', events }, TEMPLATE);

  it('carries the whole race inline', () => {
    const json = /<script id="bakeoff-data" type="application\/json">([\s\S]*?)<\/script>/.exec(html)![1]!;
    const boot = JSON.parse(json) as { mode: string; events: unknown[] };
    expect(boot.mode).toBe('static');
    expect(boot.events).toHaveLength(events.length);
  });

  it('needs no server and no network', () => {
    // one file, no <script src>, no stylesheet link that is not a font
    expect(/<script[^>]+src="(?!data:)/.test(html)).toBe(false);
    expect(html).not.toContain('/events');
  });
});
