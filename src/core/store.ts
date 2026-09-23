import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { SCHEMA_VERSION, parseEventLines, readLadderJson, readRunJson, type Ladder, type RaceEvent, type RunRecord } from '@contract';
import { NAMES } from './names';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const rand4 = () =>
  Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export function newRunId(now: Date = new Date(), rand: () => string = rand4): string {
  const d = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `${d}-${rand()}`;
}

export function paths(repoRoot: string) {
  const stateDir = join(repoRoot, NAMES.stateDir);
  const runsDir = join(stateDir, 'runs');
  return {
    stateDir,
    runsDir,
    hiddenDir: join(stateDir, 'hidden'),
    logsDir: (id: string) => join(stateDir, 'logs', id),
    log: (id: string, driver: string) => join(stateDir, 'logs', id, `${driver}.log`),
    runJson: (id: string) => join(runsDir, `${id}.json`),
    events: (id: string) => join(runsDir, `${id}.events.jsonl`),
    html: (id: string) => join(runsDir, `${id}.html`),
    png: (id: string) => join(runsDir, `${id}.png`),
    ladder: join(stateDir, 'ladder.json'),
  };
}

export function writeRun(repoRoot: string, rec: RunRecord): void {
  const p = paths(repoRoot);
  mkdirSync(p.runsDir, { recursive: true });
  writeFileSync(p.runJson(rec.id), JSON.stringify(rec, null, 2) + '\n');
}

export function readRun(repoRoot: string, id: string): RunRecord {
  return readRunJson(JSON.parse(readFileSync(paths(repoRoot).runJson(id), 'utf8')));
}

export function listRunIds(repoRoot: string): string[] {
  const dir = paths(repoRoot).runsDir;
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -5))
    .sort();
}

export function appendEvent(repoRoot: string, id: string, ev: RaceEvent): void {
  const p = paths(repoRoot);
  mkdirSync(p.runsDir, { recursive: true });
  appendFileSync(p.events(id), JSON.stringify(ev) + '\n');
}

export function readEvents(repoRoot: string, id: string): RaceEvent[] {
  const f = paths(repoRoot).events(id);
  return existsSync(f) ? parseEventLines(readFileSync(f, 'utf8')) : [];
}

export function readLadder(repoRoot: string): Ladder {
  const f = paths(repoRoot).ladder;
  if (!existsSync(f)) return { schemaVersion: SCHEMA_VERSION, entries: {} };
  return readLadderJson(JSON.parse(readFileSync(f, 'utf8')));
}

export function writeLadder(repoRoot: string, ladder: Ladder): void {
  const p = paths(repoRoot);
  mkdirSync(p.stateDir, { recursive: true });
  writeFileSync(p.ladder, JSON.stringify(ladder, null, 2) + '\n');
}
