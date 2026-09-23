/**
 * Regenerate src/contract/fixtures/events.jsonl from run.json.
 *
 * The last line's `record` must be byte-for-byte the object in run.json, and the
 * per-agent facts (driver, model, branch, status, exit code, cost, tokens, PR, score)
 * must agree with it. Deriving them here rather than hand-writing them keeps the two
 * fixtures identical by construction.
 *
 * Run: bun scripts/gen-events-fixture.ts
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { RunRecordSchema, type RaceEvent } from '../src/contract/schema';

const RUN = 'src/contract/fixtures/run.json';
const OUT = 'src/contract/fixtures/events.jsonl';

const raw = readFileSync(RUN, 'utf8');
const rec = RunRecordSchema.parse(JSON.parse(raw));
const byDriver = Object.fromEntries(rec.agents.map((a) => [a.driver, a]));

const at = (s: string): string => `2026-09-02T${s}.000Z`;
const agent = (driver: string) => {
  const a = byDriver[driver];
  if (!a) throw new Error(`run.json has no agent "${driver}"`);
  return a;
};

const started = (driver: string, time: string): RaceEvent => {
  const a = agent(driver);
  return { type: 'agent.started', at: at(time), driver: a.driver, branch: a.branch, model: a.model };
};
const exited = (driver: string, time: string): RaceEvent => {
  const a = agent(driver);
  return {
    type: 'agent.exited', at: at(time), driver: a.driver, status: a.status,
    exitCode: a.exitCode, durationMs: a.durationMs, costUsd: a.costUsd, tokens: a.tokens,
  };
};
const prOpened = (driver: string, time: string): RaceEvent => {
  const a = agent(driver);
  if (a.prUrl === null || a.prNumber === null) throw new Error(`agent "${driver}" opened no PR`);
  return { type: 'agent.pr_opened', at: at(time), driver: a.driver, prUrl: a.prUrl, prNumber: a.prNumber };
};
const scored = (driver: string, time: string): RaceEvent => {
  const a = agent(driver);
  if (a.score === null) throw new Error(`agent "${driver}" has no score`);
  return { type: 'agent.scored', at: at(time), driver: a.driver, score: a.score };
};

const events: RaceEvent[] = [
  {
    type: 'race.started', at: at('18:00:00'), runId: rec.id, issue: rec.issue, repo: rec.repo,
    caps: rec.caps, baseline: rec.baseline, agents: rec.agents.map((a) => a.driver),
  },
  started('claude', '18:00:01'),
  started('codex', '18:00:01'),
  started('opencode', '18:00:01'),
  {
    type: 'agent.progress', at: at('18:02:00'), driver: 'claude', costUsd: 0.31,
    tokens: { input: 40000, output: 2000, cacheRead: 30000, cacheWrite: 12000 },
    lastAction: 'Read src/paginate.ts', filesTouched: 0,
  },
  {
    type: 'agent.progress', at: at('18:05:00'), driver: 'opencode', costUsd: null,
    tokens: { input: 120000, output: 6000, cacheRead: 0, cacheWrite: 0 },
    lastAction: 'reading src/index.ts', filesTouched: 0,
  },
  exited('codex', '18:06:28'),
  exited('claude', '18:06:52'),
  prOpened('claude', '18:07:10'),
  prOpened('codex', '18:07:12'),
  exited('opencode', '18:20:01'),
  scored('claude', '18:21:30'),
  scored('codex', '18:21:31'),
  { type: 'race.finished', at: at('18:21:40'), record: rec },
];

writeFileSync(OUT, `${events.map((e) => JSON.stringify(e)).join('\n')}\n`);
console.log(`wrote ${OUT}: ${events.length} events for run ${rec.id}`);
