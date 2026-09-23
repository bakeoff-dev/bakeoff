import { randomBytes, timingSafeEqual } from 'node:crypto';
import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http';
import type { DriverId, RaceEvent } from '@contract';
import { DriverIdSchema } from '@contract';
import { NAMES } from '../core/names';
import { renderScoreboard } from './scoreboard';

/** Loopback only. A race streams a repository's contents; it is nobody else's business. */
const HOST = '127.0.0.1';
const PORT_TRIES = 8;
const HEARTBEAT_MS = 20_000;

export interface WatchServer {
  url: string;
  port: number;
  token: string;
  /** Push an event to every connected browser. */
  publish(event: RaceEvent): void;
  close(): Promise<void>;
}

export interface WatchServerInput {
  /** Events already on disk, replayed to a client that connects mid-race. */
  history: () => RaceEvent[];
  ladder: () => unknown;
  abort: (driver: DriverId) => void;
  port?: number;
  /** The UI shell. Left out, the packaged `dist/ui.html` is read at request time. */
  template?: string;
}

/**
 * Constant-time compare so a wrong token cannot be narrowed by timing, and length is
 * checked first because timingSafeEqual throws on a mismatch.
 */
function tokenOk(expected: string, given: string | null): boolean {
  if (given === null) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(given);
  return a.length === b.length && timingSafeEqual(a, b);
}

const send = (res: ServerResponse, code: number, type: string, body: string): void => {
  res.writeHead(code, {
    'content-type': type,
    'cache-control': 'no-store',
    // The page is served from here and talks only to here; nothing else may embed it.
    'x-frame-options': 'DENY',
    'x-content-type-options': 'nosniff',
  });
  res.end(body);
};

async function listenOn(server: Server, port: number): Promise<number> {
  return new Promise((resolve, reject) => {
    const onError = (err: NodeJS.ErrnoException) => {
      server.removeListener('listening', onListening);
      reject(err);
    };
    const onListening = () => {
      server.removeListener('error', onError);
      resolve(port);
    };
    server.once('error', onError);
    server.once('listening', onListening);
    server.listen(port, HOST);
  });
}

/**
 * The live view for `run --watch`.
 *
 * Every endpoint but `/` needs the run's token. Without that, any page open in the same
 * browser could POST to `localhost:4141/abort/claude` and kill a race, or read the log
 * stream: the browser would attach no cookie, but it does not need to -- the address is
 * guessable and the port is fixed. The token travels in the URL we open ourselves.
 */
export async function startWatchServer(input: WatchServerInput): Promise<WatchServer> {
  const token = randomBytes(24).toString('base64url');
  const clients = new Set<ServerResponse>();

  const server = createServer((req: IncomingMessage, res: ServerResponse) => {
    const url = new URL(req.url ?? '/', `http://${HOST}`);
    const given = url.searchParams.get('t');
    const authed = tokenOk(token, given);

    if (req.method === 'GET' && url.pathname === '/') {
      // The page itself carries no secrets; it is handed the token to use.
      const eventsUrl = authed ? `/events?t=${token}` : '/events';
      send(res, 200, 'text/html; charset=utf-8', renderScoreboard({ mode: 'live', eventsUrl }, input.template));
      return;
    }

    if (!authed) {
      send(res, 401, 'text/plain; charset=utf-8', 'missing or bad token\n');
      return;
    }

    if (req.method === 'GET' && url.pathname === '/events') {
      res.writeHead(200, {
        'content-type': 'text/event-stream',
        'cache-control': 'no-store',
        connection: 'keep-alive',
      });
      for (const e of input.history()) res.write(`data: ${JSON.stringify(e)}\n\n`);
      clients.add(res);
      req.on('close', () => clients.delete(res));
      return;
    }

    if (req.method === 'GET' && url.pathname === '/ladder.json') {
      send(res, 200, 'application/json; charset=utf-8', JSON.stringify(input.ladder()));
      return;
    }

    const abort = /^\/abort\/([\w-]+)$/.exec(url.pathname);
    if (req.method === 'POST' && abort) {
      const parsed = DriverIdSchema.safeParse(abort[1]);
      if (!parsed.success) {
        send(res, 404, 'text/plain; charset=utf-8', 'unknown agent\n');
        return;
      }
      input.abort(parsed.data);
      send(res, 202, 'application/json; charset=utf-8', JSON.stringify({ aborted: parsed.data }));
      return;
    }

    send(res, 404, 'text/plain; charset=utf-8', 'not found\n');
  });

  // A busy port is ordinary: another race, or anything else on 4141.
  const first = input.port ?? NAMES.port;
  let port = 0;
  let lastError: unknown = null;
  for (let i = 0; i < PORT_TRIES; i += 1) {
    try {
      port = await listenOn(server, first + i);
      lastError = null;
      break;
    } catch (err) {
      lastError = err;
      if ((err as NodeJS.ErrnoException).code !== 'EADDRINUSE') break;
    }
  }
  if (lastError !== null) throw lastError;

  const heartbeat = setInterval(() => {
    for (const c of clients) c.write(': ping\n\n');
  }, HEARTBEAT_MS);
  heartbeat.unref?.();

  return {
    url: `http://${HOST}:${port}/?t=${token}`,
    port,
    token,
    publish(event) {
      const frame = `data: ${JSON.stringify(event)}\n\n`;
      for (const c of clients) c.write(frame);
    },
    close() {
      clearInterval(heartbeat);
      for (const c of clients) c.end();
      clients.clear();
      return new Promise((resolve) => server.close(() => resolve()));
    },
  };
}
