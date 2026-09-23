import { afterEach, describe, expect, it } from 'vitest';
import type { RaceEvent } from '@contract';
import { startWatchServer, type WatchServer } from '../../src/cli/server';
import { openCommand } from '../../src/cli/open';

const started: RaceEvent = {
  type: 'race.started', at: 'x', runId: 'r1',
  issue: { number: 1, title: 'Fix a', url: 'u' },
  repo: { owner: 'o', name: 'r', defaultBranch: 'main', baseSha: 'a' },
  agents: ['claude'], caps: { budgetUsd: 1, timeoutMs: 1, maxTurns: null },
  baseline: { testsGreen: true, lintGreen: null, typecheckGreen: null, setupError: null },
};

let server: WatchServer | null = null;
const aborted: string[] = [];

const start = async (port?: number) => {
  aborted.length = 0;
  server = await startWatchServer({
    history: () => [started],
    ladder: () => ({ schemaVersion: 2, entries: {} }),
    abort: (d) => aborted.push(d),
    port,
  });
  return server;
};

afterEach(async () => {
  await server?.close();
  server = null;
});

describe('the watch server', () => {
  it('binds loopback only, never every interface', async () => {
    const s = await start();
    expect(s.url.startsWith('http://127.0.0.1:')).toBe(true);
    expect(s.url).not.toContain('0.0.0.0');
  });

  it('serves the page without a token, because the page carries no secrets', async () => {
    const s = await start();
    const r = await fetch(`http://127.0.0.1:${s.port}/`);
    expect(r.status).toBe(200);
    expect(r.headers.get('content-type')).toContain('text/html');
    const html = await r.text();
    expect(html).toContain('id="bakeoff-data"');
    expect(html).toContain('"mode":"live"');
  });

  it('hands the page an events URL that carries the token', async () => {
    const s = await start();
    const html = await (await fetch(`http://127.0.0.1:${s.port}/?t=${s.token}`)).text();
    expect(html).toContain(`/events?t=${s.token}`);
  });

  it('refuses the stream, the ladder and abort without the token', async () => {
    const s = await start();
    const base = `http://127.0.0.1:${s.port}`;
    for (const [method, path] of [['GET', '/events'], ['GET', '/ladder.json'], ['POST', '/abort/claude']] as const) {
      const r = await fetch(`${base}${path}`, { method });
      expect(r.status, `${method} ${path}`).toBe(401);
    }
    // the whole point: a page on another origin cannot kill a race
    expect(aborted).toEqual([]);
  });

  it('refuses a wrong token', async () => {
    const s = await start();
    const r = await fetch(`http://127.0.0.1:${s.port}/ladder.json?t=${'x'.repeat(s.token.length)}`);
    expect(r.status).toBe(401);
  });

  it('serves the ladder with the token', async () => {
    const s = await start();
    const r = await fetch(`http://127.0.0.1:${s.port}/ladder.json?t=${s.token}`);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ schemaVersion: 2, entries: {} });
  });

  it('aborts a known agent and refuses an unknown one', async () => {
    const s = await start();
    const base = `http://127.0.0.1:${s.port}`;
    const ok = await fetch(`${base}/abort/claude?t=${s.token}`, { method: 'POST' });
    expect(ok.status).toBe(202);
    expect(aborted).toEqual(['claude']);

    const bad = await fetch(`${base}/abort/notanagent?t=${s.token}`, { method: 'POST' });
    expect(bad.status).toBe(404);
    expect(aborted).toEqual(['claude']);
  });

  it('replays what already happened, then streams what comes next', async () => {
    const s = await start();
    const res = await fetch(`http://127.0.0.1:${s.port}/events?t=${s.token}`);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    const first = decoder.decode((await reader.read()).value);
    expect(first).toContain('"type":"race.started"');

    s.publish({ type: 'agent.started', at: 'y', driver: 'claude', branch: 'b', model: null, requestedModel: null });
    const next = decoder.decode((await reader.read()).value);
    expect(next).toContain('"type":"agent.started"');
    await reader.cancel();
  });

  it('gives each run its own token', async () => {
    const a = await start();
    const first = a.token;
    await a.close();
    const b = await start();
    expect(b.token).not.toBe(first);
    expect(b.token.length).toBeGreaterThan(20);
  });

  it('moves to the next port when one is taken, and says which it used', async () => {
    const first = await start(45211);
    expect(first.port).toBe(45211);
    const second = await startWatchServer({
      history: () => [], ladder: () => ({}), abort: () => {}, port: 45211,
    });
    expect(second.port).toBe(45212);
    expect(second.url).toContain(':45212');
    await second.close();
  });
});

describe('openCommand', () => {
  it('uses the platform opener', () => {
    expect(openCommand('darwin')).toEqual(['open', []]);
    expect(openCommand('linux')).toEqual(['xdg-open', []]);
    expect(openCommand('win32')[0]).toBe('cmd');
  });
});
