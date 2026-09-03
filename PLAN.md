# Bakeoff v1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship `bakeoff-cli`: race Claude Code, Codex, and OpenCode on a real GitHub issue in the user's repo, open competing PRs, score them deterministically with tamper detection, keep a per-repo OpenSkill ladder, and render a terminal table, a static HTML scoreboard, and a PNG share card.

**Architecture:** One Bun/TypeScript package. `src/contract/` defines the run record, race events, and a reducer that both the CLI and the React UI consume. `src/core/` does the work (config, git worktrees, drivers, process control, scoring, ladder). `src/cli/` is commander plus a Bun.serve SSE server. `ui/` is a Vite single-file React app embedded by the CLI. Every agent subprocess goes through one `runProcess` that owns timeout, budget trip, and process-group kill.

**Tech Stack:** Bun 1.3, TypeScript 5, commander 15, @clack/prompts 1.7, zod, yaml, openskill 5, satori 0.33, @resvg/resvg-js 2.6, Vite 6, React 19, vite-plugin-singlefile 2.3, vitest. UI styling is plain CSS-in-JS style objects copied from the design handoff; no Tailwind.

**Spec:** `SPEC.md` (this repo root). The product spec `pr-arena-v1-spec.md` is background only.

## Global Constraints

- Package name `bakeoff-cli`, binary `bakeoff`, org `bakeoff-dev`. All product strings in `src/core/names.ts`.
- Bun >= 1.3, TypeScript strict, ESM. `node:child_process` only in `src/core/process.ts`.
- Shell out to `git` and `gh`; never the GitHub REST API.
- Every driver subprocess goes through `runProcess`. No driver calls spawn.
- Cost is `number | null`; null renders "cost unavailable". Unconfigured score components have `awarded: null` and render grey "n/a /max".
- Diff discipline: zero lines changed or zero files touched = 0 for the component.
- Hidden tests: `.bakeoff/hidden` is gitignored, `.bakeoff/` is deleted from every worktree before launch, scorer copies from `<repoRoot>/.bakeoff/hidden`.
- Baseline test/lint/typecheck run on base sha before the race; a red baseline warns and is recorded, never aborts.
- Bakeoff, not the agent, commits leftovers, pushes, and opens the PR.
- Crashed/timeout/budget_exceeded agents score 0 and are excluded from the ladder update.
- Ranking: total desc, cost asc (null last), duration asc.
- 2-week hard cap. Cut order is SPEC.md section 12. Tasks are grouped by day; if a day slips, the next day's tasks shift, the cut order does not.
- Commit after every task. Tests via `bun test` (vitest) must be green before every commit.
- Terminal: `design/TERMINAL.md` is the spec for the live view and final table. No emoji, no box drawing, `NO_COLOR` and non-TTY respected.
- Visuals: `design/handoff/design_handoff_bakeoff/README.md` is the pixel-accurate spec for the Scoreboard, Race, Ladder and Share card screens. SPEC.md section 10 "Visual design" lists the agreed deviations. Component code in Tasks 25, 27, 29 and 31 is the data wiring; its layout and styling must be replaced by the handoff's CSS.

## Manual verification repo

Tasks 15, 16, 23 and the day 10-11 data set run against a scratch GitHub repo. Create it once, at Task 15:

```bash
gh repo create bakeoff-dev/scratch --public --clone --description "Bakeoff test bed"
```

If the org does not exist yet, create it in the GitHub UI first (Settings > Organizations > New organization, free plan, name `bakeoff-dev`).

---

## File structure

| Path | Responsibility |
|---|---|
| `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore` | scaffold |
| `src/core/names.ts` | every product string, tested versions |
| `src/contract/schema.ts` | zod schemas + inferred types for RunRecord, RaceEvent, Ladder |
| `src/contract/reducer.ts` | `applyEvent`, `reduceEvents`, `RaceState` |
| `src/contract/fixtures/run.json`, `events.jsonl` | canonical example run |
| `src/contract/index.ts` | re-exports |
| `src/core/config.ts` | `bakeoff.yml` loader, `parseDuration` |
| `src/core/store.ts` | `.bakeoff/` paths, run ids, read/write run + events + ladder |
| `src/core/exec.ts` | `Exec` type, `exec`, `must`, `fakeExec` (test helper lives in `test/helpers/exec.ts`) |
| `src/core/repo.ts` | detect owner/name/defaultBranch/baseSha/root |
| `src/core/issue.ts` | parse issue refs, fetch issue + comments, list open issues |
| `src/core/packet.ts` | build task packet, sha256 |
| `src/core/process.ts` | `runProcess`: detached spawn, timeout, budget trip, group kill |
| `src/core/budget.ts` | `BudgetMeter` |
| `src/core/pricing.ts`, `src/core/pricing.json` | USD per million tokens per model |
| `src/core/worktree.ts` | create/remove worktrees, strip `.bakeoff/` |
| `src/core/drivers/types.ts` | `Driver`, `LaunchInput`, `LaunchResult`, `AgentEvent`, `DriverDoctor` |
| `src/core/drivers/registry.ts` | `getDriver`, `allDrivers` |
| `src/core/drivers/claude.ts`, `codex.ts`, `opencode.ts` | one per CLI |
| `src/core/publish.ts` | commit leftovers, push, ensure labels, create PR |
| `src/core/race.ts` | orchestrator, event bus, writes record |
| `src/core/scorer/checks.ts` | run a check command, restore test paths, baseline |
| `src/core/scorer/tests.ts` | visible + hidden test components, count parser |
| `src/core/scorer/lint.ts` | typecheck + lint components |
| `src/core/scorer/diff.ts` | diff stats, diff discipline |
| `src/core/scorer/tamper.ts` | tamper flags |
| `src/core/scorer/ci.ts` | `gh pr checks` polling |
| `src/core/scorer/index.ts` | `scoreAgent`, `finalizeScores` |
| `src/core/scorer/judge.ts` | blind LLM judge (last task, cut-able) |
| `src/core/ladder.ts` | openskill update, display rating |
| `src/cli/index.ts` | commander program |
| `src/cli/commands/{run,doctor,init,share,ladder,merge}.ts` | one file per command |
| `src/cli/render/style.ts` | ANSI color helpers (truecolor + 256 fallback, NO_COLOR), agent colors/names, clock/token/bar formatters |
| `src/cli/render/table.ts` | final terminal table per `design/TERMINAL.md` |
| `src/cli/render/progress.ts` | live in-place redraw per `design/TERMINAL.md` |
| `src/cli/server.ts` | Bun.serve: `/`, `/events` SSE, `POST /abort/:driver` |
| `src/cli/export.ts` | inject data into `dist/ui.html`, write `<id>.html` |
| `src/render/card.tsx` | satori PNG card |
| `ui/index.html`, `ui/vite.config.ts`, `ui/src/main.tsx`, `ui/src/App.tsx` | app shell, data source (static vs SSE) |
| `ui/src/theme.ts` | tokens, agent meta, pill colors, segment palette, formatters, shared style objects (all values from the handoff) |
| `ui/src/screens/{Race,Scoreboard,Ladder}.tsx` | the three screens |
| `ui/src/components/*.tsx` | Lane, Podium, ComponentBars, Receipts, TamperFlags, Sparkline |
| `test/helpers/repo.ts` | build fixture git repos in temp dirs |
| `test/helpers/exec.ts` | `fakeExec` |
| `test/fixtures/drivers/<driver>/*.jsonl` | recorded real CLI output |

---

# Day 1: foundation and contract

### Task 1: Scaffold the package

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`, `src/core/names.ts`, `test/core/names.test.ts`

**Interfaces:**
- Produces: `NAMES` constant consumed by every later task.

- [ ] **Step 1: Write package.json**

```json
{
  "name": "bakeoff-cli",
  "version": "0.1.0",
  "description": "Race coding agents on your real issues. Merge the winner.",
  "license": "MIT",
  "type": "module",
  "bin": { "bakeoff": "./dist/cli.js" },
  "files": ["dist", "README.md"],
  "engines": { "bun": ">=1.3.0" },
  "scripts": {
    "dev": "bun run src/cli/index.ts",
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc --noEmit",
    "build:ui": "vite build --config ui/vite.config.ts",
    "build:cli": "bun build src/cli/index.ts --target=bun --outfile=dist/cli.js",
    "build": "bun run build:ui && bun run build:cli"
  },
  "dependencies": {
    "@clack/prompts": "^1.7.0",
    "@resvg/resvg-js": "^2.6.2",
    "commander": "^15.0.0",
    "openskill": "^5.0.1",
    "satori": "^0.33.4",
    "yaml": "^2.8.0",
    "zod": "^3.25.0"
  },
  "devDependencies": {
    "@types/bun": "latest",
    "@types/react": "^19.1.0",
    "@types/react-dom": "^19.1.0",
    "@vitejs/plugin-react": "^4.5.0",
    "react": "^19.1.0",
    "react-dom": "^19.1.0",
    "typescript": "^5.8.0",
    "vite": "^6.3.0",
    "vite-plugin-singlefile": "^2.3.3",
    "vitest": "^3.2.0"
  }
}
```

- [ ] **Step 2: Write tsconfig.json and vitest.config.ts**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "lib": ["ES2022", "DOM"],
    "jsx": "react-jsx",
    "strict": true,
    "noUncheckedIndexedAccess": true,
    "resolveJsonModule": true,
    "allowImportingTsExtensions": false,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["bun-types"],
    "baseUrl": ".",
    "paths": { "@contract/*": ["src/contract/*"], "@contract": ["src/contract/index.ts"] }
  },
  "include": ["src", "ui/src", "test"]
}
```

```ts
// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  resolve: { alias: { '@contract': fileURLToPath(new URL('./src/contract/index.ts', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], testTimeout: 20000 },
});
```

- [ ] **Step 3: Write .gitignore**

```
node_modules/
dist/
.bakeoff/hidden/
.bakeoff/logs/
*.log
.DS_Store
```

- [ ] **Step 4: Write the failing names test**

```ts
// test/core/names.test.ts
import { describe, expect, it } from 'vitest';
import { NAMES, branchName, runLabel } from '../../src/core/names';

describe('names', () => {
  it('derives branch and label from run id', () => {
    expect(branchName(7, 'claude', '20260902-k7q2')).toBe('bakeoff/7-claude-20260902-k7q2');
    expect(runLabel('20260902-k7q2')).toBe('bakeoff-run:20260902-k7q2');
    expect(NAMES.configFile).toBe('bakeoff.yml');
    expect(NAMES.stateDir).toBe('.bakeoff');
    expect(NAMES.port).toBe(4141);
  });
});
```

- [ ] **Step 5: Run it to verify it fails**

Run: `bun install && bun test test/core/names.test.ts`
Expected: FAIL, cannot find module `src/core/names`.

- [ ] **Step 6: Write names.ts**

```ts
// src/core/names.ts
export const NAMES = {
  brand: 'Bakeoff',
  bin: 'bakeoff',
  pkg: 'bakeoff-cli',
  org: 'bakeoff-dev',
  configFile: 'bakeoff.yml',
  stateDir: '.bakeoff',
  branchPrefix: 'bakeoff',
  label: 'bakeoff',
  runLabelPrefix: 'bakeoff-run:',
  tmpDirName: 'bakeoff',
  port: 4141,
} as const;

export const TESTED_VERSIONS = {
  claude: '2.1.259',
  codex: '0.153.0',
  opencode: '1.18.27',
} as const;

export function branchName(issue: number, driver: string, runId: string): string {
  return `${NAMES.branchPrefix}/${issue}-${driver}-${runId}`;
}
export function runLabel(runId: string): string {
  return `${NAMES.runLabelPrefix}${runId}`;
}
```

- [ ] **Step 7: Run tests and typecheck**

Run: `bun test && bun run typecheck`
Expected: 1 passed, tsc clean.

- [ ] **Step 8: Commit**

```bash
git add -A && git commit -m "chore: scaffold bakeoff-cli package"
```

---

### Task 2: Contract schemas and the run fixture

**Files:**
- Create: `src/contract/schema.ts`, `src/contract/index.ts`, `src/contract/fixtures/run.json`, `test/contract/schema.test.ts`

**Interfaces:**
- Produces: every type in SPEC.md section 6 as zod schemas plus `z.infer` types: `DriverId`, `AgentStatus`, `ComponentId`, `TokenUsage`, `Caps`, `ScoreComponent`, `TamperFlag`, `ScoreBreakdown`, `AgentResult`, `Baseline`, `RunRecord`, `RaceEvent`, `LadderEntry`, `Ladder`. Also `SCHEMA_VERSION`.

- [ ] **Step 1: Write the failing test**

```ts
// test/contract/schema.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RunRecordSchema } from '../../src/contract/schema';

describe('contract fixture', () => {
  it('run.json validates against RunRecordSchema', () => {
    const raw = JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8'));
    const rec = RunRecordSchema.parse(raw);
    expect(rec.schemaVersion).toBe(1);
    expect(rec.agents).toHaveLength(3);
    expect(rec.winner).toBe('claude');
    const codex = rec.agents.find((a) => a.driver === 'codex')!;
    expect(codex.score?.tamperFlags[0]?.rule).toBe('config_write');
    const oc = rec.agents.find((a) => a.driver === 'opencode')!;
    expect(oc.status).toBe('timeout');
    expect(oc.score).toBeNull();
  });
  it('rejects a record with an unknown status', () => {
    const raw = JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8'));
    raw.agents[0].status = 'weird';
    expect(() => RunRecordSchema.parse(raw)).toThrow();
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test test/contract`
Expected: FAIL, cannot find module.

- [ ] **Step 3: Write schema.ts**

```ts
// src/contract/schema.ts
import { z } from 'zod';

export const SCHEMA_VERSION = 1 as const;

export const DriverIdSchema = z.enum(['claude', 'codex', 'opencode', 'gemini']); // gemini: schema slot only in v1
export const AgentStatusSchema = z.enum(['running', 'ok', 'timeout', 'crashed', 'budget_exceeded']);
export const ComponentIdSchema = z.enum(['visible_tests', 'hidden_tests', 'typecheck', 'lint', 'ci', 'diff', 'judge']);
export const TamperRuleSchema = z.enum(['test_deleted', 'test_skipped', 'asserts_weakened', 'config_write', 'hidden_path_write']);

export const TokenUsageSchema = z.object({
  input: z.number(), output: z.number(), cacheRead: z.number(), cacheWrite: z.number(),
});
export const CapsSchema = z.object({
  budgetUsd: z.number(), timeoutMs: z.number(), maxTurns: z.number().nullable(),
});
export const ScoreComponentSchema = z.object({
  id: ComponentIdSchema, max: z.number(), awarded: z.number().nullable(), detail: z.string(),
});
export const TamperFlagSchema = z.object({ rule: TamperRuleSchema, file: z.string(), detail: z.string() });
export const ScoreBreakdownSchema = z.object({
  components: z.array(ScoreComponentSchema),
  tamperFlags: z.array(TamperFlagSchema),
  tamperPenalty: z.number(),
  total: z.number(),
  maxPossible: z.number(),
});
export const AgentResultSchema = z.object({
  driver: DriverIdSchema,
  status: AgentStatusSchema,
  branch: z.string(),
  exitCode: z.number().nullable(),
  durationMs: z.number(),
  costUsd: z.number().nullable(),
  tokens: TokenUsageSchema.nullable(),
  filesTouched: z.array(z.string()),
  linesAdded: z.number(),
  linesRemoved: z.number(),
  prUrl: z.string().nullable(),
  prNumber: z.number().nullable(),
  score: ScoreBreakdownSchema.nullable(),
  rank: z.number().nullable(),
  logTail: z.string(),
});
export const BaselineSchema = z.object({
  testsGreen: z.boolean().nullable(), lintGreen: z.boolean().nullable(), typecheckGreen: z.boolean().nullable(),
});
export const RepoInfoSchema = z.object({
  owner: z.string(), name: z.string(), defaultBranch: z.string(), baseSha: z.string(),
});
export const IssueInfoSchema = z.object({ number: z.number(), title: z.string(), url: z.string() });
export const ConfiguredSchema = z.object({
  test: z.boolean(), lint: z.boolean(), typecheck: z.boolean(), hiddenTests: z.boolean(), ci: z.boolean(), judge: z.boolean(),
});
export const RunRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string(),
  createdAt: z.string(),
  finishedAt: z.string().nullable(),
  repo: RepoInfoSchema,
  issue: IssueInfoSchema,
  packetHash: z.string(),
  caps: CapsSchema,
  baseline: BaselineSchema,
  configured: ConfiguredSchema,
  agents: z.array(AgentResultSchema),
  winner: DriverIdSchema.nullable(),
});

const at = z.string();
export const RaceEventSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('race.started'), at, runId: z.string(), issue: IssueInfoSchema, repo: RepoInfoSchema, agents: z.array(DriverIdSchema), caps: CapsSchema, baseline: BaselineSchema }),
  z.object({ type: z.literal('agent.started'), at, driver: DriverIdSchema, branch: z.string() }),
  z.object({ type: z.literal('agent.progress'), at, driver: DriverIdSchema, costUsd: z.number().nullable(), tokens: TokenUsageSchema.nullable(), lastAction: z.string(), filesTouched: z.number() }),
  z.object({ type: z.literal('agent.exited'), at, driver: DriverIdSchema, status: AgentStatusSchema, exitCode: z.number().nullable(), durationMs: z.number(), costUsd: z.number().nullable(), tokens: TokenUsageSchema.nullable() }),
  z.object({ type: z.literal('agent.pr_opened'), at, driver: DriverIdSchema, prUrl: z.string(), prNumber: z.number() }),
  z.object({ type: z.literal('agent.scored'), at, driver: DriverIdSchema, score: ScoreBreakdownSchema }),
  z.object({ type: z.literal('race.finished'), at, record: RunRecordSchema }),
]);

export const LadderEntrySchema = z.object({
  driver: DriverIdSchema, mu: z.number(), sigma: z.number(), rating: z.number(),
  races: z.number(), wins: z.number(), avgCostUsd: z.number().nullable(), avgDurationMs: z.number(),
  history: z.array(z.object({ runId: z.string(), at: z.string(), rating: z.number() })),
});
export const LadderSchema = z.object({
  schemaVersion: z.literal(1),
  entries: z.record(DriverIdSchema, LadderEntrySchema).partial(),
});

export type DriverId = z.infer<typeof DriverIdSchema>;
export type AgentStatus = z.infer<typeof AgentStatusSchema>;
export type ComponentId = z.infer<typeof ComponentIdSchema>;
export type TamperRule = z.infer<typeof TamperRuleSchema>;
export type TokenUsage = z.infer<typeof TokenUsageSchema>;
export type Caps = z.infer<typeof CapsSchema>;
export type ScoreComponent = z.infer<typeof ScoreComponentSchema>;
export type TamperFlag = z.infer<typeof TamperFlagSchema>;
export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;
export type AgentResult = z.infer<typeof AgentResultSchema>;
export type Baseline = z.infer<typeof BaselineSchema>;
export type RepoInfo = z.infer<typeof RepoInfoSchema>;
export type IssueInfo = z.infer<typeof IssueInfoSchema>;
export type Configured = z.infer<typeof ConfiguredSchema>;
export type RunRecord = z.infer<typeof RunRecordSchema>;
export type RaceEvent = z.infer<typeof RaceEventSchema>;
export type LadderEntry = z.infer<typeof LadderEntrySchema>;
export type Ladder = z.infer<typeof LadderSchema>;
```

```ts
// src/contract/index.ts
export * from './schema';
export * from './reducer';
```

(`reducer.ts` arrives in Task 3; until then create it as `export {};` so the index compiles.)

- [ ] **Step 4: Write fixtures/run.json**

Component maxes for this fixture: test configured, typecheck configured, lint not (so typecheck max 15, lint max 0), no hidden tests, no CI, no judge. `maxPossible` = 50 + 15 + 10 = 75. Diff discipline: finishers claude (L=22) and codex (L=20), median 21, consensus set = files touched by both = `src/paginate.ts`, `test/paginate.test.ts`.

```json
{
  "schemaVersion": 1,
  "id": "20260902-k7q2",
  "createdAt": "2026-09-02T18:00:00.000Z",
  "finishedAt": "2026-09-02T18:21:40.000Z",
  "repo": { "owner": "bakeoff-dev", "name": "scratch", "defaultBranch": "main", "baseSha": "3f1c2a9d5e7b4c6a8f0e1d2c3b4a5968778695a4" },
  "issue": { "number": 7, "title": "Fix off-by-one in paginate()", "url": "https://github.com/bakeoff-dev/scratch/issues/7" },
  "packetHash": "9b2c1d4e6f8a0b3c5d7e9f1a2b4c6d8e0f1a3b5c7d9e1f2a4b6c8d0e2f4a6b8c",
  "caps": { "budgetUsd": 3, "timeoutMs": 1200000, "maxTurns": null },
  "baseline": { "testsGreen": true, "lintGreen": null, "typecheckGreen": true },
  "configured": { "test": true, "lint": false, "typecheck": true, "hiddenTests": false, "ci": false, "judge": false },
  "agents": [
    {
      "driver": "claude", "status": "ok", "branch": "bakeoff/7-claude-20260902-k7q2",
      "exitCode": 0, "durationMs": 412000, "costUsd": 1.42,
      "tokens": { "input": 182000, "output": 9400, "cacheRead": 150000, "cacheWrite": 12000 },
      "filesTouched": ["src/paginate.ts", "test/paginate.test.ts"], "linesAdded": 18, "linesRemoved": 4,
      "prUrl": "https://github.com/bakeoff-dev/scratch/pull/12", "prNumber": 12,
      "score": {
        "components": [
          { "id": "visible_tests", "max": 50, "awarded": 50, "detail": "9/9 passed" },
          { "id": "hidden_tests", "max": 20, "awarded": null, "detail": "n/a" },
          { "id": "typecheck", "max": 15, "awarded": 15, "detail": "clean" },
          { "id": "lint", "max": 0, "awarded": null, "detail": "n/a" },
          { "id": "ci", "max": 10, "awarded": null, "detail": "n/a" },
          { "id": "diff", "max": 10, "awarded": 9.7, "detail": "22 lines, 2 files, 2 in consensus" },
          { "id": "judge", "max": 15, "awarded": null, "detail": "n/a" }
        ],
        "tamperFlags": [], "tamperPenalty": 0, "total": 74.7, "maxPossible": 75
      },
      "rank": 1, "logTail": "Edit test/paginate.test.ts\nBash bun test\nresult: success"
    },
    {
      "driver": "codex", "status": "ok", "branch": "bakeoff/7-codex-20260902-k7q2",
      "exitCode": 0, "durationMs": 388000, "costUsd": 0.97,
      "tokens": { "input": 140000, "output": 7100, "cacheRead": 90000, "cacheWrite": 0 },
      "filesTouched": ["src/paginate.ts", "test/paginate.test.ts", "vitest.config.ts"], "linesAdded": 11, "linesRemoved": 9,
      "prUrl": "https://github.com/bakeoff-dev/scratch/pull/13", "prNumber": 13,
      "score": {
        "components": [
          { "id": "visible_tests", "max": 50, "awarded": 50, "detail": "9/9 passed" },
          { "id": "hidden_tests", "max": 20, "awarded": null, "detail": "n/a" },
          { "id": "typecheck", "max": 15, "awarded": 15, "detail": "clean" },
          { "id": "lint", "max": 0, "awarded": null, "detail": "n/a" },
          { "id": "ci", "max": 10, "awarded": null, "detail": "n/a" },
          { "id": "diff", "max": 10, "awarded": 8.7, "detail": "20 lines, 3 files, 2 in consensus" },
          { "id": "judge", "max": 15, "awarded": null, "detail": "n/a" }
        ],
        "tamperFlags": [ { "rule": "config_write", "file": "vitest.config.ts", "detail": "test configuration modified" } ],
        "tamperPenalty": -25, "total": 48.7, "maxPossible": 75
      },
      "rank": 2, "logTail": "file_change vitest.config.ts\ncommand_execution bun test\nturn.completed"
    },
    {
      "driver": "opencode", "status": "timeout", "branch": "bakeoff/7-opencode-20260902-k7q2",
      "exitCode": null, "durationMs": 1200000, "costUsd": null,
      "tokens": { "input": 260000, "output": 14000, "cacheRead": 0, "cacheWrite": 0 },
      "filesTouched": [], "linesAdded": 0, "linesRemoved": 0,
      "prUrl": null, "prNumber": null, "score": null, "rank": null,
      "logTail": "reading src/paginate.ts\nreading src/index.ts\n[bakeoff] timeout after 20m, SIGTERM sent to process group"
    }
  ],
  "winner": "claude"
}
```

- [ ] **Step 5: Run tests**

Run: `bun test test/contract && bun run typecheck`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(contract): run record, race event, ladder schemas + fixture"
```

---

### Task 3: Reducer and the events fixture

**Files:**
- Create: `src/contract/reducer.ts`, `src/contract/fixtures/events.jsonl`, `test/contract/reducer.test.ts`

**Interfaces:**
- Consumes: schemas from Task 2.
- Produces: `RaceState`, `AgentLane`, `initialState`, `applyEvent(state, event): RaceState`, `reduceEvents(events): RaceState`, `parseEventLines(text): RaceEvent[]`.

- [ ] **Step 1: Write the failing test**

```ts
// test/contract/reducer.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { parseEventLines, reduceEvents, applyEvent, initialState } from '../../src/contract/reducer';
import { RunRecordSchema } from '../../src/contract/schema';

const events = parseEventLines(readFileSync('src/contract/fixtures/events.jsonl', 'utf8'));
const record = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

describe('reducer', () => {
  it('parses every fixture line', () => {
    expect(events.length).toBeGreaterThan(8);
    expect(events[0]?.type).toBe('race.started');
    expect(events.at(-1)?.type).toBe('race.finished');
  });
  it('replays to the fixture record', () => {
    const s = reduceEvents(events);
    expect(s.finished).toBe(true);
    expect(s.record).toEqual(record);
  });
  it('tracks live lane state before the race finishes', () => {
    const s = reduceEvents(events.slice(0, -1));
    expect(s.finished).toBe(false);
    const claude = s.agents.find((a) => a.driver === 'claude')!;
    expect(claude.status).toBe('ok');
    expect(claude.costUsd).toBe(1.42);
    expect(claude.prNumber).toBe(12);
    expect(claude.score?.total).toBe(74.7);
    const oc = s.agents.find((a) => a.driver === 'opencode')!;
    expect(oc.status).toBe('timeout');
    expect(oc.lastAction).toBe('reading src/index.ts');
  });
  it('ignores events for unknown drivers', () => {
    const s = applyEvent(initialState, { type: 'agent.started', at: 'x', driver: 'codex', branch: 'b' });
    expect(s.agents).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run it to verify it fails**

Run: `bun test test/contract/reducer.test.ts`
Expected: FAIL.

- [ ] **Step 3: Write reducer.ts**

```ts
// src/contract/reducer.ts
import {
  RaceEventSchema, type AgentStatus, type Baseline, type Caps, type DriverId, type IssueInfo,
  type RaceEvent, type RepoInfo, type RunRecord, type ScoreBreakdown, type TokenUsage,
} from './schema';

export interface AgentLane {
  driver: DriverId; status: AgentStatus; branch: string; startedAt: string | null;
  costUsd: number | null; tokens: TokenUsage | null; lastAction: string; filesTouched: number;
  durationMs: number | null; exitCode: number | null; prUrl: string | null; prNumber: number | null;
  score: ScoreBreakdown | null;
}
export interface RaceState {
  runId: string | null; issue: IssueInfo | null; repo: RepoInfo | null; caps: Caps | null;
  baseline: Baseline | null; agents: AgentLane[]; finished: boolean; record: RunRecord | null;
}
export const initialState: RaceState = {
  runId: null, issue: null, repo: null, caps: null, baseline: null, agents: [], finished: false, record: null,
};

function lane(driver: DriverId): AgentLane {
  return { driver, status: 'running', branch: '', startedAt: null, costUsd: null, tokens: null, lastAction: '',
    filesTouched: 0, durationMs: null, exitCode: null, prUrl: null, prNumber: null, score: null };
}
function patch(s: RaceState, driver: DriverId, f: (l: AgentLane) => AgentLane): RaceState {
  if (!s.agents.some((a) => a.driver === driver)) return s;
  return { ...s, agents: s.agents.map((a) => (a.driver === driver ? f(a) : a)) };
}

export function applyEvent(s: RaceState, e: RaceEvent): RaceState {
  switch (e.type) {
    case 'race.started':
      return { ...initialState, runId: e.runId, issue: e.issue, repo: e.repo, caps: e.caps, baseline: e.baseline, agents: e.agents.map(lane) };
    case 'agent.started':
      return patch(s, e.driver, (l) => ({ ...l, branch: e.branch, startedAt: e.at, status: 'running' }));
    case 'agent.progress':
      return patch(s, e.driver, (l) => ({ ...l, costUsd: e.costUsd, tokens: e.tokens, lastAction: e.lastAction, filesTouched: e.filesTouched }));
    case 'agent.exited':
      return patch(s, e.driver, (l) => ({ ...l, status: e.status, exitCode: e.exitCode, durationMs: e.durationMs, costUsd: e.costUsd, tokens: e.tokens }));
    case 'agent.pr_opened':
      return patch(s, e.driver, (l) => ({ ...l, prUrl: e.prUrl, prNumber: e.prNumber }));
    case 'agent.scored':
      return patch(s, e.driver, (l) => ({ ...l, score: e.score }));
    case 'race.finished':
      return { ...s, finished: true, record: e.record };
  }
}
export function reduceEvents(events: RaceEvent[], start: RaceState = initialState): RaceState {
  return events.reduce(applyEvent, start);
}
export function parseEventLines(text: string): RaceEvent[] {
  return text.split('\n').filter((l) => l.trim().length > 0).map((l) => RaceEventSchema.parse(JSON.parse(l)));
}
```

- [ ] **Step 4: Write fixtures/events.jsonl**

One JSON object per line. The last line's `record` must be byte-for-byte the object in `run.json` (copy it in). Write it with this script so it cannot drift:

```bash
bun -e '
const rec = JSON.parse(await Bun.file("src/contract/fixtures/run.json").text());
const base = { issue: rec.issue, repo: rec.repo, caps: rec.caps, baseline: rec.baseline };
const ev = [
 { type:"race.started", at:"2026-09-02T18:00:00.000Z", runId:rec.id, ...base, agents:["claude","codex","opencode"] },
 { type:"agent.started", at:"2026-09-02T18:00:01.000Z", driver:"claude", branch:"bakeoff/7-claude-20260902-k7q2" },
 { type:"agent.started", at:"2026-09-02T18:00:01.000Z", driver:"codex", branch:"bakeoff/7-codex-20260902-k7q2" },
 { type:"agent.started", at:"2026-09-02T18:00:01.000Z", driver:"opencode", branch:"bakeoff/7-opencode-20260902-k7q2" },
 { type:"agent.progress", at:"2026-09-02T18:02:00.000Z", driver:"claude", costUsd:0.31, tokens:{input:40000,output:2000,cacheRead:30000,cacheWrite:12000}, lastAction:"Read src/paginate.ts", filesTouched:0 },
 { type:"agent.progress", at:"2026-09-02T18:05:00.000Z", driver:"opencode", costUsd:null, tokens:{input:120000,output:6000,cacheRead:0,cacheWrite:0}, lastAction:"reading src/index.ts", filesTouched:0 },
 { type:"agent.exited", at:"2026-09-02T18:06:28.000Z", driver:"codex", status:"ok", exitCode:0, durationMs:388000, costUsd:0.97, tokens:{input:140000,output:7100,cacheRead:90000,cacheWrite:0} },
 { type:"agent.exited", at:"2026-09-02T18:06:52.000Z", driver:"claude", status:"ok", exitCode:0, durationMs:412000, costUsd:1.42, tokens:{input:182000,output:9400,cacheRead:150000,cacheWrite:12000} },
 { type:"agent.pr_opened", at:"2026-09-02T18:07:10.000Z", driver:"claude", prUrl:"https://github.com/bakeoff-dev/scratch/pull/12", prNumber:12 },
 { type:"agent.pr_opened", at:"2026-09-02T18:07:12.000Z", driver:"codex", prUrl:"https://github.com/bakeoff-dev/scratch/pull/13", prNumber:13 },
 { type:"agent.exited", at:"2026-09-02T18:20:01.000Z", driver:"opencode", status:"timeout", exitCode:null, durationMs:1200000, costUsd:null, tokens:{input:260000,output:14000,cacheRead:0,cacheWrite:0} },
 { type:"agent.scored", at:"2026-09-02T18:21:30.000Z", driver:"claude", score:rec.agents[0].score },
 { type:"agent.scored", at:"2026-09-02T18:21:31.000Z", driver:"codex", score:rec.agents[1].score },
 { type:"race.finished", at:"2026-09-02T18:21:40.000Z", record:rec },
];
await Bun.write("src/contract/fixtures/events.jsonl", ev.map(e=>JSON.stringify(e)).join("\n")+"\n");
'
```

- [ ] **Step 5: Run tests**

Run: `bun test test/contract && bun run typecheck`
Expected: all pass.

- [ ] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(contract): race reducer + events fixture"
```

---

### Task 4: Config loader

**Files:**
- Create: `src/core/config.ts`, `test/core/config.test.ts`

**Interfaces:**
- Produces: `Config` type, `ConfigSchema`, `parseDuration(s: string): number` (ms), `loadConfig(repoRoot: string): Config`, `parseConfig(text: string): Config`, `configuredFlags(cfg: Config): Configured` (the `configured` block of the run record, with `ci` decided by `ci_timeout > 0`).

- [x] **Step 1: Write the failing test**

```ts
// test/core/config.test.ts
import { describe, expect, it } from 'vitest';
import { parseConfig, parseDuration, configuredFlags } from '../../src/core/config';

describe('parseDuration', () => {
  it('parses m, s, h', () => {
    expect(parseDuration('20m')).toBe(1_200_000);
    expect(parseDuration('90s')).toBe(90_000);
    expect(parseDuration('1h')).toBe(3_600_000);
    expect(() => parseDuration('soon')).toThrow();
  });
});
describe('parseConfig', () => {
  it('applies defaults', () => {
    const c = parseConfig('test: bun test\n');
    expect(c.agents).toEqual(['claude']);
    expect(c.budget_usd).toBe(3);
    expect(c.timeout).toBe('20m');
    expect(c.ci_timeout).toBe('10m');
    expect(c.judge.enabled).toBe(false);
  });
  it('rejects unknown keys and empty configs', () => {
    expect(() => parseConfig('tests: x\n')).toThrow();
    expect(() => parseConfig('agents: [claude]\n')).toThrow(/at least one of/);
  });
  it('parses hidden tests', () => {
    const c = parseConfig('test: bun test\nhidden_tests:\n  dest: tests/hidden\n  command: bun test tests/hidden\n');
    expect(c.hidden_tests?.source).toBe('.bakeoff/hidden');
  });
  it('reports configured flags', () => {
    const c = parseConfig('test: bun test\ntypecheck: tsc\nci_timeout: 0s\n');
    expect(configuredFlags(c)).toEqual({ test: true, lint: false, typecheck: true, hiddenTests: false, ci: false, judge: false });
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun test test/core/config.test.ts`
Expected: FAIL.

- [x] **Step 3: Write config.ts**

```ts
// src/core/config.ts
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import { DriverIdSchema, type Configured } from '@contract';
import { NAMES } from './names';

export function parseDuration(s: string): number {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(s.trim());
  if (!m) throw new Error(`Invalid duration "${s}" (use e.g. 90s, 20m, 1h)`);
  const n = Number(m[1]);
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[m[2] as 'ms' | 's' | 'm' | 'h'];
  return Math.round(n * unit);
}

export const ConfigSchema = z.object({
  test: z.string().optional(),
  lint: z.string().optional(),
  typecheck: z.string().optional(),
  test_paths: z.array(z.string()).optional(),
  agents: z.array(DriverIdSchema).min(1).default(['claude']),
  budget_usd: z.number().positive().default(3),
  timeout: z.string().default('20m'),
  max_turns: z.number().int().positive().optional(),
  ci_timeout: z.string().default('10m'),
  hidden_tests: z.object({
    source: z.string().default(`${NAMES.stateDir}/hidden`),
    dest: z.string(),
    command: z.string(),
  }).strict().optional(),
  judge: z.object({
    enabled: z.boolean().default(false),
    model: z.string().default('claude-sonnet-5'),
  }).strict().default({}),
}).strict().superRefine((c, ctx) => {
  if (!c.test && !c.lint && !c.typecheck) ctx.addIssue({ code: 'custom', message: 'bakeoff.yml needs at least one of: test, lint, typecheck' });
  for (const k of ['timeout', 'ci_timeout'] as const) {
    try { parseDuration(c[k]); } catch (e) { ctx.addIssue({ code: 'custom', path: [k], message: (e as Error).message }); }
  }
});
export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(text: string): Config {
  return ConfigSchema.parse(parseYaml(text) ?? {});
}
export function loadConfig(repoRoot: string): Config {
  const p = join(repoRoot, NAMES.configFile);
  if (!existsSync(p)) throw new Error(`No ${NAMES.configFile} in ${repoRoot}. Run \`${NAMES.bin} init\`.`);
  return parseConfig(readFileSync(p, 'utf8'));
}
export function configuredFlags(c: Config): Configured {
  return {
    test: !!c.test, lint: !!c.lint, typecheck: !!c.typecheck,
    hiddenTests: !!c.hidden_tests, ci: parseDuration(c.ci_timeout) > 0, judge: c.judge.enabled,
  };
}
```

- [x] **Step 4: Run tests**

Run: `bun test test/core/config.test.ts && bun run typecheck`
Expected: pass.

- [x] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(core): bakeoff.yml loader"
```

---

### Task 5: Store (`.bakeoff/` layout, run ids, events)

**Files:**
- Create: `src/core/store.ts`, `test/core/store.test.ts`

**Interfaces:**
- Produces: `newRunId(now?: Date, rand?: () => string): string`, `paths(repoRoot)` returning `{ stateDir, runsDir, hiddenDir, logsDir(id), runJson(id), events(id), html(id), png(id), ladder, log(id, driver) }`, `writeRun(repoRoot, rec)`, `readRun(repoRoot, id): RunRecord`, `listRunIds(repoRoot): string[]`, `appendEvent(repoRoot, id, ev)`, `readEvents(repoRoot, id): RaceEvent[]`, `readLadder(repoRoot): Ladder`, `writeLadder(repoRoot, ladder)`.

- [x] **Step 1: Write the failing test**

```ts
// test/core/store.test.ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newRunId, paths, writeRun, readRun, appendEvent, readEvents, listRunIds, readLadder, writeLadder } from '../../src/core/store';
import { RunRecordSchema } from '../../src/contract/schema';

const fixture = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

describe('store', () => {
  it('makes sortable run ids', () => {
    expect(newRunId(new Date('2026-09-02T10:00:00Z'), () => 'k7q2')).toBe('20260902-k7q2');
    expect(newRunId()).toMatch(/^\d{8}-[a-z0-9]{4}$/);
  });
  it('round-trips runs, events, ladder', () => {
    const root = mkdtempSync(join(tmpdir(), 'bakeoff-store-'));
    writeRun(root, fixture);
    expect(readRun(root, fixture.id)).toEqual(fixture);
    expect(listRunIds(root)).toEqual([fixture.id]);
    appendEvent(root, fixture.id, { type: 'agent.started', at: 'a', driver: 'claude', branch: 'b' });
    appendEvent(root, fixture.id, { type: 'agent.started', at: 'a', driver: 'codex', branch: 'c' });
    expect(readEvents(root, fixture.id)).toHaveLength(2);
    expect(readLadder(root)).toEqual({ schemaVersion: 1, entries: {} });
    writeLadder(root, { schemaVersion: 1, entries: { claude: { driver: 'claude', mu: 25, sigma: 8.33, rating: 1000, races: 0, wins: 0, avgCostUsd: null, avgDurationMs: 0, history: [] } } });
    expect(readLadder(root).entries.claude?.rating).toBe(1000);
    expect(paths(root).hiddenDir).toBe(join(root, '.bakeoff', 'hidden'));
  });
});
```

- [x] **Step 2: Run it to verify it fails**

Run: `bun test test/core/store.test.ts`
Expected: FAIL.

- [x] **Step 3: Write store.ts**

```ts
// src/core/store.ts
import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { LadderSchema, RunRecordSchema, parseEventLines, type Ladder, type RaceEvent, type RunRecord } from '@contract';
import { NAMES } from './names';

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';
const rand4 = () => Array.from({ length: 4 }, () => ALPHABET[Math.floor(Math.random() * ALPHABET.length)]).join('');

export function newRunId(now: Date = new Date(), rand: () => string = rand4): string {
  const d = now.toISOString().slice(0, 10).replaceAll('-', '');
  return `${d}-${rand()}`;
}

export function paths(repoRoot: string) {
  const stateDir = join(repoRoot, NAMES.stateDir);
  const runsDir = join(stateDir, 'runs');
  return {
    stateDir, runsDir,
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
  return RunRecordSchema.parse(JSON.parse(readFileSync(paths(repoRoot).runJson(id), 'utf8')));
}
export function listRunIds(repoRoot: string): string[] {
  const dir = paths(repoRoot).runsDir;
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => f.slice(0, -5)).sort();
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
  if (!existsSync(f)) return { schemaVersion: 1, entries: {} };
  return LadderSchema.parse(JSON.parse(readFileSync(f, 'utf8')));
}
export function writeLadder(repoRoot: string, ladder: Ladder): void {
  const p = paths(repoRoot);
  mkdirSync(p.stateDir, { recursive: true });
  writeFileSync(p.ladder, JSON.stringify(ladder, null, 2) + '\n');
}
```

- [x] **Step 4: Run tests, commit**

Run: `bun test && bun run typecheck`
Expected: pass.

```bash
git add -A && git commit -m "feat(core): .bakeoff store"
```

---

### Task 6: exec, repo detection, issue fetching

**Files:**
- Create: `src/core/exec.ts`, `src/core/repo.ts`, `src/core/issue.ts`, `test/helpers/exec.ts`, `test/core/repo.test.ts`, `test/core/issue.test.ts`

**Interfaces:**
- Produces:
  - `type Exec = (cmd: string, args: string[], opts?: { cwd?: string; env?: Record<string,string>; stdin?: string }) => Promise<ExecResult>`; `ExecResult = { code: number; stdout: string; stderr: string }`; `exec: Exec`; `must(cmd, args, opts?, run?: Exec): Promise<string>` (trimmed stdout, throws on non-zero with stderr in the message).
  - `detectRepo(cwd, run?: Exec): Promise<RepoInfo & { root: string }>`.
  - `parseIssueRef(ref: string, fallback?: { owner: string; name: string }): { owner; name; number }`; `fetchIssue(ref, run?): Promise<{ info: IssueInfo; body: string; comments: { author: string; body: string }[] }>`; `listOpenIssues(repo, run?): Promise<{ number: number; title: string }[]>`.
  - Test helper `fakeExec(table: Array<[RegExp, Partial<ExecResult>]>)` returning `{ run: Exec; calls: string[] }`.

- [x] **Step 1: Write the test helper and failing tests**

```ts
// test/helpers/exec.ts
import type { Exec, ExecResult } from '../../src/core/exec';
export function fakeExec(table: Array<[RegExp, Partial<ExecResult>]>) {
  const calls: string[] = [];
  const run: Exec = async (cmd, args) => {
    const line = [cmd, ...args].join(' ');
    calls.push(line);
    const hit = table.find(([re]) => re.test(line));
    if (!hit) throw new Error(`fakeExec: no response for "${line}"`);
    return { code: 0, stdout: '', stderr: '', ...hit[1] };
  };
  return { run, calls };
}
```

```ts
// test/core/repo.test.ts
import { describe, expect, it } from 'vitest';
import { detectRepo } from '../../src/core/repo';
import { fakeExec } from '../helpers/exec';

describe('detectRepo', () => {
  it('reads owner, name, default branch, base sha, root', async () => {
    const { run, calls } = fakeExec([
      [/^git rev-parse --show-toplevel/, { stdout: '/tmp/x\n' }],
      [/^gh repo view --json/, { stdout: JSON.stringify({ nameWithOwner: 'bakeoff-dev/scratch', defaultBranchRef: { name: 'main' } }) }],
      [/^git fetch origin main/, {}],
      [/^git rev-parse origin\/main/, { stdout: 'abc123\n' }],
    ]);
    const r = await detectRepo('/tmp/x/sub', run);
    expect(r).toEqual({ owner: 'bakeoff-dev', name: 'scratch', defaultBranch: 'main', baseSha: 'abc123', root: '/tmp/x' });
    expect(calls.some((c) => c.startsWith('git fetch origin main'))).toBe(true);
  });
});
```

```ts
// test/core/issue.test.ts
import { describe, expect, it } from 'vitest';
import { parseIssueRef, fetchIssue, listOpenIssues } from '../../src/core/issue';
import { fakeExec } from '../helpers/exec';

describe('parseIssueRef', () => {
  it('handles owner/repo#n, #n, n, and urls', () => {
    const fb = { owner: 'o', name: 'r' };
    expect(parseIssueRef('a/b#12')).toEqual({ owner: 'a', name: 'b', number: 12 });
    expect(parseIssueRef('#12', fb)).toEqual({ owner: 'o', name: 'r', number: 12 });
    expect(parseIssueRef('12', fb)).toEqual({ owner: 'o', name: 'r', number: 12 });
    expect(parseIssueRef('https://github.com/a/b/issues/3')).toEqual({ owner: 'a', name: 'b', number: 3 });
    expect(() => parseIssueRef('12')).toThrow(/owner\/repo/);
  });
});
describe('fetchIssue', () => {
  it('maps gh json', async () => {
    const { run } = fakeExec([[/^gh issue view 7 -R a\/b --json/, { stdout: JSON.stringify({
      number: 7, title: 'T', body: 'B', url: 'https://github.com/a/b/issues/7',
      comments: [{ author: { login: 'zoe' }, body: 'hi' }] }) }]]);
    const r = await fetchIssue({ owner: 'a', name: 'b', number: 7 }, run);
    expect(r.info).toEqual({ number: 7, title: 'T', url: 'https://github.com/a/b/issues/7' });
    expect(r.comments).toEqual([{ author: 'zoe', body: 'hi' }]);
  });
});
describe('listOpenIssues', () => {
  it('lists number + title', async () => {
    const { run } = fakeExec([[/^gh issue list -R a\/b/, { stdout: JSON.stringify([{ number: 1, title: 'x' }]) }]]);
    expect(await listOpenIssues({ owner: 'a', name: 'b' }, run)).toEqual([{ number: 1, title: 'x' }]);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `bun test test/core/repo.test.ts test/core/issue.test.ts`
Expected: FAIL.

- [x] **Step 3: Write exec.ts, repo.ts, issue.ts**

```ts
// src/core/exec.ts
export interface ExecResult { code: number; stdout: string; stderr: string }
export interface ExecOpts { cwd?: string; env?: Record<string, string>; stdin?: string }
export type Exec = (cmd: string, args: string[], opts?: ExecOpts) => Promise<ExecResult>;

export const exec: Exec = async (cmd, args, opts = {}) => {
  const proc = Bun.spawn([cmd, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdin: opts.stdin !== undefined ? new TextEncoder().encode(opts.stdin) : 'ignore',
    stdout: 'pipe', stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited,
  ]);
  return { code, stdout, stderr };
};

export async function must(cmd: string, args: string[], opts: ExecOpts = {}, run: Exec = exec): Promise<string> {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.code}): ${r.stderr.trim() || r.stdout.trim()}`);
  return r.stdout.trim();
}
```

```ts
// src/core/repo.ts
import { z } from 'zod';
import type { RepoInfo } from '@contract';
import { exec, must, type Exec } from './exec';

const View = z.object({ nameWithOwner: z.string(), defaultBranchRef: z.object({ name: z.string() }) });

export async function detectRepo(cwd: string, run: Exec = exec): Promise<RepoInfo & { root: string }> {
  const root = await must('git', ['rev-parse', '--show-toplevel'], { cwd }, run);
  const view = View.parse(JSON.parse(await must('gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'], { cwd: root }, run)));
  const [owner, name] = view.nameWithOwner.split('/') as [string, string];
  const defaultBranch = view.defaultBranchRef.name;
  await must('git', ['fetch', 'origin', defaultBranch, '--quiet'], { cwd: root }, run);
  const baseSha = await must('git', ['rev-parse', `origin/${defaultBranch}`], { cwd: root }, run);
  return { owner, name, defaultBranch, baseSha, root };
}
```

```ts
// src/core/issue.ts
import { z } from 'zod';
import type { IssueInfo } from '@contract';
import { exec, must, type Exec } from './exec';

export interface IssueRef { owner: string; name: string; number: number }
export interface IssueData { info: IssueInfo; body: string; comments: { author: string; body: string }[] }

export function parseIssueRef(ref: string, fallback?: { owner: string; name: string }): IssueRef {
  let m = /^([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(ref);
  if (m) return { owner: m[1]!, name: m[2]!, number: Number(m[3]) };
  m = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/.exec(ref);
  if (m) return { owner: m[1]!, name: m[2]!, number: Number(m[3]) };
  m = /^#?(\d+)$/.exec(ref);
  if (m) {
    if (!fallback) throw new Error(`"${ref}" needs an owner/repo prefix outside a repository`);
    return { ...fallback, number: Number(m[1]) };
  }
  throw new Error(`Cannot parse issue reference "${ref}" (expected owner/repo#123, #123, or a URL)`);
}

const IssueJson = z.object({
  number: z.number(), title: z.string(), body: z.string().nullable().default(''), url: z.string(),
  comments: z.array(z.object({ author: z.object({ login: z.string() }).nullable(), body: z.string() })).default([]),
});

export async function fetchIssue(ref: IssueRef, run: Exec = exec): Promise<IssueData> {
  const raw = await must('gh', ['issue', 'view', String(ref.number), '-R', `${ref.owner}/${ref.name}`, '--json', 'number,title,body,url,comments'], {}, run);
  const j = IssueJson.parse(JSON.parse(raw));
  return {
    info: { number: j.number, title: j.title, url: j.url },
    body: j.body ?? '',
    comments: j.comments.map((c) => ({ author: c.author?.login ?? 'unknown', body: c.body })),
  };
}

export async function listOpenIssues(repo: { owner: string; name: string }, run: Exec = exec): Promise<{ number: number; title: string }[]> {
  const raw = await must('gh', ['issue', 'list', '-R', `${repo.owner}/${repo.name}`, '--state', 'open', '--limit', '30', '--json', 'number,title'], {}, run);
  return z.array(z.object({ number: z.number(), title: z.string() })).parse(JSON.parse(raw));
}
```

- [x] **Step 4: Run tests, commit**

Run: `bun test && bun run typecheck`
Expected: pass.

```bash
git add -A && git commit -m "feat(core): exec wrapper, repo detection, issue fetch"
```

---

### Task 7: Task packet builder

**Files:**
- Create: `src/core/packet.ts`, `test/core/packet.test.ts`

**Interfaces:**
- Consumes: `IssueData` (Task 6), `Config` (Task 4).
- Produces: `buildPacket(input: PacketInput): { text: string; hash: string }` where `PacketInput = { issue: IssueData; guidance: { agentsMd: string | null; claudeMd: string | null }; config: Pick<Config, 'test' | 'lint' | 'typecheck'> }`; `readGuidance(repoRoot): PacketInput['guidance']`.

- [x] **Step 1: Write the failing test**

```ts
// test/core/packet.test.ts
import { describe, expect, it } from 'vitest';
import { buildPacket } from '../../src/core/packet';

const issue = { info: { number: 7, title: 'Fix it', url: 'https://github.com/a/b/issues/7' }, body: 'It breaks.', comments: [{ author: 'zoe', body: 'repro attached' }] };

describe('buildPacket', () => {
  it('is deterministic and includes every section', () => {
    const a = buildPacket({ issue, guidance: { agentsMd: 'Use bun.', claudeMd: null }, config: { test: 'bun test', typecheck: 'tsc --noEmit' } });
    const b = buildPacket({ issue, guidance: { agentsMd: 'Use bun.', claudeMd: null }, config: { test: 'bun test', typecheck: 'tsc --noEmit' } });
    expect(a.text).toBe(b.text);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.text).toContain('# Task\nFix it');
    expect(a.text).toContain('## Issue #7 (https://github.com/a/b/issues/7)\nIt breaks.');
    expect(a.text).toContain('zoe: repro attached');
    expect(a.text).toContain('Use bun.');
    expect(a.text).toContain('Run: `bun test`');
    expect(a.text).toContain('Typecheck: `tsc --noEmit`');
    expect(a.text).toContain('Do NOT push');
    expect(a.text).not.toContain('bakeoff/');
  });
  it('omits empty sections', () => {
    const p = buildPacket({ issue: { ...issue, comments: [] }, guidance: { agentsMd: null, claudeMd: null }, config: { test: 'bun test' } });
    expect(p.text).not.toContain('## Comments');
    expect(p.text).not.toContain('## Repository guidance');
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `bun test test/core/packet.test.ts`
Expected: FAIL.

- [x] **Step 3: Write packet.ts**

```ts
// src/core/packet.ts
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IssueData } from './issue';

export interface Guidance { agentsMd: string | null; claudeMd: string | null }
export interface PacketInput {
  issue: IssueData;
  guidance: Guidance;
  config: { test?: string; lint?: string; typecheck?: string };
}

export function readGuidance(repoRoot: string): Guidance {
  const read = (f: string) => (existsSync(join(repoRoot, f)) ? readFileSync(join(repoRoot, f), 'utf8') : null);
  return { agentsMd: read('AGENTS.md'), claudeMd: read('CLAUDE.md') };
}

export function buildPacket(input: PacketInput): { text: string; hash: string } {
  const { issue, guidance, config } = input;
  const parts: string[] = [];
  parts.push(`# Task\n${issue.info.title}\n`);
  parts.push(`## Issue #${issue.info.number} (${issue.info.url})\n${issue.body.trim()}\n`);
  if (issue.comments.length > 0) {
    parts.push(`## Comments\n${issue.comments.map((c) => `${c.author}: ${c.body.trim()}`).join('\n\n')}\n`);
  }
  const guidanceText = [guidance.agentsMd, guidance.claudeMd].filter((g): g is string => !!g && g.trim().length > 0);
  if (guidanceText.length > 0) parts.push(`## Repository guidance\n${guidanceText.map((g) => g.trim()).join('\n\n')}\n`);
  const verify: string[] = [];
  if (config.test) verify.push(`Run: \`${config.test}\``);
  if (config.typecheck) verify.push(`Typecheck: \`${config.typecheck}\``);
  if (config.lint) verify.push(`Lint: \`${config.lint}\``);
  parts.push(`## How to verify\n${verify.join('\n')}\n`);
  parts.push([
    '## Rules',
    '- Work only in this directory. It is a git worktree on its own branch.',
    '- Commit as you go with clear messages. Do NOT push, do NOT open a pull request.',
    '- Do not modify or delete existing tests, test configuration, or CI files. Add new tests if useful.',
    '- When finished, stop. A pull request will be opened for you.',
    '',
  ].join('\n'));
  const text = parts.join('\n');
  const hash = createHash('sha256').update(text).digest('hex');
  return { text, hash };
}
```

- [x] **Step 4: Run tests, commit**

Run: `bun test && bun run typecheck`
Expected: pass.

```bash
git add -A && git commit -m "feat(core): task packet builder"
```

---

### Task 8: Process control with group kill

**Files:**
- Create: `src/core/process.ts`, `src/core/budget.ts`, `test/core/process.test.ts`

**Interfaces:**
- Produces: `runProcess(input: RunProcessInput): Promise<RunProcessResult>` (SPEC.md section 9) and `BudgetMeter` (SPEC.md section 8, pricing lookup arrives in Task 9; here the meter takes an injectable `price: (model) => Price | null`).

- [x] **Step 1: Write the failing test**

```ts
// test/core/process.test.ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../../src/core/process';
import { BudgetMeter } from '../../src/core/budget';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('runProcess', () => {
  it('returns ok with exit code and captures lines', async () => {
    const lines: string[] = [];
    const r = await runProcess({ cmd: 'sh', args: ['-c', 'echo one; echo two >&2; exit 3'], cwd: tmpdir(), timeoutMs: 5000,
      onStdoutLine: (l) => lines.push(`out:${l}`), onStderrLine: (l) => lines.push(`err:${l}`) });
    expect(r.exitCode).toBe(3);
    expect(r.status).toBe('crashed');
    expect(lines.sort()).toEqual(['err:two', 'out:one']);
  });
  it('kills the whole process group on timeout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bakeoff-proc-'));
    const pidfile = join(dir, 'pid');
    const r = await runProcess({ cmd: 'sh', args: ['-c', `sleep 30 & echo $! > ${pidfile}; wait`], cwd: dir, timeoutMs: 500 });
    expect(r.status).toBe('timeout');
    await wait(200);
    const child = Number(readFileSync(pidfile, 'utf8').trim());
    expect(alive(child)).toBe(false);
  });
  it('passes stdin and appends a log file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bakeoff-proc-'));
    const logPath = join(dir, 'x.log');
    const r = await runProcess({ cmd: 'cat', args: [], cwd: dir, stdin: 'hello\n', timeoutMs: 5000, logPath });
    expect(r.status).toBe('ok');
    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(logPath, 'utf8')).toContain('hello');
  });
  it('trips the budget meter and reports budget_exceeded', async () => {
    const meter = new BudgetMeter(1.0, () => ({ input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 }));
    const r = await runProcess({
      cmd: 'sh', args: ['-c', 'for i in 1 2 3 4 5; do echo tick; sleep 0.2; done'], cwd: tmpdir(), timeoutMs: 10000, meter,
      onStdoutLine: () => meter.addUsage({ input: 1, output: 0, cacheRead: 0, cacheWrite: 0 }, 'm'),
    });
    expect(r.status).toBe('budget_exceeded');
    expect(r.durationMs).toBeLessThan(2000);
  });
  it('honors an abort signal', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);
    const r = await runProcess({ cmd: 'sleep', args: ['10'], cwd: tmpdir(), timeoutMs: 10000, signal: ac.signal });
    expect(r.status).toBe('aborted');
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `bun test test/core/process.test.ts`
Expected: FAIL.

- [x] **Step 3: Write budget.ts**

```ts
// src/core/budget.ts
import type { TokenUsage } from '@contract';

/** USD per million tokens. */
export interface Price { input: number; output: number; cacheRead: number; cacheWrite: number }
export type PriceLookup = (model: string) => Price | null;

export class BudgetMeter {
  costUsd: number | null = null;
  readonly unknownModels = new Set<string>();
  constructor(readonly capUsd: number, private readonly price: PriceLookup) {}

  /** Add a usage delta (one turn / one message). */
  addUsage(t: TokenUsage, model: string): void {
    const p = this.price(model);
    if (!p) { this.unknownModels.add(model); return; }
    const usd = (t.input * p.input + t.output * p.output + t.cacheRead * p.cacheRead + t.cacheWrite * p.cacheWrite) / 1_000_000;
    this.costUsd = (this.costUsd ?? 0) + usd;
  }
  /** Overwrite with an absolute cost the CLI reported itself. */
  setCost(usd: number): void { this.costUsd = usd; }
  get exceeded(): boolean { return this.costUsd !== null && this.costUsd >= this.capUsd; }
}
```

- [x] **Step 4: Write process.ts**

```ts
// src/core/process.ts
import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import type { BudgetMeter } from './budget';

export interface RunProcessInput {
  cmd: string; args: string[]; cwd: string; env?: Record<string, string>;
  stdin?: string; timeoutMs: number; signal?: AbortSignal; meter?: BudgetMeter;
  onStdoutLine?: (line: string) => void; onStderrLine?: (line: string) => void;
  logPath?: string;
}
export type ProcessStatus = 'ok' | 'timeout' | 'budget_exceeded' | 'aborted' | 'crashed';
export interface RunProcessResult { exitCode: number | null; status: ProcessStatus; durationMs: number }

const KILL_GRACE_MS = 10_000;

export function runProcess(input: RunProcessInput): Promise<RunProcessResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let reason: Exclude<ProcessStatus, 'ok' | 'crashed'> | null = null;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    if (input.logPath) mkdirSync(dirname(input.logPath), { recursive: true });
    const log = (prefix: string, line: string) => { if (input.logPath) appendFileSync(input.logPath, `${prefix}${line}\n`); };

    const child = spawn(input.cmd, input.args, {
      cwd: input.cwd, env: { ...process.env, ...(input.env ?? {}) }, detached: true,
      stdio: [input.stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    const pgid = child.pid;
    const killGroup = (sig: NodeJS.Signals) => { if (pgid) { try { process.kill(-pgid, sig); } catch { /* already gone */ } } };
    const stop = (why: Exclude<ProcessStatus, 'ok' | 'crashed'>) => {
      if (reason) return;
      reason = why;
      log('[bakeoff] ', `${why}: SIGTERM sent to process group`);
      killGroup('SIGTERM');
      killTimer = setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS);
    };

    const timeout = setTimeout(() => stop('timeout'), input.timeoutMs);
    const onAbort = () => stop('aborted');
    input.signal?.addEventListener('abort', onAbort, { once: true });

    const wire = (stream: NodeJS.ReadableStream | null, prefix: string, cb?: (l: string) => void) => {
      if (!stream) return;
      createInterface({ input: stream }).on('line', (line) => {
        log(prefix, line);
        cb?.(line);
        if (input.meter?.exceeded) stop('budget_exceeded');
      });
    };
    wire(child.stdout, '', input.onStdoutLine);
    wire(child.stderr, '[stderr] ', input.onStderrLine);

    if (input.stdin !== undefined && child.stdin) { child.stdin.end(input.stdin); }

    child.on('error', (err) => { log('[bakeoff] ', `spawn error: ${err.message}`); });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      input.signal?.removeEventListener('abort', onAbort);
      const durationMs = Date.now() - started;
      const status: ProcessStatus = reason ?? (code === 0 ? 'ok' : 'crashed');
      resolve({ exitCode: code, status, durationMs });
    });
  });
}
```

- [x] **Step 5: Run tests, commit**

Run: `bun test test/core/process.test.ts && bun run typecheck`
Expected: 5 passed. If the group-kill test fails on macOS, confirm `detached: true` is set and that `-pgid` (negative) is passed to `process.kill`.

```bash
git add -A && git commit -m "feat(core): runProcess with process-group kill, timeout, budget trip"
```

---

### Task 9: Pricing table

**Files:**
- Create: `src/core/pricing.json`, `src/core/pricing.ts`, `test/core/pricing.test.ts`

**Interfaces:**
- Produces: `priceFor(model: string): Price | null` (longest-prefix match after lowercasing; `null` for unknown), `defaultMeter(capUsd): BudgetMeter`.

- [x] **Step 1: Fetch current prices**

Run these and read the results (values below are seeds from memory; replace with what the pages say today):

```bash
firecrawl scrape https://www.anthropic.com/pricing --format markdown | grep -iE 'sonnet|opus|haiku|input|output|cache' | head -40
firecrawl scrape https://openai.com/api/pricing/ --format markdown | grep -iE 'gpt-5|codex|input|output|cached' | head -40
```

- [x] **Step 2: Write the failing test**

```ts
// test/core/pricing.test.ts
import { describe, expect, it } from 'vitest';
import { priceFor } from '../../src/core/pricing';

describe('priceFor', () => {
  it('matches known models by prefix, case-insensitively', () => {
    expect(priceFor('claude-sonnet-4-5-20250929')).not.toBeNull();
    expect(priceFor('GPT-5')).not.toBeNull();
    expect(priceFor('gpt-5-codex')).not.toBeNull();
  });
  it('returns null for unknown models', () => {
    expect(priceFor('llama-local')).toBeNull();
    expect(priceFor('')).toBeNull();
  });
  it('prefers the longest prefix', () => {
    const a = priceFor('gpt-5-mini');
    const b = priceFor('gpt-5');
    expect(a).not.toEqual(b);
  });
});
```

- [x] **Step 3: Write pricing.json and pricing.ts**

```json
{
  "_comment": "USD per million tokens. Keys are lowercase model-name prefixes. Longest prefix wins. verifiedAt is the date the numbers were checked against the vendor pricing page.",
  "verifiedAt": "2026-09-02",
  "models": {
    "claude-opus-4":    { "input": 15,   "output": 75,  "cacheRead": 1.5,   "cacheWrite": 18.75 },
    "claude-sonnet-4":  { "input": 3,    "output": 15,  "cacheRead": 0.3,   "cacheWrite": 3.75 },
    "claude-haiku-4":   { "input": 1,    "output": 5,   "cacheRead": 0.1,   "cacheWrite": 1.25 },
    "claude-opus-5":    { "input": 15,   "output": 75,  "cacheRead": 1.5,   "cacheWrite": 18.75 },
    "claude-sonnet-5":  { "input": 3,    "output": 15,  "cacheRead": 0.3,   "cacheWrite": 3.75 },
    "gpt-5":            { "input": 1.25, "output": 10,  "cacheRead": 0.125, "cacheWrite": 1.25 },
    "gpt-5-mini":       { "input": 0.25, "output": 2,   "cacheRead": 0.025, "cacheWrite": 0.25 },
    "gpt-5-codex":      { "input": 1.25, "output": 10,  "cacheRead": 0.125, "cacheWrite": 1.25 },
    "o4-mini":          { "input": 1.1,  "output": 4.4, "cacheRead": 0.275, "cacheWrite": 1.1 }
  }
}
```

Overwrite the seed numbers with what Step 1 returned before continuing. OpenAI has no cache-write price; set `cacheWrite` equal to `input`.

```ts
// src/core/pricing.ts
import table from './pricing.json';
import { BudgetMeter, type Price } from './budget';

const MODELS: Record<string, Price> = table.models;

export function priceFor(model: string): Price | null {
  const m = model.toLowerCase();
  let best: string | null = null;
  for (const key of Object.keys(MODELS)) {
    if (m.startsWith(key) && (best === null || key.length > best.length)) best = key;
  }
  return best ? MODELS[best]! : null;
}
export function defaultMeter(capUsd: number): BudgetMeter {
  return new BudgetMeter(capUsd, priceFor);
}
```

- [x] **Step 4: Run tests, commit**

Run: `bun test && bun run typecheck`
Expected: pass.

```bash
git add -A && git commit -m "feat(core): model pricing table"
```

---

### Task 10: Worktrees

**Files:**
- Create: `src/core/worktree.ts`, `test/helpers/repo.ts`, `test/core/worktree.test.ts`

**Interfaces:**
- Produces: `worktreeDir(runId, driver): string` (under `os.tmpdir()/bakeoff/<runId>/<driver>`), `createWorktree({ repoRoot, baseSha, branch, dir }, run?): Promise<void>` (adds the worktree with `--no-checkout`, applies a non-cone sparse checkout that excludes `/.bakeoff/`, checks out, then `rm -rf`s `<dir>/.bakeoff` as a belt-and-braces), `removeWorktree({ repoRoot, dir, branch, deleteBranch }, run?): Promise<void>`.

Why sparse checkout and not just `rm -rf`: `.bakeoff/runs` and `ladder.json` are committed, so they sit in every worktree's index. Deleting them from disk would make the agent's `git add -A` stage their deletion and the PR would delete the run history. Sparse checkout marks them skip-worktree: absent on disk, ignored by `git add -A`, carried through unchanged into commits.
- Test helper: `makeRepo(files: Record<string, string>, opts?: { gitignore?: string }): Promise<{ dir: string; sha: string; commit(files, msg): Promise<string> }>`.

- [x] **Step 1: Write the helper and failing test**

```ts
// test/helpers/repo.ts
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { must } from '../../src/core/exec';

export async function makeRepo(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'bakeoff-repo-'));
  await must('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  await must('git', ['config', 'user.email', 'test@bakeoff.dev'], { cwd: dir });
  await must('git', ['config', 'user.name', 'Bakeoff Test'], { cwd: dir });
  const commit = async (f: Record<string, string>, msg: string) => {
    for (const [p, c] of Object.entries(f)) { mkdirSync(dirname(join(dir, p)), { recursive: true }); writeFileSync(join(dir, p), c); }
    await must('git', ['add', '-A'], { cwd: dir });
    await must('git', ['commit', '-q', '-m', msg], { cwd: dir });
    return must('git', ['rev-parse', 'HEAD'], { cwd: dir });
  };
  const sha = await commit(files, 'init');
  return { dir, sha, commit };
}
```

```ts
// test/core/worktree.test.ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorktree, removeWorktree, worktreeDir } from '../../src/core/worktree';
import { must } from '../../src/core/exec';
import { makeRepo } from '../helpers/repo';

describe('worktree', () => {
  it('creates a branch worktree without .bakeoff and removes it', async () => {
    const repo = await makeRepo({ 'a.txt': 'a', '.bakeoff/runs/x.json': '{}', '.bakeoff/hidden/t.test.ts': 'secret' });
    const dir = worktreeDir('20260902-test', 'claude');
    expect(dir).toContain(join('bakeoff', '20260902-test', 'claude'));
    await createWorktree({ repoRoot: repo.dir, baseSha: repo.sha, branch: 'bakeoff/1-claude-20260902-test', dir });
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('a');
    expect(existsSync(join(dir, '.bakeoff'))).toBe(false);
    expect(await must('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir })).toBe('bakeoff/1-claude-20260902-test');
    // nothing under .bakeoff/ is checked out: every index entry there is skip-worktree ("S"), none is "H"
    const tagged = (await must('git', ['ls-files', '-t', '--', '.bakeoff'], { cwd: dir })).split('\n').filter(Boolean);
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged.every((l) => l.startsWith('S '))).toBe(true);
    expect(await must('git', ['ls-files', '--', '.bakeoff'], { cwd: dir, env: { GIT_DIR: join(dir, '.git') } }).catch(() => '')).not.toContain('hidden');
    // an agent-style commit must not touch .bakeoff/
    writeFileSync(join(dir, 'a.txt'), 'changed');
    await must('git', ['add', '-A'], { cwd: dir });
    await must('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'agent change'], { cwd: dir });
    expect(await must('git', ['diff', '--name-only', repo.sha, 'HEAD'], { cwd: dir })).toBe('a.txt');
    await removeWorktree({ repoRoot: repo.dir, dir, branch: 'bakeoff/1-claude-20260902-test', deleteBranch: true });
    expect(existsSync(dir)).toBe(false);
    expect((await must('git', ['branch', '--list', 'bakeoff/*'], { cwd: repo.dir }))).toBe('');
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `bun test test/core/worktree.test.ts`
Expected: FAIL.

- [x] **Step 3: Write worktree.ts**

```ts
// src/core/worktree.ts
import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { exec, must, type Exec } from './exec';
import { NAMES } from './names';

export function worktreeDir(runId: string, driver: string): string {
  return join(tmpdir(), NAMES.tmpDirName, runId, driver);
}

export async function createWorktree(o: { repoRoot: string; baseSha: string; branch: string; dir: string }, run: Exec = exec): Promise<void> {
  mkdirSync(dirname(o.dir), { recursive: true });
  await must('git', ['worktree', 'add', '-q', '--no-checkout', '-b', o.branch, o.dir, o.baseSha], { cwd: o.repoRoot }, run);
  await must('git', ['sparse-checkout', 'set', '--no-cone', '/*', `!/${NAMES.stateDir}/`], { cwd: o.dir }, run);
  await must('git', ['checkout', '-q', o.branch], { cwd: o.dir }, run);
  rmSync(join(o.dir, NAMES.stateDir), { recursive: true, force: true });
}

export async function removeWorktree(o: { repoRoot: string; dir: string; branch?: string; deleteBranch?: boolean }, run: Exec = exec): Promise<void> {
  await run('git', ['worktree', 'remove', '--force', o.dir], { cwd: o.repoRoot });
  rmSync(o.dir, { recursive: true, force: true });
  await run('git', ['worktree', 'prune'], { cwd: o.repoRoot });
  if (o.deleteBranch && o.branch) await run('git', ['branch', '-D', o.branch], { cwd: o.repoRoot });
}
```

- [x] **Step 4: Run tests, commit**

Run: `bun test && bun run typecheck`
Expected: pass.

```bash
git add -A && git commit -m "feat(core): worktree create/remove, strips .bakeoff"
```

---

### Task 11: Driver interface, registry, doctor command

**Files:**
- Create: `src/core/drivers/types.ts`, `src/core/drivers/registry.ts`, `src/cli/commands/doctor.ts`, `src/cli/index.ts`, `test/core/drivers/registry.test.ts`

**Interfaces:**
- Produces: everything in SPEC.md section 8 (`Driver`, `DriverDoctor`, `LaunchInput`, `LaunchResult`, `AgentEvent`), `getDriver(id): Driver`, `allDrivers(): Driver[]`, `registerDriver(d)` (used by tests to add fakes), `helpHasFlags(helpText, flags): string[]` (missing flags), `doctorReport(ids, run?): Promise<DoctorLine[]>`.

- [x] **Step 1: Write the failing test**

```ts
// test/core/drivers/registry.test.ts
import { describe, expect, it } from 'vitest';
import { allDrivers, getDriver, registerDriver } from '../../../src/core/drivers/registry';
import { helpHasFlags } from '../../../src/core/drivers/types';
import type { Driver } from '../../../src/core/drivers/types';

describe('registry', () => {
  it('throws on unknown id and lists registered drivers', () => {
    expect(() => getDriver('nope' as never)).toThrow(/Unknown driver/);
    const fake: Driver = { id: 'claude', displayName: 'Fake', color: '#fff', doctor: async () => ({ found: true, version: '0', authOk: true, notes: [] }), launch: async () => { throw new Error('x'); } };
    registerDriver(fake);
    expect(getDriver('claude').displayName).toBe('Fake');
    expect(allDrivers().map((d) => d.id)).toContain('claude');
  });
});
describe('helpHasFlags', () => {
  it('reports missing flags', () => {
    expect(helpHasFlags('--print  --output-format <f>', ['--print', '--output-format', '--max-turns'])).toEqual(['--max-turns']);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `bun test test/core/drivers/registry.test.ts`
Expected: FAIL.

- [x] **Step 3: Write types.ts, registry.ts**

```ts
// src/core/drivers/types.ts
import type { AgentStatus, Caps, DriverId, TokenUsage } from '@contract';
import type { BudgetMeter } from '../budget';

export interface DriverDoctor { found: boolean; version: string | null; authOk: boolean; notes: string[] }

export type AgentEvent =
  | { kind: 'action'; text: string }
  | { kind: 'usage'; tokens: TokenUsage; model: string }
  | { kind: 'cost'; costUsd: number }
  | { kind: 'file'; path: string };

export interface LaunchInput {
  packet: string; packetPath: string; worktree: string; branch: string;
  caps: Caps; meter: BudgetMeter; onEvent: (e: AgentEvent) => void; signal: AbortSignal;
  logPath: string;
}
export interface LaunchResult {
  exitCode: number | null; status: Exclude<AgentStatus, 'running'>;
  tokens: TokenUsage | null; costUsd: number | null; durationMs: number; raw: unknown;
}
export interface Driver {
  id: DriverId; displayName: string; color: string;
  doctor(): Promise<DriverDoctor>;
  launch(input: LaunchInput): Promise<LaunchResult>;
}

export function helpHasFlags(helpText: string, flags: string[]): string[] {
  return flags.filter((f) => !helpText.includes(f));
}
export function addTokens(a: TokenUsage | null, b: TokenUsage): TokenUsage {
  return { input: (a?.input ?? 0) + b.input, output: (a?.output ?? 0) + b.output, cacheRead: (a?.cacheRead ?? 0) + b.cacheRead, cacheWrite: (a?.cacheWrite ?? 0) + b.cacheWrite };
}
```

```ts
// src/core/drivers/registry.ts
import type { DriverId } from '@contract';
import type { Driver } from './types';

const drivers = new Map<DriverId, Driver>();
export function registerDriver(d: Driver): void { drivers.set(d.id, d); }
export function getDriver(id: DriverId): Driver {
  const d = drivers.get(id);
  if (!d) throw new Error(`Unknown driver "${id}". Registered: ${[...drivers.keys()].join(', ') || 'none'}`);
  return d;
}
export function allDrivers(): Driver[] { return [...drivers.values()]; }
```

- [x] **Step 4: Write the doctor command and CLI entry**

```ts
// src/cli/commands/doctor.ts
import * as p from '@clack/prompts';
import type { DriverId } from '@contract';
import { exec, type Exec } from '../../core/exec';
import { getDriver } from '../../core/drivers/registry';
import { NAMES, TESTED_VERSIONS } from '../../core/names';

export interface DoctorLine { name: string; ok: boolean; detail: string }

export async function doctorReport(ids: DriverId[], run: Exec = exec): Promise<DoctorLine[]> {
  const lines: DoctorLine[] = [];
  const git = await run('git', ['--version']);
  lines.push({ name: 'git', ok: git.code === 0, detail: git.stdout.trim() });
  const gh = await run('gh', ['auth', 'status']);
  lines.push({ name: 'gh auth', ok: gh.code === 0, detail: gh.code === 0 ? 'logged in' : gh.stderr.trim().split('\n')[0] ?? 'not logged in' });
  for (const id of ids) {
    const d = getDriver(id);
    const r = await d.doctor();
    const tested = TESTED_VERSIONS[id];
    const notes = [...r.notes];
    if (r.version && r.version !== tested) notes.push(`tested with ${tested}`);
    lines.push({ name: d.displayName, ok: r.found && r.authOk, detail: [r.found ? `v${r.version ?? '?'}` : 'not found', ...notes].join('; ') });
  }
  return lines;
}

export async function doctorCommand(ids: DriverId[]): Promise<boolean> {
  p.intro(`${NAMES.brand} doctor`);
  const lines = await doctorReport(ids);
  for (const l of lines) (l.ok ? p.log.success : p.log.error)(`${l.name}: ${l.detail}`);
  const ok = lines.every((l) => l.ok);
  p.outro(ok ? 'All good.' : 'Fix the items above before racing.');
  return ok;
}
```

```ts
// src/cli/index.ts
#!/usr/bin/env bun
import { Command } from 'commander';
import { DriverIdSchema } from '@contract';
import { NAMES } from '../core/names';
import { doctorCommand } from './commands/doctor';
import '../core/drivers/index';

const program = new Command().name(NAMES.bin).description('Race coding agents on your real issues. Merge the winner.').version('0.1.0');

program.command('doctor').description('Check git, gh, and agent CLIs').option('-a, --agents <list>', 'comma-separated drivers', 'claude,codex,opencode')
  .action(async (o: { agents: string }) => {
    const ids = o.agents.split(',').map((s) => DriverIdSchema.parse(s.trim()));
    process.exit((await doctorCommand(ids)) ? 0 : 1);
  });

program.parseAsync(process.argv);
```

Create `src/core/drivers/index.ts` as the side-effect module that registers real drivers; for now it is empty (`export {};`). Task 12 adds `registerDriver(claudeDriver)` to it.

- [x] **Step 5: Run tests, run doctor, commit**

Run: `bun test && bun run typecheck && bun run dev -- doctor --agents claude`
Expected: tests pass; doctor exits 1 with "Unknown driver" until Task 12 (that is fine).

```bash
git add -A && git commit -m "feat: driver interface, registry, doctor command"
```

---

# Day 2: Claude driver, publish, orchestrator, first real PR

### Task 12: Claude Code driver

**Files:**
- Create: `src/core/drivers/claude.ts`, `test/fixtures/drivers/claude/stream.jsonl`, `test/core/drivers/claude.test.ts`
- Modify: `src/core/drivers/index.ts`

**Interfaces:**
- Consumes: `runProcess`, `BudgetMeter`, driver types.
- Produces: `claudeDriver: Driver`, `claudeArgs(input, opts: { bare: boolean }): string[]`, `parseClaudeLine(line: string): { events: AgentEvent[]; result: ClaudeResult | null }` with `ClaudeResult = { costUsd: number | null; tokens: TokenUsage | null; isError: boolean; durationMs: number | null }`.

- [x] **Step 1: Record a real fixture**

```bash
mkdir -p test/fixtures/drivers/claude && cd "$(mktemp -d)" && git init -q && \
printf 'Create a file named hello.txt containing the single word pong, then stop.' | \
claude -p --output-format stream-json --verbose --permission-mode acceptEdits --max-budget-usd 0.25 \
  > "$OLDPWD/test/fixtures/drivers/claude/stream.jsonl"; cd "$OLDPWD"
head -c 600 test/fixtures/drivers/claude/stream.jsonl; echo; tail -c 800 test/fixtures/drivers/claude/stream.jsonl
```

Confirm the first line is `{"type":"system","subtype":"init",...}`, at least one line is `{"type":"assistant",...}` containing a `tool_use` block with `"name":"Write"`, and the last line is `{"type":"result",...}` with `total_cost_usd`, `usage`, `duration_ms`. If field names differ from the parser below, change the parser to match the fixture, not the other way around.

- [x] **Step 2: Write the failing test**

```ts
// test/core/drivers/claude.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { claudeArgs, parseClaudeLine } from '../../../src/core/drivers/claude';
import { BudgetMeter } from '../../../src/core/budget';

const lines = readFileSync('test/fixtures/drivers/claude/stream.jsonl', 'utf8').split('\n').filter(Boolean);

describe('claude parser', () => {
  it('turns tool_use into action + file events and the result line into totals', () => {
    const events = lines.flatMap((l) => parseClaudeLine(l).events);
    expect(events.some((e) => e.kind === 'action' && /^Write /.test(e.text))).toBe(true);
    expect(events.some((e) => e.kind === 'file' && e.path.endsWith('hello.txt'))).toBe(true);
    expect(events.some((e) => e.kind === 'usage')).toBe(true);
    const result = parseClaudeLine(lines.at(-1)!).result;
    expect(result).not.toBeNull();
    expect(result!.costUsd).toBeGreaterThan(0);
    expect(result!.tokens!.input).toBeGreaterThan(0);
    expect(result!.isError).toBe(false);
  });
  it('is tolerant of garbage lines', () => {
    expect(parseClaudeLine('not json')).toEqual({ events: [], result: null });
    expect(parseClaudeLine('{"type":"weird"}')).toEqual({ events: [], result: null });
  });
});
describe('claudeArgs', () => {
  it('builds the headless command', () => {
    const args = claudeArgs({ caps: { budgetUsd: 2.5, timeoutMs: 1, maxTurns: 10 }, worktree: '/w' }, { bare: false });
    expect(args).toEqual(['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--max-budget-usd', '2.5', '--add-dir', '/w']);
    expect(claudeArgs({ caps: { budgetUsd: 1, timeoutMs: 1, maxTurns: null }, worktree: '/w' }, { bare: true })).toContain('--bare');
  });
});
```

- [x] **Step 3: Run to verify failure**

Run: `bun test test/core/drivers/claude.test.ts`
Expected: FAIL.

- [x] **Step 4: Write claude.ts**

```ts
// src/core/drivers/claude.ts
import { tmpdir } from 'node:os';
import type { Caps, TokenUsage } from '@contract';
import { exec } from '../exec';
import { runProcess } from '../process';
import { addTokens, helpHasFlags, type AgentEvent, type Driver, type LaunchInput, type LaunchResult } from './types';

export interface ClaudeResult { costUsd: number | null; tokens: TokenUsage | null; isError: boolean; durationMs: number | null }

const REQUIRED_FLAGS = ['--print', '--output-format', '--max-budget-usd', '--permission-mode', '--add-dir'];

export function claudeArgs(i: { caps: Caps; worktree: string }, opts: { bare: boolean }): string[] {
  const args = ['-p', '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', '--max-budget-usd', String(i.caps.budgetUsd), '--add-dir', i.worktree];
  if (opts.bare) args.push('--bare');
  return args;
}

const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown): string => (typeof v === 'string' ? v : '');

function usageFrom(u: unknown): TokenUsage | null {
  if (!u || typeof u !== 'object') return null;
  const o = u as Record<string, unknown>;
  return { input: num(o.input_tokens), output: num(o.output_tokens), cacheRead: num(o.cache_read_input_tokens), cacheWrite: num(o.cache_creation_input_tokens) };
}
function actionText(name: string, input: Record<string, unknown>): string {
  const target = str(input.file_path) || str(input.command) || str(input.pattern) || str(input.path) || str(input.url) || '';
  return `${name} ${target}`.trim().slice(0, 100);
}

export function parseClaudeLine(line: string): { events: AgentEvent[]; result: ClaudeResult | null } {
  let j: unknown;
  try { j = JSON.parse(line); } catch { return { events: [], result: null }; }
  if (!j || typeof j !== 'object') return { events: [], result: null };
  const o = j as Record<string, unknown>;
  const events: AgentEvent[] = [];
  if (o.type === 'assistant' && o.message && typeof o.message === 'object') {
    const msg = o.message as Record<string, unknown>;
    const content = Array.isArray(msg.content) ? msg.content : [];
    for (const block of content) {
      if (!block || typeof block !== 'object') continue;
      const b = block as Record<string, unknown>;
      if (b.type === 'tool_use') {
        const input = (b.input && typeof b.input === 'object' ? b.input : {}) as Record<string, unknown>;
        const name = str(b.name);
        events.push({ kind: 'action', text: actionText(name, input) });
        if (['Edit', 'Write', 'MultiEdit', 'NotebookEdit'].includes(name) && str(input.file_path)) events.push({ kind: 'file', path: str(input.file_path) });
      }
    }
    const tokens = usageFrom(msg.usage);
    if (tokens) events.push({ kind: 'usage', tokens, model: str(msg.model) || 'claude' });
    return { events, result: null };
  }
  if (o.type === 'result') {
    const costUsd = typeof o.total_cost_usd === 'number' ? o.total_cost_usd : null;
    if (costUsd !== null) events.push({ kind: 'cost', costUsd });
    return { events, result: { costUsd, tokens: usageFrom(o.usage), isError: o.is_error === true, durationMs: typeof o.duration_ms === 'number' ? o.duration_ms : null } };
  }
  return { events, result: null };
}

export const claudeDriver: Driver = {
  id: 'claude', displayName: 'Claude Code', color: '#F59E6B',
  async doctor() {
    const probeLines: string[] = [];
    const v = await exec('claude', ['--version']);
    if (v.code !== 0) return { found: false, version: null, authOk: false, notes: ['install: npm i -g @anthropic-ai/claude-code'] };
    const version = v.stdout.trim().split(/\s+/)[0] ?? null;
    const help = await exec('claude', ['--help']);
    const missing = helpHasFlags(help.stdout + help.stderr, REQUIRED_FLAGS);
    const notes = missing.length ? [`missing flags: ${missing.join(' ')}`] : [];
    // Real probe: a one-line prompt with a tiny budget. Exit 0 and no is_error means auth works.
    // 2.1.259 rejects --max-turns as an unknown option, so it is deliberately not passed here.
    const probe = await runProcess({ cmd: 'claude', args: ['-p', 'say ok', '--max-budget-usd', '0.05', '--output-format', 'json'], cwd: tmpdir(), timeoutMs: 60_000, stdin: '' , onStdoutLine: (l) => probeLines.push(l) });
    let isError = false;
    try { isError = (JSON.parse(probeLines.join('')) as { is_error?: boolean }).is_error === true; } catch { isError = true; }
    const authOk = probe.status === 'ok' && !isError;
    if (!authOk) notes.push(probe.status === 'timeout' ? 'auth probe timed out (workspace trust prompt? see Task 15)' : 'auth probe failed: run `claude` once interactively to log in');
    return { found: true, version, authOk: authOk && missing.length === 0, notes };
  },
  async launch(input: LaunchInput): Promise<LaunchResult> {
    const bare = process.env.BAKEOFF_BARE === '1' && !!process.env.ANTHROPIC_API_KEY;
    let tokens: TokenUsage | null = null;
    let result: ClaudeResult | null = null;
    const r = await runProcess({
      cmd: 'claude', args: claudeArgs(input, { bare }), cwd: input.worktree, stdin: input.packet,
      timeoutMs: input.caps.timeoutMs, signal: input.signal, meter: input.meter, logPath: input.logPath,
      onStdoutLine: (line) => {
        const parsed = parseClaudeLine(line);
        for (const e of parsed.events) {
          if (e.kind === 'usage') { tokens = addTokens(tokens, e.tokens); input.meter.addUsage(e.tokens, e.model); }
          if (e.kind === 'cost') input.meter.setCost(e.costUsd);
          input.onEvent(e);
        }
        if (parsed.result) result = parsed.result;
      },
    });
    const res = result as ClaudeResult | null;
    const status = r.status === 'ok' && res?.isError ? 'crashed' : r.status === 'aborted' ? 'crashed' : r.status;
    return { exitCode: r.exitCode, status, tokens: res?.tokens ?? tokens, costUsd: res?.costUsd ?? input.meter.costUsd, durationMs: r.durationMs, raw: res };
  },
};
```

```ts
// src/core/drivers/index.ts
import { registerDriver } from './registry';
import { claudeDriver } from './claude';
registerDriver(claudeDriver);
```

- [x] **Step 5: Run tests and doctor, commit**

Run: `bun test && bun run typecheck && bun run dev -- doctor --agents claude`
Expected: tests pass; doctor shows git, gh auth, Claude Code v2.1.259 all green. The doctor probe spends about one cent per run.

```bash
git add -A && git commit -m "feat(drivers): Claude Code driver with stream-json parser + fixture"
```

---

### Task 13: Publish (commit, push, PR)

**Files:**
- Create: `src/core/publish.ts`, `test/core/publish.test.ts`

**Interfaces:**
- Produces: `commitLeftovers(worktree, message, run?): Promise<boolean>`, `pushBranch(worktree, branch, run?): Promise<void>`, `ensureLabels(repo, labels: { name: string; color: string }[], run?)`, `createPr(o: { worktree; repo; branch; base; title; body; labels: string[] }, run?): Promise<{ url: string; number: number }>`, `prNumberFromUrl(url): number`.

- [x] **Step 1: Write the failing test**

```ts
// test/core/publish.test.ts
import { describe, expect, it } from 'vitest';
import { commitLeftovers, createPr, ensureLabels, prNumberFromUrl, pushBranch } from '../../src/core/publish';
import { fakeExec } from '../helpers/exec';
import { makeRepo } from '../helpers/repo';
import { must } from '../../src/core/exec';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

describe('publish', () => {
  it('commits leftovers only when dirty', async () => {
    const repo = await makeRepo({ 'a.txt': 'a' });
    expect(await commitLeftovers(repo.dir, 'bakeoff: final state')).toBe(false);
    writeFileSync(join(repo.dir, 'b.txt'), 'b');
    expect(await commitLeftovers(repo.dir, 'bakeoff: final state')).toBe(true);
    expect(await must('git', ['log', '-1', '--pretty=%s'], { cwd: repo.dir })).toBe('bakeoff: final state');
  });
  it('pushes, ensures labels, creates a PR via gh', async () => {
    const { run, calls } = fakeExec([
      [/^git push -u origin b/, {}],
      [/^gh label create/, {}],
      [/^gh pr create/, { stdout: 'https://github.com/a/b/pull/42\n' }],
    ]);
    await pushBranch('/w', 'b', run);
    await ensureLabels({ owner: 'a', name: 'b' }, [{ name: 'bakeoff', color: 'F59E0B' }], run);
    const pr = await createPr({ worktree: '/w', repo: { owner: 'a', name: 'b' }, branch: 'b', base: 'main', title: 'T', body: 'B', labels: ['bakeoff'] }, run);
    expect(pr).toEqual({ url: 'https://github.com/a/b/pull/42', number: 42 });
    expect(calls.find((c) => c.startsWith('gh pr create'))).toContain('--label bakeoff');
    expect(calls.find((c) => c.startsWith('gh label create'))).toContain('--force');
  });
  it('parses PR numbers', () => {
    expect(prNumberFromUrl('https://github.com/a/b/pull/7')).toBe(7);
    expect(() => prNumberFromUrl('nope')).toThrow();
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `bun test test/core/publish.test.ts`
Expected: FAIL.

- [x] **Step 3: Write publish.ts**

```ts
// src/core/publish.ts
import { exec, must, type Exec } from './exec';

type Repo = { owner: string; name: string };
const slug = (r: Repo) => `${r.owner}/${r.name}`;

export async function commitLeftovers(worktree: string, message: string, run: Exec = exec): Promise<boolean> {
  const status = await must('git', ['status', '--porcelain'], { cwd: worktree }, run);
  if (status.length === 0) return false;
  await must('git', ['add', '-A'], { cwd: worktree }, run);
  await must('git', ['-c', 'user.name=bakeoff', '-c', 'user.email=bakeoff@users.noreply.github.com', 'commit', '-q', '-m', message], { cwd: worktree }, run);
  return true;
}
export async function pushBranch(worktree: string, branch: string, run: Exec = exec): Promise<void> {
  await must('git', ['push', '-u', 'origin', branch, '--quiet'], { cwd: worktree }, run);
}
export async function ensureLabels(repo: Repo, labels: { name: string; color: string }[], run: Exec = exec): Promise<void> {
  for (const l of labels) await run('gh', ['label', 'create', l.name, '-R', slug(repo), '--color', l.color, '--force']);
}
export function prNumberFromUrl(url: string): number {
  const m = /\/pull\/(\d+)/.exec(url);
  if (!m) throw new Error(`Cannot find PR number in "${url}"`);
  return Number(m[1]);
}
export async function createPr(o: { worktree: string; repo: Repo; branch: string; base: string; title: string; body: string; labels: string[] }, run: Exec = exec): Promise<{ url: string; number: number }> {
  const args = ['pr', 'create', '-R', slug(o.repo), '--head', o.branch, '--base', o.base, '--title', o.title, '--body', o.body];
  for (const l of o.labels) args.push('--label', l);
  const url = (await must('gh', args, { cwd: o.worktree }, run)).split('\n').find((l) => l.includes('/pull/'))?.trim();
  if (!url) throw new Error('gh pr create returned no PR url');
  return { url, number: prNumberFromUrl(url) };
}
```

- [x] **Step 4: Run tests, commit**

Run: `bun test && bun run typecheck`
Expected: pass.

```bash
git add -A && git commit -m "feat(core): commit leftovers, push, labels, gh pr create"
```

---

### Task 14: Race orchestrator (no scoring yet)

**Files:**
- Create: `src/core/race.ts`, `test/core/race.test.ts`

**Interfaces:**
- Consumes: everything from Tasks 3-13.
- Produces:
  - `RaceInput = { repoRoot: string; repo: RepoInfo; issue: IssueData; config: Config; agents: DriverId[]; caps: Caps; runId: string; keepWorktrees?: boolean }`
  - `RaceDeps = { getDriver: (id) => Driver; exec: Exec; now: () => Date; meterFor: (cap) => BudgetMeter; baseline: (i: RaceInput) => Promise<Baseline>; scoreAgent: ScoreAgentFn | null; finalize: FinalizeFn | null; onEvent?: (e: RaceEvent) => void }` with defaults in `defaultDeps()`.
  - `runRace(input, deps?): Promise<RunRecord>`.
  - `ScoreAgentFn = (ctx: { worktree; repoRoot; baseSha; config; agent: AgentResult; hiddenDir }) => Promise<Pick<AgentResult,'score'|'filesTouched'|'linesAdded'|'linesRemoved'>>` and `FinalizeFn = (agents: AgentResult[], configured: Configured) => AgentResult[]` (assigns diff component, ranks). Both are wired in Day 4; `null` means "skip".
  - Also `createAbortRegistry()`: `{ signalFor(driver): AbortSignal; abort(driver): void }` used by the server later.

- [x] **Step 1: Write the failing test with a fake driver**

```ts
// test/core/race.test.ts
import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { runRace, defaultDeps } from '../../src/core/race';
import { readRun, readEvents } from '../../src/core/store';
import { makeRepo } from '../helpers/repo';
import { fakeExec } from '../helpers/exec';
import { exec } from '../../src/core/exec';
import type { Driver } from '../../src/core/drivers/types';

function fakeDriver(id: 'claude' | 'codex', behaviour: 'ok' | 'crash'): Driver {
  return {
    id, displayName: id, color: '#000',
    doctor: async () => ({ found: true, version: '0', authOk: true, notes: [] }),
    launch: async (i) => {
      i.onEvent({ kind: 'action', text: 'Edit a.txt' });
      i.onEvent({ kind: 'usage', tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, model: 'gpt-5' });
      if (behaviour === 'ok') writeFileSync(join(i.worktree, 'a.txt'), `fixed by ${id}`);
      return { exitCode: behaviour === 'ok' ? 0 : 1, status: behaviour === 'ok' ? 'ok' : 'crashed', tokens: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, costUsd: 0.01, durationMs: 50, raw: null };
    },
  };
}

describe('runRace', () => {
  it('runs agents in worktrees, publishes, writes record and events', async () => {
    const repo = await makeRepo({ 'a.txt': 'broken', 'bakeoff.yml': 'test: true\n' });
    // route git push / gh through a fake, everything else through the real exec
    const { run: fake, calls } = fakeExec([
      [/^git push/, {}], [/^gh label create/, {}],
      [/^gh pr create .*--head bakeoff\/1-claude/, { stdout: 'https://github.com/o/r/pull/1\n' }],
    ]);
    const routed = async (cmd: string, args: string[], opts?: Parameters<typeof exec>[2]) =>
      (cmd === 'gh' || (cmd === 'git' && args[0] === 'push')) ? fake(cmd, args, opts) : exec(cmd, args, opts);
    const input = {
      repoRoot: repo.dir, repo: { owner: 'o', name: 'r', defaultBranch: 'main', baseSha: repo.sha },
      issue: { info: { number: 1, title: 'Fix a', url: 'https://github.com/o/r/issues/1' }, body: 'a is broken', comments: [] },
      config: { test: 'true', agents: ['claude'] as const, budget_usd: 1, timeout: '1m', ci_timeout: '0s', judge: { enabled: false, model: 'x' } },
      agents: ['claude', 'codex'] as const, caps: { budgetUsd: 1, timeoutMs: 60000, maxTurns: null }, runId: '20260902-test',
    };
    const drivers = { claude: fakeDriver('claude', 'ok'), codex: fakeDriver('codex', 'crash') };
    const rec = await runRace(input, { ...defaultDeps(), exec: routed, getDriver: (id) => drivers[id as 'claude' | 'codex'], baseline: async () => ({ testsGreen: true, lintGreen: null, typecheckGreen: null }), scoreAgent: null, finalize: null });

    expect(rec.id).toBe('20260902-test');
    expect(rec.packetHash).toMatch(/^[0-9a-f]{64}$/);
    expect(rec.baseline.testsGreen).toBe(true);
    const claude = rec.agents.find((a) => a.driver === 'claude')!;
    expect(claude.status).toBe('ok');
    expect(claude.prUrl).toBe('https://github.com/o/r/pull/1');
    expect(claude.prNumber).toBe(1);
    expect(claude.branch).toBe('bakeoff/1-claude-20260902-test');
    const codex = rec.agents.find((a) => a.driver === 'codex')!;
    expect(codex.status).toBe('crashed');
    expect(codex.prUrl).toBeNull();
    expect(readRun(repo.dir, rec.id)).toEqual(rec);
    const types = readEvents(repo.dir, rec.id).map((e) => e.type);
    expect(types[0]).toBe('race.started');
    expect(types).toContain('agent.pr_opened');
    expect(types.at(-1)).toBe('race.finished');
    expect(calls.some((c) => c.startsWith('git push -u origin bakeoff/1-claude'))).toBe(true);
    expect(calls.some((c) => c.startsWith('git push -u origin bakeoff/1-codex'))).toBe(false);
  });
});
```

- [x] **Step 2: Run to verify failure**

Run: `bun test test/core/race.test.ts`
Expected: FAIL.

- [x] **Step 3: Write race.ts**

```ts
// src/core/race.ts
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { AgentResult, Baseline, Caps, Configured, DriverId, RaceEvent, RepoInfo, RunRecord } from '@contract';
import type { BudgetMeter } from './budget';
import { configuredFlags, type Config } from './config';
import { getDriver as registryGet } from './drivers/registry';
import type { AgentEvent, Driver } from './drivers/types';
import { exec as realExec, type Exec } from './exec';
import type { IssueData } from './issue';
import { NAMES, branchName, runLabel } from './names';
import { buildPacket, readGuidance } from './packet';
import { defaultMeter } from './pricing';
import { commitLeftovers, createPr, ensureLabels, pushBranch } from './publish';
import { appendEvent, paths, writeRun } from './store';
import { createWorktree, removeWorktree, worktreeDir } from './worktree';

export interface RaceInput {
  repoRoot: string; repo: RepoInfo; issue: IssueData; config: Config;
  agents: readonly DriverId[]; caps: Caps; runId: string; keepWorktrees?: boolean;
}
export interface ScoreCtx { worktree: string; repoRoot: string; baseSha: string; config: Config; agent: AgentResult; hiddenDir: string; repo: RepoInfo }
export type ScoreAgentFn = (ctx: ScoreCtx) => Promise<Pick<AgentResult, 'score' | 'filesTouched' | 'linesAdded' | 'linesRemoved'>>;
export type FinalizeFn = (agents: AgentResult[], configured: Configured) => AgentResult[];
export interface RaceDeps {
  getDriver: (id: DriverId) => Driver; exec: Exec; now: () => Date; meterFor: (capUsd: number) => BudgetMeter;
  baseline: (i: RaceInput) => Promise<Baseline>;
  scoreAgent: ScoreAgentFn | null; finalize: FinalizeFn | null;
  onEvent?: (e: RaceEvent) => void;
  abort?: AbortRegistry;
}
export interface AbortRegistry { signalFor(driver: DriverId): AbortSignal; abort(driver: DriverId): void }
export function createAbortRegistry(): AbortRegistry {
  const m = new Map<DriverId, AbortController>();
  const get = (d: DriverId) => m.get(d) ?? (m.set(d, new AbortController()), m.get(d)!);
  return { signalFor: (d) => get(d).signal, abort: (d) => get(d).abort() };
}
export function defaultDeps(): RaceDeps {
  return { getDriver: registryGet, exec: realExec, now: () => new Date(), meterFor: defaultMeter,
    baseline: async () => ({ testsGreen: null, lintGreen: null, typecheckGreen: null }), scoreAgent: null, finalize: null };
}

const LABEL_COLOR = 'F59E0B';
const tail = (file: string, n = 40) => existsSync(file) ? readFileSync(file, 'utf8').trimEnd().split('\n').slice(-n).join('\n') : '';

export async function runRace(input: RaceInput, deps: RaceDeps = defaultDeps()): Promise<RunRecord> {
  const { repoRoot, repo, issue, config, runId } = input;
  const p = paths(repoRoot);
  const abort = deps.abort ?? createAbortRegistry();
  const emit = (e: RaceEvent) => { appendEvent(repoRoot, runId, e); deps.onEvent?.(e); };
  const at = () => deps.now().toISOString();

  const packet = buildPacket({ issue, guidance: readGuidance(repoRoot), config });
  const baseline = await deps.baseline(input);
  const configured = configuredFlags(config);
  const record: RunRecord = {
    schemaVersion: 1, id: runId, createdAt: at(), finishedAt: null, repo,
    issue: issue.info, packetHash: packet.hash, caps: input.caps, baseline, configured,
    agents: input.agents.map((d) => ({ driver: d, status: 'running', branch: branchName(issue.info.number, d, runId), exitCode: null, durationMs: 0, costUsd: null, tokens: null,
      filesTouched: [], linesAdded: 0, linesRemoved: 0, prUrl: null, prNumber: null, score: null, rank: null, logTail: '' })),
    winner: null,
  };
  writeRun(repoRoot, record);
  emit({ type: 'race.started', at: at(), runId, issue: issue.info, repo, agents: [...input.agents], caps: input.caps, baseline });
  mkdirSync(p.logsDir(runId), { recursive: true });
  const packetPath = join(p.logsDir(runId), 'packet.md');
  writeFileSync(packetPath, packet.text);
  await ensureLabels(repo, [{ name: NAMES.label, color: LABEL_COLOR }, { name: runLabel(runId), color: LABEL_COLOR }], deps.exec);

  const results = await Promise.all(record.agents.map((a) => runOne(a)));
  record.agents = deps.finalize ? deps.finalize(results, configured) : results;
  record.winner = record.agents.find((a) => a.rank === 1)?.driver ?? null;
  record.finishedAt = at();
  writeRun(repoRoot, record);
  emit({ type: 'race.finished', at: record.finishedAt, record });
  return record;

  async function runOne(agent: AgentResult): Promise<AgentResult> {
    const driver = deps.getDriver(agent.driver);
    const dir = worktreeDir(runId, agent.driver);
    const logPath = p.log(runId, agent.driver);
    const meter = deps.meterFor(input.caps.budgetUsd);
    const files = new Set<string>();
    let lastAction = '';
    let lastProgress = 0;
    await createWorktree({ repoRoot, baseSha: repo.baseSha, branch: agent.branch, dir }, deps.exec);
    emit({ type: 'agent.started', at: at(), driver: agent.driver, branch: agent.branch });
    const onEvent = (e: AgentEvent) => {
      if (e.kind === 'action') lastAction = e.text;
      if (e.kind === 'file') files.add(e.path);
      const now = Date.now();
      if (now - lastProgress > 1000 || e.kind === 'cost') {
        lastProgress = now;
        emit({ type: 'agent.progress', at: at(), driver: agent.driver, costUsd: meter.costUsd, tokens: null, lastAction, filesTouched: files.size });
      }
    };
    let out: AgentResult = { ...agent };
    try {
      const r = await driver.launch({ packet: packet.text, packetPath, worktree: dir, branch: agent.branch, caps: input.caps, meter, onEvent, signal: abort.signalFor(agent.driver), logPath });
      out = { ...out, status: r.status, exitCode: r.exitCode, durationMs: r.durationMs, costUsd: r.costUsd, tokens: r.tokens };
    } catch (err) {
      out = { ...out, status: 'crashed', exitCode: null, durationMs: 0 };
      writeFileSync(logPath, `\n[bakeoff] driver threw: ${(err as Error).message}\n`, { flag: 'a' });
    }
    emit({ type: 'agent.exited', at: at(), driver: agent.driver, status: out.status, exitCode: out.exitCode, durationMs: out.durationMs, costUsd: out.costUsd, tokens: out.tokens });

    if (out.status === 'ok') {
      try {
        await commitLeftovers(dir, `bakeoff: final state (${agent.driver})`, deps.exec);
        await pushBranch(dir, agent.branch, deps.exec);
        const pr = await createPr({ worktree: dir, repo, branch: agent.branch, base: repo.defaultBranch,
          title: `${issue.info.title} (${driver.displayName})`,
          body: `Bakeoff run \`${runId}\` for #${issue.info.number}.\nAgent: ${driver.displayName}\nPacket sha256: \`${packet.hash}\`\nScoreboard: .bakeoff/runs/${runId}.html`,
          labels: [NAMES.label, runLabel(runId)] }, deps.exec);
        out = { ...out, prUrl: pr.url, prNumber: pr.number };
        emit({ type: 'agent.pr_opened', at: at(), driver: agent.driver, prUrl: pr.url, prNumber: pr.number });
      } catch (err) {
        writeFileSync(logPath, `\n[bakeoff] publish failed: ${(err as Error).message}\n`, { flag: 'a' });
      }
      if (deps.scoreAgent) {
        const s = await deps.scoreAgent({ worktree: dir, repoRoot, baseSha: repo.baseSha, config, agent: out, hiddenDir: p.hiddenDir, repo });
        out = { ...out, ...s };
        if (out.score) emit({ type: 'agent.scored', at: at(), driver: agent.driver, score: out.score });
      }
    }
    out.logTail = tail(logPath);
    if (!input.keepWorktrees) await removeWorktree({ repoRoot, dir }, deps.exec);
    return out;
  }
}
```

- [x] **Step 4: Run tests, commit**

Run: `bun test && bun run typecheck`
Expected: pass.

```bash
git add -A && git commit -m "feat(core): race orchestrator with events, publish, worktree lifecycle"
```

---

### Task 15: `bakeoff run` + `bakeoff init`, first real PR (day-2 milestone)

**Files:**
- Create: `src/cli/commands/run.ts`, `src/cli/commands/init.ts`, `src/cli/render/style.ts`, `src/cli/render/progress.ts`, `test/cli/style.test.ts`
- Modify: `src/cli/index.ts`

**Interfaces:**
- Produces: `style.ts`: `DRIVER_NAME`, `DRIVER_HEX`, `STATUS_HEX`, `colorEnabled(): boolean`, `paint(hex, s)`, `dim(s)`, `fmtClock(ms)` (`6:52`), `fmtClockPadded(ms)` (`02:14`), `fmtTok(tokens)` (`181k tok`), `fmtCost(n)` (`$1.20` / `n/a`), `spendBar(cost, budget, width = 20)`. `progress.ts`: `progressRenderer(out?): { onEvent(e: RaceEvent): void; stop(): void }`. `runCommand(issueArg: string | undefined, opts: { agents?: string; budget?: string; timeout?: string; watch?: boolean; keepWorktrees?: boolean })`, `initCommand()`.

- [x] **Step 1: Write style.ts with a failing test, then progress.ts**

```ts
// test/cli/style.test.ts
import { afterEach, describe, expect, it } from 'vitest';
import { fmtClock, fmtClockPadded, fmtCost, fmtTok, paint, spendBar, colorEnabled } from '../../src/cli/render/style';

describe('style', () => {
  const env = { ...process.env };
  afterEach(() => { process.env = { ...env }; });
  it('formats clocks, tokens, cost', () => {
    expect(fmtClock(412000)).toBe('6:52'); expect(fmtClock(93000)).toBe('1:33'); expect(fmtClockPadded(134000)).toBe('02:14');
    expect(fmtTok({ input: 181000, output: 9400, cacheRead: 0, cacheWrite: 0 })).toBe('190k tok'); expect(fmtTok(null)).toBe('— tok');
    expect(fmtCost(1.2)).toBe('$1.20'); expect(fmtCost(null)).toBe('n/a');
  });
  it('draws a 20-cell spend bar', () => {
    process.env.NO_COLOR = '1';
    expect(spendBar(1.2, 3)).toBe('▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱');
    expect(spendBar(null, 3)).toBe('▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱');
    expect(spendBar(9, 3)).toBe('▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰');
  });
  it('strips color under NO_COLOR and emits truecolor otherwise', () => {
    process.env.NO_COLOR = '1';
    expect(colorEnabled()).toBe(false); expect(paint('#F59E6B', 'x')).toBe('x');
    delete process.env.NO_COLOR; process.env.FORCE_COLOR = '3';
    expect(paint('#F59E6B', 'x')).toBe('\x1b[38;2;245;158;107mx\x1b[39m');
  });
});
```

Run: `bun test test/cli/style.test.ts` → FAIL. Then:

```ts
// src/cli/render/style.ts
import type { AgentStatus, DriverId, TokenUsage } from '@contract';

export const DRIVER_NAME: Record<DriverId, string> = { claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode', gemini: 'Gemini CLI' };
export const DRIVER_HEX: Record<DriverId, string> = { claude: '#F59E6B', codex: '#5EC8CE', opencode: '#E58BC7', gemini: '#9BCB6E' };
export const STATUS_HEX: Record<AgentStatus, string> = { running: '#60A5FA', ok: '#4ADE80', crashed: '#F87171', timeout: '#F87171', budget_exceeded: '#F87171' };
export const STATUS_WORD: Record<AgentStatus, string> = { running: 'running', ok: 'done', crashed: 'crashed', timeout: 'timed out', budget_exceeded: 'over budget' };
export const SOFT_RED = '#F87171';

export function colorEnabled(out: { isTTY?: boolean } = process.stdout): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  return !!out.isTTY;
}
const truecolor = () => /truecolor|24bit/i.test(process.env.COLORTERM ?? '') || process.env.FORCE_COLOR === '3';
const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const to256 = ([r, g, b]: [number, number, number]) => 16 + 36 * Math.round(r / 51) + 6 * Math.round(g / 51) + Math.round(b / 51);

export function paint(hex: string, s: string): string {
  if (!colorEnabled()) return s;
  const c = rgb(hex);
  return truecolor() ? `\x1b[38;2;${c[0]};${c[1]};${c[2]}m${s}\x1b[39m` : `\x1b[38;5;${to256(c)}m${s}\x1b[39m`;
}
export const dim = (s: string) => (colorEnabled() ? `\x1b[2m${s}\x1b[22m` : s);
export const bold = (s: string) => (colorEnabled() ? `\x1b[1m${s}\x1b[22m` : s);

export function fmtClock(ms: number): string { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
export function fmtClockPadded(ms: number): string { const s = Math.round(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
export function fmtTok(t: TokenUsage | null): string { return t ? `${Math.round((t.input + t.output) / 1000)}k tok` : '— tok'; }
export const fmtCost = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
export function spendBar(cost: number | null, budget: number, width = 20, hex = '#FFFFFF'): string {
  const filled = cost === null ? 0 : Math.min(width, Math.round((cost / budget) * width));
  return paint(hex, '▰'.repeat(filled)) + dim('▱'.repeat(width - filled));
}
```

```ts
// src/cli/render/progress.ts
import { applyEvent, initialState, type RaceEvent, type RaceState } from '@contract';
import { DRIVER_HEX, DRIVER_NAME, STATUS_HEX, STATUS_WORD, colorEnabled, dim, fmtClockPadded, fmtCost, fmtTok, paint, spendBar } from './style';

/** In-place live view per design/TERMINAL.md. Non-TTY: prints nothing (the final table still prints). */
export function progressRenderer(out: NodeJS.WriteStream = process.stdout) {
  let state: RaceState = initialState;
  let drawn = 0;
  const live = !!out.isTTY;
  const startedAt = Date.now();
  const width = () => out.columns ?? 100;

  const frame = (): string[] => {
    const lines: string[] = [];
    const issue = state.issue ? `${state.repo?.owner}/${state.repo?.name} #${state.issue.number}  ${state.issue.title}` : '';
    lines.push(`  ${paint('#F4F4F7', 'bakeoff')}  ${issue}`);
    const running = state.agents.filter((a) => a.status === 'running').length;
    const left = `  ${running} of ${state.agents.length} running`;
    const right = `${fmtClockPadded(Date.now() - startedAt)} elapsed`;
    lines.push(left + ' '.repeat(Math.max(1, Math.min(width(), 72) - left.length - right.length)) + right, '');
    const budget = state.caps?.budgetUsd ?? 1;
    for (const a of state.agents) {
      const name = DRIVER_NAME[a.driver].padEnd(12);
      const status = paint(STATUS_HEX[a.status], STATUS_WORD[a.status].padEnd(9));
      const files = `${a.filesTouched} file${a.filesTouched === 1 ? '' : 's'}`;
      const pr = a.prNumber ? `   PR #${a.prNumber}` : '';
      lines.push(`  ${paint(DRIVER_HEX[a.driver], '●')} ${name}  ${status} ${fmtCost(a.costUsd).padStart(6)} ${spendBar(a.costUsd, budget, 20, DRIVER_HEX[a.driver])} ${fmtCost(budget)}   ${fmtTok(a.tokens).padStart(8)}   ${files}${pr}`);
      const action = (a.lastAction || '').slice(0, Math.max(10, width() - 30));
      lines.push(action ? `                            ${dim(action)}` : '', '');
    }
    return lines;
  };
  const redraw = () => {
    if (!live) return;
    const lines = frame();
    if (drawn) out.write(`\x1b[${drawn}A\x1b[J`);
    out.write(lines.join('\n') + '\n');
    drawn = lines.length;
  };
  const timer = live ? setInterval(redraw, 1000) : null;
  return {
    onEvent(e: RaceEvent) { state = applyEvent(state, e); redraw(); },
    stop() { if (timer) clearInterval(timer); if (live && drawn) { out.write(`\x1b[${drawn}A\x1b[J`); drawn = 0; } },
  };
}
```

`colorEnabled` is imported so `paint` inside `frame()` respects `NO_COLOR` on a TTY (the bar and dots print plain). Run: `bun test test/cli/style.test.ts && bun run typecheck` → pass.

- [x] **Step 2: Write run.ts and init.ts**

```ts
// src/cli/commands/run.ts
import * as p from '@clack/prompts';
import { DriverIdSchema, type DriverId } from '@contract';
import { loadConfig, parseDuration } from '../../core/config';
import { fetchIssue, listOpenIssues, parseIssueRef } from '../../core/issue';
import { NAMES } from '../../core/names';
import { defaultDeps, runRace } from '../../core/race';
import { detectRepo } from '../../core/repo';
import { newRunId } from '../../core/store';
import { doctorReport } from './doctor';
import { progressRenderer } from '../render/progress';

export interface RunOpts { agents?: string; budget?: string; timeout?: string; watch?: boolean; keepWorktrees?: boolean }

export async function runCommand(issueArg: string | undefined, opts: RunOpts): Promise<void> {
  p.intro(`${NAMES.brand} run`);
  const repo = await detectRepo(process.cwd());
  const config = loadConfig(repo.root);
  const agents: DriverId[] = (opts.agents ? opts.agents.split(',').map((s) => s.trim()) : config.agents).map((s) => DriverIdSchema.parse(s));
  const caps = { budgetUsd: opts.budget ? Number(opts.budget) : config.budget_usd, timeoutMs: parseDuration(opts.timeout ?? config.timeout), maxTurns: config.max_turns ?? null };

  const doc = await doctorReport(agents);
  for (const l of doc) if (!l.ok) p.log.error(`${l.name}: ${l.detail}`);
  if (doc.some((l) => !l.ok)) { p.cancel('Preflight failed.'); process.exit(1); }

  let ref;
  if (issueArg) ref = parseIssueRef(issueArg, repo);
  else {
    const issues = await listOpenIssues(repo);
    const pick = await p.select({ message: 'Which issue?', options: issues.map((i) => ({ value: i.number, label: `#${i.number} ${i.title}` })) });
    if (p.isCancel(pick)) { p.cancel('Aborted.'); process.exit(1); }
    ref = { owner: repo.owner, name: repo.name, number: pick as number };
  }
  const issue = await fetchIssue(ref);
  const runId = newRunId();
  p.log.info(`#${issue.info.number} ${issue.info.title}\nagents: ${agents.join(', ')} · budget $${caps.budgetUsd} · timeout ${opts.timeout ?? config.timeout} · run ${runId}`);

  const deps = defaultDeps();
  const live = progressRenderer();
  deps.onEvent = live.onEvent;
  const rec = await runRace({ repoRoot: repo.root, repo, issue, config, agents, caps, runId, keepWorktrees: opts.keepWorktrees }, deps);
  live.stop();
  for (const a of rec.agents) console.log(`  ${a.driver.padEnd(10)} ${a.status.padEnd(9)} ${a.costUsd === null ? 'n/a' : `$${a.costUsd.toFixed(2)}`}  ${(a.durationMs / 1000).toFixed(0)}s  ${a.prUrl ?? 'no PR'}`);
  console.log(`\n  Run record  ${NAMES.stateDir}/runs/${runId}.json`);
}
```

```ts
// src/cli/commands/init.ts
import * as p from '@clack/prompts';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NAMES } from '../../core/names';

const TEMPLATE = `# ${NAMES.brand} config. See https://github.com/${NAMES.org}/bakeoff#config
test: bun test
# lint: bun run lint
# typecheck: bunx tsc --noEmit
agents: [claude]
budget_usd: 3
timeout: 20m
ci_timeout: 10m
# hidden_tests:
#   dest: tests/hidden
#   command: bun test tests/hidden
`;

export function initCommand(cwd = process.cwd()): void {
  const cfg = join(cwd, NAMES.configFile);
  if (existsSync(cfg)) { p.log.warn(`${NAMES.configFile} already exists`); } else { writeFileSync(cfg, TEMPLATE); p.log.success(`wrote ${NAMES.configFile}`); }
  const gi = join(cwd, '.gitignore');
  const want = [`${NAMES.stateDir}/hidden/`, `${NAMES.stateDir}/logs/`];
  const have = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  const missing = want.filter((w) => !have.split('\n').includes(w));
  if (missing.length) { appendFileSync(gi, `${have.endsWith('\n') || have === '' ? '' : '\n'}${missing.join('\n')}\n`); p.log.success(`added ${missing.join(', ')} to .gitignore`); }
}
```

Add to `src/cli/index.ts`:

```ts
program.command('run [issue]').description('Race agents on an issue (owner/repo#123, #123, or URL)')
  .option('-a, --agents <list>').option('-b, --budget <usd>').option('-t, --timeout <duration>').option('-w, --watch').option('--keep-worktrees')
  .action(runCommand);
program.command('init').description(`Write ${NAMES.configFile} and gitignore entries`).action(() => initCommand());
```

- [x] **Step 3: Typecheck and unit tests**

Run: `bun test && bun run typecheck`
Expected: pass.

- [x] **Step 4a: Check that headless Claude does not block on a workspace-trust prompt in a fresh $TMPDIR worktree**

Interactive Claude Code asks "Do you trust the files in this folder?" the first time it sees a directory. Bakeoff's worktrees are always fresh directories under `$TMPDIR`, so prove `-p` mode never waits on that prompt:

```bash
d="$TMPDIR/bakeoff-trust-check" && rm -rf "$d" && mkdir -p "$d" && cd "$d" && git init -q && echo x > x.txt && git add -A && git -c user.name=t -c user.email=t@t commit -q -m init
timeout 90 claude -p "print the word ok and stop" --max-budget-usd 0.05 --output-format json --permission-mode acceptEdits < /dev/null | head -c 300; echo; echo "exit=${pipestatus[1]:-$?}"
```

Expected: a JSON envelope within a few seconds and exit 0. If instead it hangs until `timeout` kills it (exit 124), or the stderr mentions trust, apply this fix in `claudeDriver.launch` and re-run the check: pre-seed trust for the worktree path before spawning by merging `{ "projects": { "<worktree>": { "hasTrustDialogAccepted": true } } }` into `~/.claude.json` (read, merge, write; create the file if missing), and pass `--add-dir <worktree>` (already in `claudeArgs`). Record which of the two was needed in `CLAUDE.md` under Driver notes.

- [x] **Step 4: Manual end-to-end on the scratch repo (this is the day-2 milestone)**

```bash
gh repo create bakeoff-dev/scratch --public --clone --description "Bakeoff test bed" && cd scratch
cat > paginate.ts <<'EOF'
export function paginate<T>(items: T[], page: number, size: number): T[] {
  return items.slice((page - 1) * size, page * size + 1); // off by one
}
EOF
cat > paginate.test.ts <<'EOF'
import { expect, test } from 'bun:test';
import { paginate } from './paginate';
test('page 1 of size 2', () => { expect(paginate([1,2,3,4], 1, 2)).toEqual([1,2]); });
test('page 2 of size 2', () => { expect(paginate([1,2,3,4], 2, 2)).toEqual([3,4]); });
EOF
bun run /path/to/bakeoff/src/cli/index.ts init
git add -A && git commit -m "scratch: paginate with a bug" && git push -u origin main
gh issue create --title "paginate() returns one item too many" --body "paginate([1,2,3,4],1,2) returns [1,2,3]. It should return [1,2]. See paginate.test.ts."
bun run /path/to/bakeoff/src/cli/index.ts run 1 --agents claude --budget 1 --timeout 5m
```

Expected: the live block redraws in place with a colored `●`, the spend bar creeping up, and the last action dimmed underneath; after exit the block clears and a plain line prints `claude  ok  $0.xx  NNs  https://github.com/bakeoff-dev/scratch/pull/1`. `gh pr view 1` shows labels `bakeoff` and `bakeoff-run:<id>`. `.bakeoff/runs/<id>.json` has `status: "ok"`, a `costUsd`, tokens, and `prUrl`. Take the screenshot.

- [x] **Step 5: Commit**

```bash
git add -A && git commit -m "feat(cli): run and init commands; first real PR"
```

---

# Day 3: Codex driver

### Task 16: Codex driver

**Files:**
- Create: `src/core/drivers/codex.ts`, `test/fixtures/drivers/codex/events.jsonl`, `test/core/drivers/codex.test.ts`
- Modify: `src/core/drivers/index.ts`

**Interfaces:**
- Produces: `codexDriver: Driver`, `codexArgs(i: { worktree: string }): string[]`, `parseCodexLine(line): { events: AgentEvent[]; done: boolean }`.

- [ ] **Step 1: Install and record a fixture**

```bash
npm i -g @openai/codex@0.153.0 && codex --version && codex exec --help | grep -E -- '--json|--full-auto|--ephemeral|--skip-git-repo-check|-C|--output-last-message'
mkdir -p test/fixtures/drivers/codex && cd "$(mktemp -d)" && git init -q && \
printf 'Create a file named hello.txt containing the single word pong, then stop.' | \
codex exec --json --full-auto --ephemeral --skip-git-repo-check -C "$PWD" - \
  > "$OLDPWD/test/fixtures/drivers/codex/events.jsonl" 2> "$OLDPWD/test/fixtures/drivers/codex/stderr.txt"; cd "$OLDPWD"
cut -c1-200 test/fixtures/drivers/codex/events.jsonl
```

Confirm which lines carry (a) a file change or command execution item, and (b) token usage (`turn.completed` with `usage.input_tokens`, `usage.cached_input_tokens`, `usage.output_tokens` in 0.15x). Also confirm the model name appears in an early `thread.started` / `session` line; if it does not, read it from `codex --version` config via `codex exec --help` (`--config model=...`) and default to `gpt-5-codex`. Adjust the field names in Step 3 to match the fixture.

- [ ] **Step 2: Write the failing test**

```ts
// test/core/drivers/codex.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { codexArgs, parseCodexLine } from '../../../src/core/drivers/codex';

const lines = readFileSync('test/fixtures/drivers/codex/events.jsonl', 'utf8').split('\n').filter(Boolean);

describe('codex parser', () => {
  it('produces actions, file events and usage from the recorded run', () => {
    const events = lines.flatMap((l) => parseCodexLine(l).events);
    expect(events.some((e) => e.kind === 'action')).toBe(true);
    expect(events.some((e) => e.kind === 'file' && e.path.endsWith('hello.txt'))).toBe(true);
    const usage = events.filter((e) => e.kind === 'usage');
    expect(usage.length).toBeGreaterThan(0);
    expect(usage[0]!.kind === 'usage' && usage[0]!.tokens.input).toBeGreaterThan(0);
  });
  it('tolerates junk', () => {
    expect(parseCodexLine('x')).toEqual({ events: [], done: false });
  });
  it('builds args', () => {
    expect(codexArgs({ worktree: '/w' })).toEqual(['exec', '--json', '--full-auto', '--ephemeral', '--skip-git-repo-check', '-C', '/w', '-']);
  });
});
```

- [ ] **Step 3: Run to verify failure, then write codex.ts**

Run: `bun test test/core/drivers/codex.test.ts` → FAIL.

```ts
// src/core/drivers/codex.ts
import type { TokenUsage } from '@contract';
import { exec } from '../exec';
import { runProcess } from '../process';
import { addTokens, helpHasFlags, type AgentEvent, type Driver, type LaunchInput, type LaunchResult } from './types';

const REQUIRED_FLAGS = ['--json', '--full-auto', '--ephemeral', '--skip-git-repo-check'];
const DEFAULT_MODEL = 'gpt-5-codex';

export function codexArgs(i: { worktree: string }): string[] {
  return ['exec', '--json', '--full-auto', '--ephemeral', '--skip-git-repo-check', '-C', i.worktree, '-'];
}
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const str = (v: unknown) => (typeof v === 'string' ? v : '');
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

let currentModel = DEFAULT_MODEL;

export function parseCodexLine(line: string): { events: AgentEvent[]; done: boolean } {
  let j: unknown;
  try { j = JSON.parse(line); } catch { return { events: [], done: false }; }
  const o = obj(j);
  const events: AgentEvent[] = [];
  const type = str(o.type);
  if (type === 'thread.started' || type === 'session.created') { const m = str(o.model) || str(obj(o.session).model); if (m) currentModel = m; }
  if (type === 'item.completed' || type === 'item.started') {
    const item = obj(o.item);
    const itype = str(item.type);
    if (itype === 'command_execution') events.push({ kind: 'action', text: `Bash ${str(item.command)}`.slice(0, 100) });
    if (itype === 'file_change') {
      const changes = Array.isArray(item.changes) ? item.changes : [];
      for (const c of changes) { const path = str(obj(c).path); if (path) { events.push({ kind: 'file', path }); events.push({ kind: 'action', text: `Edit ${path}`.slice(0, 100) }); } }
    }
    if (itype === 'agent_message' && type === 'item.completed') events.push({ kind: 'action', text: `Say ${str(item.text).replace(/\s+/g, ' ')}`.slice(0, 100) });
  }
  if (type === 'turn.completed') {
    const u = obj(o.usage);
    const cached = num(u.cached_input_tokens);
    const tokens: TokenUsage = { input: Math.max(0, num(u.input_tokens) - cached), output: num(u.output_tokens), cacheRead: cached, cacheWrite: 0 };
    events.push({ kind: 'usage', tokens, model: currentModel });
  }
  return { events, done: type === 'turn.completed' || type === 'thread.completed' };
}

export const codexDriver: Driver = {
  id: 'codex', displayName: 'Codex', color: '#5EC8CE',
  async doctor() {
    const v = await exec('codex', ['--version']);
    if (v.code !== 0) return { found: false, version: null, authOk: false, notes: ['install: npm i -g @openai/codex'] };
    const version = v.stdout.trim().split(/\s+/).pop() ?? null;
    const help = await exec('codex', ['exec', '--help']);
    const missing = helpHasFlags(help.stdout + help.stderr, REQUIRED_FLAGS);
    const authOk = !!process.env.CODEX_API_KEY || !!process.env.OPENAI_API_KEY || (await exec('codex', ['login', 'status'])).code === 0;
    const notes = [...(missing.length ? [`missing flags: ${missing.join(' ')}`] : []), ...(authOk ? [] : ['not logged in: run `codex login` or set CODEX_API_KEY']), 'no native budget cap; bakeoff meters tokens'];
    return { found: true, version, authOk: authOk && missing.length === 0, notes };
  },
  async launch(input: LaunchInput): Promise<LaunchResult> {
    let tokens: TokenUsage | null = null;
    const r = await runProcess({
      cmd: 'codex', args: codexArgs(input), cwd: input.worktree, stdin: input.packet,
      timeoutMs: input.caps.timeoutMs, signal: input.signal, meter: input.meter, logPath: input.logPath,
      onStdoutLine: (line) => {
        for (const e of parseCodexLine(line).events) {
          if (e.kind === 'usage') { tokens = addTokens(tokens, e.tokens); input.meter.addUsage(e.tokens, e.model); }
          input.onEvent(e);
        }
      },
    });
    return { exitCode: r.exitCode, status: r.status === 'aborted' ? 'crashed' : r.status, tokens, costUsd: input.meter.costUsd, durationMs: r.durationMs, raw: null };
  },
};
```

Add `registerDriver(codexDriver)` to `src/core/drivers/index.ts`.

- [ ] **Step 4: Run tests, doctor, a two-agent race on scratch, commit**

Run: `bun test && bun run typecheck && bun run dev -- doctor`
Then in `scratch/`: `bun run /path/to/bakeoff/src/cli/index.ts run 1 --agents claude,codex --budget 1 --timeout 5m`
Expected: two PRs, two lanes, both `status: ok` in the run json, codex `costUsd` non-null (pricing table hit) or a doctor note naming the unknown model.

```bash
git add -A && git commit -m "feat(drivers): Codex driver with JSONL parser + fixture"
```

---

# Day 4: scorer, run record complete, terminal scoreboard

### Task 17: Check runner, test-path restore, baseline

**Files:**
- Create: `src/core/scorer/checks.ts`, `test/core/scorer/checks.test.ts`

**Interfaces:**
- Produces: `runCheck(cmd: string, cwd: string, timeoutMs?: number): Promise<{ green: boolean; output: string; exitCode: number | null }>` (runs via `sh -c`), `defaultTestPaths(worktree): string[]` (existing among `test`, `tests`, `__tests__`, `spec`, plus glob `**/*.{test,spec}.{ts,tsx,js,jsx,py,go}` matched with `Bun.Glob`), `restoreTestPaths(worktree, baseSha, paths, run?): Promise<string[]>` (returns restored paths; `git checkout <sha> -- <path>` per path, ignoring paths absent at base), `computeBaseline(o: { repoRoot; baseSha; config; runId }, run?): Promise<Baseline>` (temp worktree, run each configured command, remove).

- [ ] **Step 1: Write the failing test**

```ts
// test/core/scorer/checks.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { computeBaseline, defaultTestPaths, restoreTestPaths, runCheck } from '../../../src/core/scorer/checks';
import { makeRepo } from '../../helpers/repo';

describe('runCheck', () => {
  it('reports green/red with output', async () => {
    expect((await runCheck('echo hi && exit 0', '/tmp')).green).toBe(true);
    const r = await runCheck('echo nope >&2; exit 2', '/tmp');
    expect(r.green).toBe(false); expect(r.exitCode).toBe(2); expect(r.output).toContain('nope');
  });
});
describe('restoreTestPaths', () => {
  it('puts modified and deleted test files back to base', async () => {
    const repo = await makeRepo({ 'src/a.ts': 'x', 'test/a.test.ts': 'original', 'test/b.test.ts': 'b' });
    writeFileSync(join(repo.dir, 'test/a.test.ts'), 'tampered');
    rmSync(join(repo.dir, 'test/b.test.ts'));
    expect(defaultTestPaths(repo.dir)).toContain('test');
    const restored = await restoreTestPaths(repo.dir, repo.sha, ['test']);
    expect(restored).toEqual(['test']);
    expect(readFileSync(join(repo.dir, 'test/a.test.ts'), 'utf8')).toBe('original');
    expect(readFileSync(join(repo.dir, 'test/b.test.ts'), 'utf8')).toBe('b');
  });
});
describe('computeBaseline', () => {
  it('runs configured checks at base sha', async () => {
    const repo = await makeRepo({ 'a.txt': 'a' });
    const b = await computeBaseline({ repoRoot: repo.dir, baseSha: repo.sha, runId: 'base-test', config: { test: 'test -f a.txt', lint: 'exit 1' } });
    expect(b).toEqual({ testsGreen: true, lintGreen: false, typecheckGreen: null });
  });
});
```

- [ ] **Step 2: Run to verify failure, then write checks.ts**

```ts
// src/core/scorer/checks.ts
import { existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Baseline } from '@contract';
import { exec, type Exec } from '../exec';
import { runProcess } from '../process';
import { createWorktree, removeWorktree, worktreeDir } from '../worktree';

export interface CheckResult { green: boolean; output: string; exitCode: number | null }

export async function runCheck(cmd: string, cwd: string, timeoutMs = 10 * 60_000): Promise<CheckResult> {
  const lines: string[] = [];
  const r = await runProcess({ cmd: 'sh', args: ['-c', cmd], cwd, timeoutMs, onStdoutLine: (l) => lines.push(l), onStderrLine: (l) => lines.push(l) });
  return { green: r.status === 'ok', output: lines.slice(-200).join('\n'), exitCode: r.exitCode };
}

export function defaultTestPaths(worktree: string): string[] {
  const dirs = ['test', 'tests', '__tests__', 'spec'].filter((d) => existsSync(join(worktree, d)));
  const glob = new Bun.Glob('**/*.{test,spec}.{ts,tsx,js,jsx,mjs,py,go,rb}');
  const files = [...glob.scanSync({ cwd: worktree, dot: false })].filter((f) => !f.startsWith('node_modules/') && !dirs.some((d) => f.startsWith(`${d}/`)));
  return [...dirs, ...files];
}

export async function restoreTestPaths(worktree: string, baseSha: string, paths: string[], run: Exec = exec): Promise<string[]> {
  const restored: string[] = [];
  for (const p of paths) {
    const exists = await run('git', ['cat-file', '-e', `${baseSha}:${p}`], { cwd: worktree });
    if (exists.code !== 0) continue;
    const r = await run('git', ['checkout', baseSha, '--', p], { cwd: worktree });
    if (r.code === 0) restored.push(p);
  }
  return restored;
}

export async function computeBaseline(o: { repoRoot: string; baseSha: string; runId: string; config: { test?: string; lint?: string; typecheck?: string } }, run: Exec = exec): Promise<Baseline> {
  const dir = worktreeDir(o.runId, 'baseline');
  const branch = `bakeoff-baseline-${o.runId}`;
  await createWorktree({ repoRoot: o.repoRoot, baseSha: o.baseSha, branch, dir }, run);
  try {
    const go = async (cmd?: string) => (cmd ? (await runCheck(cmd, dir)).green : null);
    return { testsGreen: await go(o.config.test), lintGreen: await go(o.config.lint), typecheckGreen: await go(o.config.typecheck) };
  } finally {
    await removeWorktree({ repoRoot: o.repoRoot, dir, branch, deleteBranch: true }, run);
    rmSync(dir, { recursive: true, force: true });
  }
}
```

- [ ] **Step 3: Run tests, commit**

Run: `bun test && bun run typecheck` → pass.

```bash
git add -A && git commit -m "feat(scorer): check runner, test restore, baseline"
```

---

### Task 18: Test components (visible + hidden) and count parser

**Files:**
- Create: `src/core/scorer/tests.ts`, `test/core/scorer/tests.test.ts`

**Interfaces:**
- Produces: `parseTestCounts(output: string): { passed: number; total: number } | null` (vitest/jest "Tests  9 passed (9)", bun "9 pass / 0 fail", pytest "9 passed", go "ok" lines counted), `visibleTestsComponent(o: { worktree; baseSha; config; testPaths: string[]; hiddenConfigured: boolean; baselineGreen: boolean | null }): Promise<ScoreComponent>`, `hiddenTestsComponent(o: { worktree; hiddenDir; hidden: NonNullable<Config['hidden_tests']> }): Promise<ScoreComponent>` (copies `hiddenDir/**` into `worktree/dest`, runs command; n/a + detail "no hidden tests found" if `hiddenDir` empty).

- [ ] **Step 1: Write the failing test**

```ts
// test/core/scorer/tests.test.ts
import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hiddenTestsComponent, parseTestCounts, visibleTestsComponent } from '../../../src/core/scorer/tests';
import { makeRepo } from '../../helpers/repo';

describe('parseTestCounts', () => {
  it('reads common runners', () => {
    expect(parseTestCounts('Tests  9 passed (9)')).toEqual({ passed: 9, total: 9 });
    expect(parseTestCounts('Tests  2 failed | 7 passed (9)')).toEqual({ passed: 7, total: 9 });
    expect(parseTestCounts(' 9 pass\n 0 fail')).toEqual({ passed: 9, total: 9 });
    expect(parseTestCounts('===== 8 passed, 1 failed in 0.3s =====')).toEqual({ passed: 8, total: 9 });
    expect(parseTestCounts('no idea')).toBeNull();
  });
});
describe('visibleTestsComponent', () => {
  it('awards full points on green after restoring tests, 30 when hidden configured', async () => {
    const repo = await makeRepo({ 'test/a.sh': 'exit 0' });
    writeFileSync(join(repo.dir, 'test/a.sh'), 'exit 1'); // agent "tampered"; restore must undo it
    const c = await visibleTestsComponent({ worktree: repo.dir, baseSha: repo.sha, config: { test: 'sh test/a.sh' }, testPaths: ['test'], hiddenConfigured: true, baselineGreen: true });
    expect(c).toMatchObject({ id: 'visible_tests', max: 30, awarded: 30 });
  });
  it('awards 0 on red and notes a red baseline', async () => {
    const repo = await makeRepo({ 'x': '' });
    const c = await visibleTestsComponent({ worktree: repo.dir, baseSha: repo.sha, config: { test: 'exit 1' }, testPaths: [], hiddenConfigured: false, baselineGreen: false });
    expect(c).toMatchObject({ id: 'visible_tests', max: 50, awarded: 0 });
    expect(c.detail).toContain('baseline red');
  });
});
describe('hiddenTestsComponent', () => {
  it('copies hidden tests in and runs them', async () => {
    const repo = await makeRepo({ 'x': '' });
    const hiddenDir = join(repo.dir, '.bakeoff', 'hidden');
    mkdirSync(hiddenDir, { recursive: true });
    writeFileSync(join(hiddenDir, 'h.sh'), 'test -f ../../x');
    const c = await hiddenTestsComponent({ worktree: repo.dir, hiddenDir, hidden: { source: '.bakeoff/hidden', dest: 'tests/hidden', command: 'sh tests/hidden/h.sh' } });
    expect(c).toMatchObject({ id: 'hidden_tests', max: 20, awarded: 20 });
  });
  it('is n/a when the hidden dir is empty', async () => {
    const repo = await makeRepo({ 'x': '' });
    const c = await hiddenTestsComponent({ worktree: repo.dir, hiddenDir: join(repo.dir, 'nope'), hidden: { source: 's', dest: 'd', command: 'true' } });
    expect(c.awarded).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify failure, then write tests.ts**

```ts
// src/core/scorer/tests.ts
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoreComponent } from '@contract';
import { restoreTestPaths, runCheck } from './checks';

export function parseTestCounts(out: string): { passed: number; total: number } | null {
  let m = /Tests\s+(?:(\d+) failed \|\s*)?(\d+) passed \((\d+)\)/.exec(out);          // vitest / jest
  if (m) return { passed: Number(m[2]), total: Number(m[3]) };
  m = /(\d+) pass\s*\n\s*(\d+) fail/.exec(out);                                         // bun test
  if (m) return { passed: Number(m[1]), total: Number(m[1]) + Number(m[2]) };
  m = /=+ (?:(\d+) passed)?(?:, )?(?:(\d+) failed)?.* in [\d.]+s =+/.exec(out);         // pytest
  if (m && (m[1] || m[2])) return { passed: Number(m[1] ?? 0), total: Number(m[1] ?? 0) + Number(m[2] ?? 0) };
  return null;
}

export async function visibleTestsComponent(o: { worktree: string; baseSha: string; config: { test?: string }; testPaths: string[]; hiddenConfigured: boolean; baselineGreen: boolean | null }): Promise<ScoreComponent> {
  const max = o.hiddenConfigured ? 30 : 50;
  if (!o.config.test) return { id: 'visible_tests', max, awarded: null, detail: 'n/a' };
  await restoreTestPaths(o.worktree, o.baseSha, o.testPaths);
  const r = await runCheck(o.config.test, o.worktree);
  const counts = parseTestCounts(r.output);
  const parts = [counts ? `${counts.passed}/${counts.total} passed` : r.green ? 'green' : `exit ${r.exitCode}`];
  if (o.baselineGreen === false) parts.push('baseline red');
  return { id: 'visible_tests', max, awarded: r.green ? max : 0, detail: parts.join(', ') };
}

export async function hiddenTestsComponent(o: { worktree: string; hiddenDir: string; hidden: { dest: string; command: string } }): Promise<ScoreComponent> {
  const max = 20;
  if (!existsSync(o.hiddenDir) || readdirSync(o.hiddenDir).length === 0) return { id: 'hidden_tests', max, awarded: null, detail: 'no hidden tests found' };
  const dest = join(o.worktree, o.hidden.dest);
  mkdirSync(dest, { recursive: true });
  cpSync(o.hiddenDir, dest, { recursive: true });
  const r = await runCheck(o.hidden.command, o.worktree);
  const counts = parseTestCounts(r.output);
  return { id: 'hidden_tests', max, awarded: r.green ? max : 0, detail: counts ? `${counts.passed}/${counts.total} passed` : r.green ? 'green' : `exit ${r.exitCode}` };
}
```

- [ ] **Step 3: Run tests, commit**

```bash
bun test && bun run typecheck && git add -A && git commit -m "feat(scorer): visible and hidden test components"
```

---

### Task 19: Typecheck and lint components

**Files:**
- Create: `src/core/scorer/lint.ts`, `test/core/scorer/lint.test.ts`

**Interfaces:**
- Produces: `checkComponents(o: { worktree; config: { lint?: string; typecheck?: string } }): Promise<[ScoreComponent, ScoreComponent]>` returning `typecheck` then `lint`. Max split: both configured 7.5/7.5; one configured 15/0; none 7.5/7.5 both n/a.

- [ ] **Step 1: Write the failing test**

```ts
// test/core/scorer/lint.test.ts
import { describe, expect, it } from 'vitest';
import { checkComponents } from '../../../src/core/scorer/lint';

describe('checkComponents', () => {
  it('splits 7.5/7.5 when both configured', async () => {
    const [tc, lint] = await checkComponents({ worktree: '/tmp', config: { typecheck: 'true', lint: 'false' } });
    expect(tc).toMatchObject({ id: 'typecheck', max: 7.5, awarded: 7.5 });
    expect(lint).toMatchObject({ id: 'lint', max: 7.5, awarded: 0 });
  });
  it('gives the configured one 15 and the other max 0 n/a', async () => {
    const [tc, lint] = await checkComponents({ worktree: '/tmp', config: { typecheck: 'true' } });
    expect(tc).toMatchObject({ max: 15, awarded: 15 });
    expect(lint).toMatchObject({ max: 0, awarded: null });
  });
  it('is n/a for both when neither configured', async () => {
    const [tc, lint] = await checkComponents({ worktree: '/tmp', config: {} });
    expect(tc).toMatchObject({ max: 7.5, awarded: null });
    expect(lint).toMatchObject({ max: 7.5, awarded: null });
  });
});
```

- [ ] **Step 2: Run to verify failure, then write lint.ts**

```ts
// src/core/scorer/lint.ts
import type { ScoreComponent } from '@contract';
import { runCheck } from './checks';

export async function checkComponents(o: { worktree: string; config: { lint?: string; typecheck?: string } }): Promise<[ScoreComponent, ScoreComponent]> {
  const both = !!o.config.typecheck && !!o.config.lint;
  const none = !o.config.typecheck && !o.config.lint;
  const maxFor = (mine?: string) => (none || both ? 7.5 : mine ? 15 : 0);
  const one = async (id: 'typecheck' | 'lint', cmd?: string): Promise<ScoreComponent> => {
    const max = maxFor(cmd);
    if (!cmd) return { id, max, awarded: null, detail: 'n/a' };
    const r = await runCheck(cmd, o.worktree);
    return { id, max, awarded: r.green ? max : 0, detail: r.green ? 'clean' : `exit ${r.exitCode}` };
  };
  return [await one('typecheck', o.config.typecheck), await one('lint', o.config.lint)];
}
```

- [ ] **Step 3: Run tests, commit**

```bash
bun test && bun run typecheck && git add -A && git commit -m "feat(scorer): typecheck and lint components"
```

---

### Task 20: Diff stats and diff discipline

**Files:**
- Create: `src/core/scorer/diff.ts`, `test/core/scorer/diff.test.ts`

**Interfaces:**
- Produces: `diffStats(worktree, baseSha, run?): Promise<{ files: string[]; added: number; removed: number }>` (from `git diff --numstat <baseSha>` plus `git ls-files --others --exclude-standard` counted as added lines), `diffDiscipline(finishers: { driver: DriverId; files: string[]; lines: number }[]): Map<DriverId, ScoreComponent>`.

- [ ] **Step 1: Write the failing test**

```ts
// test/core/scorer/diff.test.ts
import { describe, expect, it } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { diffDiscipline, diffStats } from '../../../src/core/scorer/diff';
import { makeRepo } from '../../helpers/repo';

describe('diffStats', () => {
  it('counts committed, uncommitted and untracked changes vs base', async () => {
    const repo = await makeRepo({ 'a.ts': 'one\ntwo\n', 'b.ts': 'x\n' });
    await repo.commit({ 'a.ts': 'one\ntwo\nthree\n' }, 'add line');
    rmSync(join(repo.dir, 'b.ts'));
    writeFileSync(join(repo.dir, 'c.ts'), 'new\nfile\n');
    const s = await diffStats(repo.dir, repo.sha);
    expect(s.files.sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(s.added).toBe(3); expect(s.removed).toBe(1);
  });
});
describe('diffDiscipline', () => {
  it('matches the fixture numbers', () => {
    const m = diffDiscipline([
      { driver: 'claude', files: ['src/paginate.ts', 'test/paginate.test.ts'], lines: 22 },
      { driver: 'codex', files: ['src/paginate.ts', 'test/paginate.test.ts', 'vitest.config.ts'], lines: 20 },
    ]);
    expect(m.get('claude')!.awarded).toBe(9.7);
    expect(m.get('codex')!.awarded).toBe(8.7);
    expect(m.get('claude')!.detail).toBe('22 lines, 2 files, 2 in consensus');
  });
  it('gives 0 for zero lines or zero files, 10 for a lone finisher', () => {
    expect(diffDiscipline([{ driver: 'claude', files: [], lines: 0 }]).get('claude')!.awarded).toBe(0);
    expect(diffDiscipline([{ driver: 'claude', files: ['a'], lines: 3 }]).get('claude')!.awarded).toBe(10);
    const m = diffDiscipline([{ driver: 'claude', files: ['a'], lines: 3 }, { driver: 'codex', files: [], lines: 0 }]);
    expect(m.get('codex')!.awarded).toBe(0);
  });
  it('penalizes sprawl', () => {
    const m = diffDiscipline([
      { driver: 'claude', files: ['a'], lines: 10 },
      { driver: 'codex', files: ['a', 'b', 'c', 'd'], lines: 200 },
      { driver: 'opencode', files: ['a'], lines: 12 },
    ]);
    expect(m.get('codex')!.awarded).toBeLessThan(m.get('claude')!.awarded!);
  });
});
```

- [ ] **Step 2: Run to verify failure, then write diff.ts**

```ts
// src/core/scorer/diff.ts
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DriverId, ScoreComponent } from '@contract';
import { exec, must, type Exec } from '../exec';

export interface DiffStats { files: string[]; added: number; removed: number }

export async function diffStats(worktree: string, baseSha: string, run: Exec = exec): Promise<DiffStats> {
  const files = new Set<string>();
  let added = 0, removed = 0;
  const numstat = await must('git', ['diff', '--numstat', baseSha], { cwd: worktree }, run);
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [a, r, f] = line.split('\t');
    if (!f) continue;
    files.add(f); added += a === '-' ? 0 : Number(a); removed += r === '-' ? 0 : Number(r);
  }
  const untracked = await must('git', ['ls-files', '--others', '--exclude-standard'], { cwd: worktree }, run);
  for (const f of untracked.split('\n').filter(Boolean)) {
    files.add(f);
    try { added += readFileSync(join(worktree, f), 'utf8').split('\n').filter((l) => l.length > 0).length; } catch { /* binary or gone */ }
  }
  return { files: [...files], added, removed };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2; };

export function diffDiscipline(finishers: { driver: DriverId; files: string[]; lines: number }[]): Map<DriverId, ScoreComponent> {
  const out = new Map<DriverId, ScoreComponent>();
  const real = finishers.filter((f) => f.lines > 0 && f.files.length > 0);
  const med = real.length ? median(real.map((f) => f.lines)) : 0;
  const threshold = real.length >= 2 ? Math.max(2, Math.ceil(real.length / 2)) : 1;
  const counts = new Map<string, number>();
  for (const f of real) for (const file of new Set(f.files)) counts.set(file, (counts.get(file) ?? 0) + 1);
  const consensus = new Set([...counts].filter(([, n]) => n >= threshold).map(([f]) => f));
  for (const f of finishers) {
    if (f.lines === 0 || f.files.length === 0) { out.set(f.driver, { id: 'diff', max: 10, awarded: 0, detail: 'no changes' }); continue; }
    const inConsensus = f.files.filter((x) => consensus.has(x)).length;
    const size = 6 * Math.min(1, med / f.lines);
    const scope = real.length === 1 ? 4 : 4 * (inConsensus / f.files.length);
    out.set(f.driver, { id: 'diff', max: 10, awarded: round1(size + scope), detail: `${f.lines} lines, ${f.files.length} files, ${real.length === 1 ? f.files.length : inConsensus} in consensus` });
  }
  return out;
}
```

- [ ] **Step 3: Run tests, commit**

```bash
bun test && bun run typecheck && git add -A && git commit -m "feat(scorer): diff stats and diff discipline with zero guard"
```

---

### Task 21: Tamper detector

**Files:**
- Create: `src/core/scorer/tamper.ts`, `test/core/scorer/tamper.test.ts`

**Interfaces:**
- Produces: `tamperFlags(o: { worktree; baseSha; testPaths: string[]; hiddenDest: string | null }, run?): Promise<TamperFlag[]>`, `isTestFile(path, testPaths): boolean`, `isProtectedConfig(path): boolean`, `countAsserts(text): number`, `SKIP_PATTERNS: RegExp[]`.

- [ ] **Step 1: Write the failing test**

```ts
// test/core/scorer/tamper.test.ts
import { describe, expect, it } from 'vitest';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { countAsserts, isProtectedConfig, tamperFlags } from '../../../src/core/scorer/tamper';
import { makeRepo } from '../../helpers/repo';

const base = { 'src/a.ts': 'export const a = 1;\n', 'test/a.test.ts': "import { expect, it } from 'vitest';\nit('a', () => { expect(1).toBe(1); expect(2).toBe(2); });\n" };

describe('tamperFlags', () => {
  it('is empty for an honest change', async () => {
    const repo = await makeRepo(base);
    writeFileSync(join(repo.dir, 'src/a.ts'), 'export const a = 2;\n');
    expect(await tamperFlags({ worktree: repo.dir, baseSha: repo.sha, testPaths: ['test'], hiddenDest: null })).toEqual([]);
  });
  it('flags a deleted test', async () => {
    const repo = await makeRepo(base);
    rmSync(join(repo.dir, 'test/a.test.ts'));
    const f = await tamperFlags({ worktree: repo.dir, baseSha: repo.sha, testPaths: ['test'], hiddenDest: null });
    expect(f.map((x) => x.rule)).toContain('test_deleted');
  });
  it('flags .skip and weakened asserts', async () => {
    const repo = await makeRepo(base);
    writeFileSync(join(repo.dir, 'test/a.test.ts'), "import { expect, it } from 'vitest';\nit.skip('a', () => { expect(1).toBe(1); });\n");
    const rules = (await tamperFlags({ worktree: repo.dir, baseSha: repo.sha, testPaths: ['test'], hiddenDest: null })).map((x) => x.rule);
    expect(rules).toContain('test_skipped');
    expect(rules).toContain('asserts_weakened');
  });
  it('flags config writes and hidden-path writes', async () => {
    const repo = await makeRepo(base);
    writeFileSync(join(repo.dir, 'vitest.config.ts'), 'export default {}');
    mkdirSync(join(repo.dir, 'tests/hidden'), { recursive: true });
    writeFileSync(join(repo.dir, 'tests/hidden/x.test.ts'), '');
    const rules = (await tamperFlags({ worktree: repo.dir, baseSha: repo.sha, testPaths: ['test'], hiddenDest: 'tests/hidden' })).map((x) => x.rule);
    expect(rules).toContain('config_write');
    expect(rules).toContain('hidden_path_write');
  });
});
describe('helpers', () => {
  it('recognizes protected config', () => {
    for (const f of ['conftest.py', 'pytest.ini', 'pyproject.toml', 'vitest.config.mts', 'jest.config.js', '.github/workflows/ci.yml', 'bakeoff.yml', 'tsconfig.json', 'eslint.config.js', 'biome.json', 'bunfig.toml']) expect(isProtectedConfig(f)).toBe(true);
    expect(isProtectedConfig('src/app.ts')).toBe(false);
  });
  it('counts asserts', () => {
    expect(countAsserts('expect(1).toBe(1); assert x == 1\nassert(y)\nt.Error("x")\nrequire.Equal(a,b)')).toBe(5);
  });
});
```

- [ ] **Step 2: Run to verify failure, then write tamper.ts**

```ts
// src/core/scorer/tamper.ts
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TamperFlag } from '@contract';
import { exec, must, type Exec } from '../exec';
import { NAMES } from '../names';

export const SKIP_PATTERNS: RegExp[] = [
  /\.(skip|only)\s*\(/, /\bx(it|describe|test)\s*\(/, /@pytest\.mark\.skip/, /pytest\.skip\s*\(/, /@Ignore\b/, /@Disabled\b/, /\bt\.Skip\s*\(/, /unittest\.skip/,
];
const PROTECTED: RegExp[] = [
  /(^|\/)conftest\.py$/, /(^|\/)pytest\.ini$/, /(^|\/)setup\.cfg$/, /(^|\/)pyproject\.toml$/, /(^|\/)tox\.ini$/,
  /(^|\/)vitest\.config\.[cm]?[jt]s$/, /(^|\/)jest\.config\.[cm]?[jt]s$/, /(^|\/)bunfig\.toml$/,
  /^\.github\/workflows\//, /(^|\/)tsconfig[^/]*\.json$/, /(^|\/)\.eslintrc/, /(^|\/)eslint\.config\.[cm]?[jt]s$/, /(^|\/)biome\.jsonc?$/,
];
const ASSERT_TOKENS = /expect\s*\(|\bassert\s|\bassert\s*\(|\bassert\.|\bshould\.|\bt\.Error|\bt\.Fatal|\brequire\./g;

export function isProtectedConfig(path: string): boolean {
  return path === NAMES.configFile || PROTECTED.some((re) => re.test(path));
}
export function isTestFile(path: string, testPaths: string[]): boolean {
  if (testPaths.some((p) => path === p || path.startsWith(`${p.replace(/\/$/, '')}/`))) return true;
  return /\.(test|spec)\.[cm]?[jt]sx?$|_test\.(go|py)$|^test_.*\.py$|\/test_[^/]*\.py$/.test(path);
}
export function countAsserts(text: string): number {
  return (text.match(ASSERT_TOKENS) ?? []).length;
}

export async function tamperFlags(o: { worktree: string; baseSha: string; testPaths: string[]; hiddenDest: string | null }, run: Exec = exec): Promise<TamperFlag[]> {
  const flags: TamperFlag[] = [];
  const status = await must('git', ['diff', '--name-status', o.baseSha], { cwd: o.worktree }, run);
  const untracked = (await must('git', ['ls-files', '--others', '--exclude-standard'], { cwd: o.worktree }, run)).split('\n').filter(Boolean);
  const changed: { st: string; path: string }[] = status.split('\n').filter(Boolean).map((l) => { const [st, ...rest] = l.split('\t'); return { st: st![0]!, path: rest[rest.length - 1]! }; });
  for (const f of untracked) changed.push({ st: 'A', path: f });

  for (const { st, path } of changed) {
    if (isProtectedConfig(path)) flags.push({ rule: 'config_write', file: path, detail: 'test/CI configuration modified' });
    if (o.hiddenDest && path.startsWith(`${o.hiddenDest.replace(/\/$/, '')}/`)) flags.push({ rule: 'hidden_path_write', file: path, detail: 'wrote into hidden test destination' });
    if (path === 'package.json' && st === 'M') {
      const before = JSON.parse(await must('git', ['show', `${o.baseSha}:package.json`], { cwd: o.worktree }, run)) as { scripts?: Record<string, string> };
      const after = JSON.parse(readFileSync(join(o.worktree, 'package.json'), 'utf8')) as { scripts?: Record<string, string> };
      for (const k of ['test', 'lint', 'typecheck']) if ((before.scripts?.[k] ?? '') !== (after.scripts?.[k] ?? '')) flags.push({ rule: 'config_write', file: 'package.json', detail: `scripts.${k} changed` });
    }
    if (!isTestFile(path, o.testPaths)) continue;
    if (st === 'D' || st === 'R') { flags.push({ rule: 'test_deleted', file: path, detail: st === 'D' ? 'test file deleted' : 'test file renamed away' }); continue; }
    const after = existsSync(join(o.worktree, path)) ? readFileSync(join(o.worktree, path), 'utf8') : '';
    const beforeRes = await run('git', ['show', `${o.baseSha}:${path}`], { cwd: o.worktree });
    const before = beforeRes.code === 0 ? beforeRes.stdout : '';
    const addedLines = after.split('\n').filter((l) => !before.includes(l));
    for (const l of addedLines) { const hit = SKIP_PATTERNS.find((re) => re.test(l)); if (hit) { flags.push({ rule: 'test_skipped', file: path, detail: l.trim().slice(0, 80) }); break; } }
    if (before && countAsserts(after) < countAsserts(before)) flags.push({ rule: 'asserts_weakened', file: path, detail: `${countAsserts(before)} -> ${countAsserts(after)} assertions` });
  }
  return flags;
}
```

- [ ] **Step 3: Run tests, commit**

```bash
bun test && bun run typecheck && git add -A && git commit -m "feat(scorer): tamper detector"
```

---

### Task 22: Compose scores, finalize ranks, wire into the race

**Files:**
- Create: `src/core/scorer/index.ts`, `test/core/scorer/index.test.ts`
- Modify: `src/core/race.ts` (`defaultDeps` gets `baseline: computeBaseline`-backed function, `scoreAgent`, `finalize`)

**Interfaces:**
- Produces: `scoreAgent(ctx: ScoreCtx): Promise<Pick<AgentResult,'score'|'filesTouched'|'linesAdded'|'linesRemoved'>>` (runs tests, hidden, checks, tamper; leaves `diff`, `ci`, `judge` as placeholders with `awarded: null` to be filled by finalize / later tasks), `finalizeScores(agents: AgentResult[], configured: Configured): AgentResult[]` (fills `diff`, recomputes totals + `maxPossible`, ranks), `totalOf(components, tamperPenalty): number`, `maxPossibleOf(components): number`, `rankAgents(agents): AgentResult[]`.

- [ ] **Step 1: Write the failing test**

```ts
// test/core/scorer/index.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { finalizeScores, rankAgents, scoreAgent } from '../../../src/core/scorer/index';
import { RunRecordSchema, type AgentResult } from '../../../src/contract/schema';
import { makeRepo } from '../../helpers/repo';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const fixture = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

describe('finalizeScores', () => {
  it('reproduces the fixture totals, ranks and winner order', () => {
    const stripped = fixture.agents.map((a) => a.score ? { ...a, rank: null, score: { ...a.score, total: 0, maxPossible: 0, components: a.score.components.map((c) => c.id === 'diff' ? { ...c, awarded: null, detail: '' } : c) } } : a);
    const out = finalizeScores(stripped, fixture.configured);
    expect(out).toEqual(fixture.agents);
  });
  it('tiebreaks on cost then duration; nulls last', () => {
    const mk = (driver: AgentResult['driver'], total: number, cost: number | null, dur: number): AgentResult => ({ ...fixture.agents[0]!, driver, costUsd: cost, durationMs: dur, score: { ...fixture.agents[0]!.score!, total } });
    const r = rankAgents([mk('claude', 50, null, 1), mk('codex', 50, 2, 9), mk('opencode', 50, 2, 3)]);
    expect(r.map((a) => [a.driver, a.rank])).toEqual([['opencode', 1], ['codex', 2], ['claude', 3]]);
  });
});
describe('scoreAgent', () => {
  it('scores a green worktree with a tamper flag', async () => {
    const repo = await makeRepo({ 'test/a.sh': 'exit 0', 'src/x.ts': '1' });
    writeFileSync(join(repo.dir, 'src/x.ts'), '2');
    writeFileSync(join(repo.dir, 'vitest.config.ts'), '');
    const agent = { ...fixture.agents[0]!, score: null };
    const s = await scoreAgent({ worktree: repo.dir, repoRoot: repo.dir, baseSha: repo.sha, config: { test: 'sh test/a.sh', typecheck: 'true', agents: ['claude'], budget_usd: 1, timeout: '1m', ci_timeout: '0s', judge: { enabled: false, model: '' } }, agent, hiddenDir: join(repo.dir, '.bakeoff/hidden'), repo: fixture.repo });
    expect(s.filesTouched.sort()).toEqual(['src/x.ts', 'vitest.config.ts']);
    expect(s.score!.tamperFlags[0]!.rule).toBe('config_write');
    expect(s.score!.tamperPenalty).toBe(-25);
    expect(s.score!.components.find((c) => c.id === 'visible_tests')!.awarded).toBe(50);
    expect(s.score!.components.find((c) => c.id === 'typecheck')!.awarded).toBe(15);
  });
});
```

- [ ] **Step 2: Run to verify failure, then write scorer/index.ts**

```ts
// src/core/scorer/index.ts
import type { AgentResult, Configured, ScoreBreakdown, ScoreComponent } from '@contract';
import type { Config } from '../config';
import type { ScoreCtx } from '../race';
import { defaultTestPaths } from './checks';
import { diffDiscipline, diffStats } from './diff';
import { checkComponents } from './lint';
import { tamperFlags } from './tamper';
import { hiddenTestsComponent, visibleTestsComponent } from './tests';

export const TAMPER_PENALTY = -25;
const round1 = (n: number) => Math.round(n * 10) / 10;

export function maxPossibleOf(components: ScoreComponent[]): number {
  return round1(components.filter((c) => c.awarded !== null).reduce((s, c) => s + c.max, 0));
}
export function totalOf(components: ScoreComponent[], tamperPenalty: number): number {
  return round1(components.reduce((s, c) => s + (c.awarded ?? 0), 0) + tamperPenalty);
}
export function rankAgents(agents: AgentResult[]): AgentResult[] {
  const ok = agents.filter((a) => a.status === 'ok' && a.score);
  const sorted = [...ok].sort((x, y) =>
    (y.score!.total - x.score!.total) ||
    ((x.costUsd ?? Infinity) - (y.costUsd ?? Infinity)) ||
    (x.durationMs - y.durationMs));
  const rank = new Map(sorted.map((a, i) => [a.driver, i + 1]));
  return agents.map((a) => ({ ...a, rank: rank.get(a.driver) ?? null }));
}

export async function scoreAgent(ctx: ScoreCtx, baselineGreen: boolean | null = null): Promise<Pick<AgentResult, 'score' | 'filesTouched' | 'linesAdded' | 'linesRemoved'>> {
  const cfg: Config = ctx.config;
  const testPaths = cfg.test_paths ?? defaultTestPaths(ctx.worktree);
  const stats = await diffStats(ctx.worktree, ctx.baseSha);
  const flags = await tamperFlags({ worktree: ctx.worktree, baseSha: ctx.baseSha, testPaths, hiddenDest: cfg.hidden_tests?.dest ?? null });
  const visible = await visibleTestsComponent({ worktree: ctx.worktree, baseSha: ctx.baseSha, config: cfg, testPaths, hiddenConfigured: !!cfg.hidden_tests, baselineGreen });
  const hidden: ScoreComponent = cfg.hidden_tests
    ? await hiddenTestsComponent({ worktree: ctx.worktree, hiddenDir: ctx.hiddenDir, hidden: cfg.hidden_tests })
    : { id: 'hidden_tests', max: 20, awarded: null, detail: 'n/a' };
  const [typecheck, lint] = await checkComponents({ worktree: ctx.worktree, config: cfg });
  const components: ScoreComponent[] = [
    visible, hidden, typecheck, lint,
    { id: 'ci', max: 10, awarded: null, detail: 'n/a' },
    { id: 'diff', max: 10, awarded: null, detail: '' },
    { id: 'judge', max: 15, awarded: null, detail: 'n/a' },
  ];
  const tamperPenalty = flags.length ? TAMPER_PENALTY : 0;
  const score: ScoreBreakdown = { components, tamperFlags: flags, tamperPenalty, total: totalOf(components, tamperPenalty), maxPossible: maxPossibleOf(components) };
  return { score, filesTouched: stats.files, linesAdded: stats.added, linesRemoved: stats.removed };
}

export function finalizeScores(agents: AgentResult[], _configured: Configured): AgentResult[] {
  const finishers = agents.filter((a) => a.status === 'ok' && a.score);
  const diff = diffDiscipline(finishers.map((a) => ({ driver: a.driver, files: a.filesTouched, lines: a.linesAdded + a.linesRemoved })));
  const withDiff = agents.map((a) => {
    if (!a.score) return a;
    const d = diff.get(a.driver);
    const components = a.score.components.map((c) => (c.id === 'diff' && d ? d : c));
    // diff always counts toward maxPossible once there is at least one finisher
    const maxPossible = round1(maxPossibleOf(components) + (components.find((c) => c.id === 'diff')?.awarded === null ? 10 : 0));
    return { ...a, score: { ...a.score, components, total: totalOf(components, a.score.tamperPenalty), maxPossible } };
  });
  return rankAgents(withDiff);
}
```

- [ ] **Step 3: Wire into race.ts**

In `src/core/race.ts`, change `defaultDeps()`:

```ts
import { computeBaseline } from './scorer/checks';
import { finalizeScores, scoreAgent } from './scorer/index';
// ...
export function defaultDeps(): RaceDeps {
  return { getDriver: registryGet, exec: realExec, now: () => new Date(), meterFor: defaultMeter,
    baseline: (i) => computeBaseline({ repoRoot: i.repoRoot, baseSha: i.repo.baseSha, runId: i.runId, config: i.config }),
    scoreAgent: (ctx) => scoreAgent(ctx, ctx.baselineGreen), finalize: finalizeScores };
}
```

Add `baselineGreen: boolean | null` to `ScoreCtx` and pass `baseline.testsGreen` where `runOne` builds the ctx. In `runCommand`, after the race, print a yellow warning when `rec.baseline.testsGreen === false`: `p.log.warn(\`Tests were already failing on ${rec.repo.baseSha.slice(0, 7)}; visible-test points are unreliable for this run.\`)`.

- [ ] **Step 4: Run tests, commit**

```bash
bun test && bun run typecheck && git add -A && git commit -m "feat(scorer): compose components, finalize ranks, wire baseline"
```

---

### Task 23: Terminal scoreboard

**Files:**
- Create: `src/cli/render/table.ts`, `test/cli/table.test.ts`
- Modify: `src/cli/commands/run.ts` (print the table instead of per-agent lines)

**Interfaces:**
- Consumes: `style.ts` from Task 15.
- Produces: `renderScoreboard(rec: RunRecord, opts?: { htmlPath?: string; opened?: boolean; ladder?: Ladder }): string` laid out per `design/TERMINAL.md` "Final table" (rank, name, total, cost, `m:ss`, tests, `+a -r`, files, `PR #n`, tamper flag in soft red; rank 1 in the winner's color; `Scoreboard` and `Ladder` footer lines when given), `flagLabel(f: TamperFlag): string` (`skipped test: export.test.ts`, `deleted test: …`, `weakened asserts: …`, `edited config: …`, `wrote hidden path: …`). Tests run with `NO_COLOR=1` so output is plain.

- [ ] **Step 1: Write the failing test**

```ts
// test/cli/table.test.ts
import { beforeAll, describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { flagLabel, renderScoreboard } from '../../src/cli/render/table';
import { RunRecordSchema } from '../../src/contract/schema';

const rec = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));
beforeAll(() => { process.env.NO_COLOR = '1'; });

describe('table', () => {
  it('labels tamper flags', () => {
    expect(flagLabel({ rule: 'test_skipped', file: 'export.test.ts', detail: '' })).toBe('skipped test: export.test.ts');
    expect(flagLabel({ rule: 'config_write', file: 'vitest.config.ts', detail: '' })).toBe('edited config: vitest.config.ts');
  });
  it('renders the final table per design/TERMINAL.md', () => {
    const out = renderScoreboard(rec, { htmlPath: '.bakeoff/runs/20260902-k7q2.html', opened: true });
    const lines = out.split('\n');
    expect(lines[0]).toBe('');
    expect(lines[2]).toBe('  bakeoff  bakeoff-dev/scratch #7  Fix off-by-one in paginate()');
    expect(out).toMatch(/^ {3}1 {2}Claude Code {4}74\.7 {3}\$1\.42 {3}6:52 {3}9\/9 {5}\+18 -4 {4}2 files {3}PR #12$/m);
    expect(out).toMatch(/^ {3}2 {2}Codex {10}48\.7 {3}\$0\.97 {3}6:28 {3}9\/9 {5}\+11 -9 {4}3 files {3}PR #13 {3}edited config: vitest\.config\.ts$/m);
    expect(out).toMatch(/^ {3}3 {2}OpenCode {8}0 {3}n\/a {5}20:00 {2}timed out$/m);
    expect(out).toContain('  Scoreboard  .bakeoff/runs/20260902-k7q2.html  (opened)');
    expect(out).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
  });
  it('adds the ladder line when given', () => {
    const out = renderScoreboard(rec, { ladder: { schemaVersion: 1, entries: { claude: { driver: 'claude', mu: 0, sigma: 0, rating: 1240, races: 1, wins: 1, avgCostUsd: 1, avgDurationMs: 1, history: [] } } } });
    expect(out).toContain('  Ladder      Claude Code 1240');
  });
});
```

- [ ] **Step 2: Run to verify failure, then write table.ts**

```ts
// src/cli/render/table.ts
import type { Ladder, LadderEntry, RunRecord, TamperFlag } from '@contract';
import { DRIVER_HEX, DRIVER_NAME, SOFT_RED, STATUS_WORD, fmtClock, fmtCost, paint } from './style';

const FLAG_WORD: Record<TamperFlag['rule'], string> = { test_skipped: 'skipped test', test_deleted: 'deleted test', asserts_weakened: 'weakened asserts', config_write: 'edited config', hidden_path_write: 'wrote hidden path' };
export const flagLabel = (f: TamperFlag) => `${FLAG_WORD[f.rule]}: ${f.file}`;

type Cell = { text: string; align?: 'right' };
const pad = (c: Cell, w: number) => (c.align === 'right' ? c.text.padStart(w) : c.text.padEnd(w));

export function renderScoreboard(rec: RunRecord, opts: { htmlPath?: string; opened?: boolean; ladder?: Ladder } = {}): string {
  const ordered = [...rec.agents].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const rows: Cell[][] = ordered.map((a, i) => {
    const rank = a.rank ?? i + 1;
    const cells: Cell[] = [{ text: String(rank), align: 'right' }, { text: DRIVER_NAME[a.driver] }, { text: a.score ? String(a.score.total) : '0', align: 'right' }, { text: fmtCost(a.costUsd) }, { text: fmtClock(a.durationMs) }];
    if (a.status === 'ok' && a.score) {
      const tests = a.score.components.find((c) => c.id === 'visible_tests')?.detail.split(',')[0]?.replace(' passed', '') ?? '';
      cells.push({ text: tests }, { text: `+${a.linesAdded} -${a.linesRemoved}` }, { text: `${a.filesTouched.length} file${a.filesTouched.length === 1 ? '' : 's'}` }, { text: a.prNumber ? `PR #${a.prNumber}` : '' });
      const flag = a.score.tamperFlags[0];
      if (flag) cells.push({ text: paint(SOFT_RED, flagLabel(flag)) });
    } else cells.push({ text: STATUS_WORD[a.status] });
    return cells;
  });
  const widths: number[] = [];
  for (const r of rows) r.forEach((c, i) => { widths[i] = Math.max(widths[i] ?? 0, c.text.replace(/\x1b\[[0-9;]*m/g, '').length); });
  const winner = rec.winner;
  const body = rows.map((r, i) => {
    const line = '   ' + r.map((c, j) => pad(c, widths[j]!)).join('  ').trimEnd();
    return ordered[i]!.driver === winner && ordered[i]!.rank === 1 ? paint(DRIVER_HEX[winner], line) : line;
  });
  const out = ['', '', `  bakeoff  ${rec.repo.owner}/${rec.repo.name} #${rec.issue.number}  ${rec.issue.title}`, '', ...body, ''];
  if (opts.htmlPath) out.push(`  Scoreboard  ${opts.htmlPath}${opts.opened ? '  (opened)' : ''}`);
  if (opts.ladder) {
    const entries = Object.values(opts.ladder.entries).filter((e): e is LadderEntry => !!e).sort((a, b) => b.rating - a.rating);
    out.push(`  Ladder      ${entries.map((e) => `${DRIVER_NAME[e.driver]} ${e.rating}`).join('  ')}`);
  }
  if (rec.baseline.testsGreen === false) out.push('', paint(SOFT_RED, `  Tests were already failing on ${rec.repo.baseSha.slice(0, 7)}; visible-test points are unreliable for this run.`));
  out.push('', '');
  return out.join('\n');
}
```

Column widths are computed from the row content, so the exact spacing in the test regexes assumes the fixture values; if you change the fixture, update the regexes. In `run.ts`, replace the per-agent `console.log` loop with `console.log(renderScoreboard(rec))`; Task 26 adds `htmlPath`, Task 30 adds `ladder`.

- [ ] **Step 3: Run tests, race on scratch, commit**

```bash
bun test && bun run typecheck
# in scratch/: bun run /path/to/bakeoff/src/cli/index.ts run 1 --agents claude,codex --budget 1 --timeout 5m
git add -A && git commit -m "feat(cli): final terminal table per design/TERMINAL.md"
```

Post the first raw result.

---

# Day 5: OpenCode driver, cost normalization

### Task 24: OpenCode driver

**Files:**
- Create: `src/core/drivers/opencode.ts`, `test/fixtures/drivers/opencode/run.txt` (and `stats.json` if `opencode stats --json` exists), `test/core/drivers/opencode.test.ts`
- Modify: `src/core/drivers/index.ts`

**Interfaces:**
- Produces: `opencodeDriver: Driver`, `opencodeArgs(o: { jsonFormat: boolean }): string[]`, `parseOpencodeLine(line): AgentEvent[]`, `parseOpencodeStats(text): { tokens: TokenUsage; model: string; costUsd: number | null } | null`.

- [ ] **Step 1: Install, feature-detect, record**

```bash
npm i -g opencode-ai@1.18.27 && opencode --version && opencode run --help
mkdir -p test/fixtures/drivers/opencode && cd "$(mktemp -d)" && git init -q && \
opencode run --format json "Create a file named hello.txt containing the single word pong, then stop." \
  > "$OLDPWD/test/fixtures/drivers/opencode/run.txt" 2>&1; cd "$OLDPWD"
opencode stats 2>&1 | head -30 > test/fixtures/drivers/opencode/stats.txt
cut -c1-200 test/fixtures/drivers/opencode/run.txt | head -40
```

If `--format json` is not accepted, re-record without it and set `jsonFormat: false`. Record what `opencode stats` prints (tokens, model, cost) for the parser.

- [ ] **Step 2: Write the failing test**

```ts
// test/core/drivers/opencode.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { opencodeArgs, parseOpencodeLine, parseOpencodeStats } from '../../../src/core/drivers/opencode';

describe('opencode', () => {
  it('extracts at least one action from the recorded run', () => {
    const lines = readFileSync('test/fixtures/drivers/opencode/run.txt', 'utf8').split('\n').filter(Boolean);
    expect(lines.flatMap(parseOpencodeLine).some((e) => e.kind === 'action')).toBe(true);
  });
  it('parses stats or returns null', () => {
    const s = parseOpencodeStats(readFileSync('test/fixtures/drivers/opencode/stats.txt', 'utf8'));
    if (s) { expect(s.tokens.input).toBeGreaterThanOrEqual(0); expect(typeof s.model).toBe('string'); }
    expect(parseOpencodeStats('')).toBeNull();
  });
  it('builds args', () => {
    expect(opencodeArgs({ jsonFormat: true })).toEqual(['run', '--format', 'json']);
    expect(opencodeArgs({ jsonFormat: false })).toEqual(['run']);
  });
});
```

- [ ] **Step 3: Run to verify failure, then write opencode.ts**

```ts
// src/core/drivers/opencode.ts
import type { TokenUsage } from '@contract';
import { exec } from '../exec';
import { runProcess } from '../process';
import { addTokens, type AgentEvent, type Driver, type LaunchInput, type LaunchResult } from './types';

const str = (v: unknown) => (typeof v === 'string' ? v : '');
const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' ? (v as Record<string, unknown>) : {});

export function opencodeArgs(o: { jsonFormat: boolean }): string[] {
  return o.jsonFormat ? ['run', '--format', 'json'] : ['run'];
}

export function parseOpencodeLine(line: string): AgentEvent[] {
  try {
    const o = obj(JSON.parse(line));
    const type = str(o.type);
    const part = obj(o.part);
    const events: AgentEvent[] = [];
    if (type === 'tool' || str(part.type) === 'tool') {
      const tool = str(o.tool) || str(part.tool);
      const input = obj(o.input ?? part.state && obj(part.state).input);
      const target = str(input.filePath) || str(input.path) || str(input.command) || '';
      events.push({ kind: 'action', text: `${tool} ${target}`.trim().slice(0, 100) });
      if (/(edit|write)/i.test(tool) && target) events.push({ kind: 'file', path: target });
    }
    if (type === 'step-finish' || type === 'step_finish') {
      const t = obj(o.tokens ?? part.tokens);
      if (Object.keys(t).length) events.push({ kind: 'usage', tokens: { input: num(t.input), output: num(t.output), cacheRead: num(obj(t.cache).read), cacheWrite: num(obj(t.cache).write) }, model: str(o.model) || str(part.model) || 'opencode' });
    }
    if (type === 'text' && str(o.text)) events.push({ kind: 'action', text: `Say ${str(o.text).replace(/\s+/g, ' ')}`.slice(0, 100) });
    return events;
  } catch {
    const m = /^\s*(?:\||>|→)?\s*(read|edit|write|bash|glob|grep)\b\s*(.*)$/i.exec(line);   // plain-text mode
    return m ? [{ kind: 'action', text: `${m[1]} ${m[2]}`.trim().slice(0, 100) }] : [];
  }
}

export function parseOpencodeStats(text: string): { tokens: TokenUsage; model: string; costUsd: number | null } | null {
  if (!text.trim()) return null;
  const grab = (re: RegExp) => { const m = re.exec(text); return m ? Number(m[1]!.replaceAll(',', '')) : 0; };
  const input = grab(/input[^0-9]*([\d,]+)/i), output = grab(/output[^0-9]*([\d,]+)/i);
  if (!input && !output) return null;
  const cost = /cost[^$0-9]*\$?([\d.]+)/i.exec(text);
  const costUsd = cost && Number(cost[1]) > 0 ? Number(cost[1]) : null;   // $0.00 means "unknown provider", not free
  const model = /model[^\w/]*([\w./-]+)/i.exec(text)?.[1] ?? 'opencode';
  return { tokens: { input, output, cacheRead: grab(/cache(?:d|\s*read)[^0-9]*([\d,]+)/i), cacheWrite: 0 }, model, costUsd };
}

export const opencodeDriver: Driver = {
  id: 'opencode', displayName: 'OpenCode', color: '#E58BC7',
  async doctor() {
    const v = await exec('opencode', ['--version']);
    if (v.code !== 0) return { found: false, version: null, authOk: false, notes: ['install: npm i -g opencode-ai'] };
    const help = await exec('opencode', ['run', '--help']);
    const jsonFormat = /--format/.test(help.stdout + help.stderr);
    return { found: true, version: v.stdout.trim().split(/\s+/).pop() ?? null, authOk: true, notes: [jsonFormat ? 'json output' : 'plain output (json not supported)', 'cost best-effort; $0 reported as unavailable', 'no native budget cap; bakeoff meters tokens'] };
  },
  async launch(input: LaunchInput): Promise<LaunchResult> {
    const help = await exec('opencode', ['run', '--help']);
    const jsonFormat = /--format/.test(help.stdout + help.stderr);
    let tokens: TokenUsage | null = null;
    const r = await runProcess({
      cmd: 'opencode', args: [...opencodeArgs({ jsonFormat }), input.packet], cwd: input.worktree,
      env: { OPENCODE_PERMISSION: JSON.stringify({ edit: 'allow', bash: 'allow' }) },
      timeoutMs: input.caps.timeoutMs, signal: input.signal, meter: input.meter, logPath: input.logPath,
      onStdoutLine: (line) => { for (const e of parseOpencodeLine(line)) { if (e.kind === 'usage') { tokens = addTokens(tokens, e.tokens); input.meter.addUsage(e.tokens, e.model); } input.onEvent(e); } },
    });
    if (!tokens) {
      const stats = parseOpencodeStats((await exec('opencode', ['stats'], { cwd: input.worktree })).stdout);
      if (stats) { tokens = stats.tokens; if (stats.costUsd !== null) input.meter.setCost(stats.costUsd); else input.meter.addUsage(stats.tokens, stats.model); }
    }
    return { exitCode: r.exitCode, status: r.status === 'aborted' ? 'crashed' : r.status, tokens, costUsd: input.meter.costUsd, durationMs: r.durationMs, raw: null };
  },
};
```

Confirm the `OPENCODE_PERMISSION` env name against `opencode run --help` / docs; if permissions are config-file only, write `<worktree>/opencode.json` with `{"permission":{"edit":"allow","bash":"allow"}}` before launch and add `opencode.json` to the tamper `PROTECTED` list exclusion (it is bakeoff's own file). Register in `drivers/index.ts`.

- [ ] **Step 4: Run tests, first 3-agent race, commit**

```bash
bun test && bun run typecheck && bun run dev -- doctor
# in scratch/: bun run /path/to/bakeoff/src/cli/index.ts run 1 --agents claude,codex,opencode --budget 1 --timeout 10m
git add -A && git commit -m "feat(drivers): OpenCode driver (best-effort json, stats fallback)"
```

Post the "tests don't lie" result.

---

# Day 6: web UI scoreboard, static export, share PNG

### Task 25: UI scaffold with the Scoreboard screen

**Files:**
- Create: `ui/index.html`, `ui/vite.config.ts`, `ui/src/main.tsx`, `ui/src/App.tsx`, `ui/src/data.ts`, `ui/src/theme.ts`, `ui/src/screens/Scoreboard.tsx`, `ui/src/components/{WinnerSurface,OthersColumn,Breakdown,Pill,Dot}.tsx`, `ui/dev-data.ts`, `test/ui/data.test.ts`, `test/ui/theme.test.ts`

**Interfaces:**
- Consumes: `@contract` (schemas, reducer, fixtures).
- Produces: `window.__BAKEOFF__: { mode: 'static'; events: RaceEvent[] } | { mode: 'live'; eventsUrl: string }` read by `ui/src/data.ts` `loadBootstrap(): Bootstrap`, `useRaceState(bootstrap): RaceState`. `theme.ts`: `T` tokens, `DRIVER_META`, `PILL`, `SEGMENTS`, `segmentsOf(score)`, `fmtCost`, `fmtClock`, `fmtTok`, style objects `page`, `col`, `surface`, `pill(status)`, `dot(color, px)`. Build output `dist/ui.html` containing the literal marker `<!--BAKEOFF_DATA-->` just before `</head>`.

All visual values below are copied from `design/handoff/design_handoff_bakeoff/Bakeoff Scoreboard.dc.html` (inline styles) and the README. There is no separate stylesheet: the handoff is written as inline styles and so is the app. Deviations are the ones agreed in SPEC.md section 10.

- [x] **Step 1: vite.config.ts, index.html, main.tsx, dev-data.ts**

```ts
// ui/vite.config.ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { fileURLToPath } from 'node:url';
export default defineConfig({
  root: fileURLToPath(new URL('.', import.meta.url)),
  plugins: [react(), viteSingleFile()],
  resolve: { alias: { '@contract': fileURLToPath(new URL('../src/contract/index.ts', import.meta.url)) } },
  build: { outDir: fileURLToPath(new URL('../dist', import.meta.url)), emptyOutDir: false, rollupOptions: { input: fileURLToPath(new URL('./index.html', import.meta.url)) } },
});
```

```html
<!-- ui/index.html -->
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Bakeoff</title>
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@300..900&family=Geist+Mono:wght@400;500&display=swap" rel="stylesheet" />
<style>
html,body{margin:0;background:#0A0A0F;color:#F4F4F7;font-family:'Geist',system-ui,sans-serif;font-feature-settings:'tnum' 1;font-variant-numeric:tabular-nums;-webkit-font-smoothing:antialiased}
a{color:#F4F4F7;text-decoration:none}a:hover{color:#F4F4F7}
button{font:inherit;color:inherit;cursor:pointer}
@keyframes glowIn{from{opacity:0}to{opacity:1}}
</style>
<!--BAKEOFF_DATA-->
</head>
<body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
</html>
```

`build:ui` script: `"build:ui": "vite build --config ui/vite.config.ts && mv dist/index.html dist/ui.html"`.

```tsx
// ui/src/main.tsx
import React from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
if (import.meta.env.DEV) await import('../dev-data');
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
```

```ts
// ui/dev-data.ts  (DEV only)
import events from '../src/contract/fixtures/events.jsonl?raw';
(window as unknown as { __DEV_EVENTS__?: string }).__DEV_EVENTS__ = events;
```

- [x] **Step 2: theme.ts with a failing test**

```ts
// test/ui/theme.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { fmtClock, fmtTok, segmentsOf } from '../../ui/src/theme';
import { RunRecordSchema } from '../../src/contract/schema';

const rec = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

describe('theme', () => {
  it('formats', () => {
    expect(fmtClock(412000)).toBe('6:52');
    expect(fmtTok({ input: 118000, output: 6100, cacheRead: 0, cacheWrite: 0 })).toBe('118k / 6.1k');
    expect(fmtTok(null)).toBe('—');
  });
  it('merges typecheck+lint, keeps n/a as dashed, sizes by the track max', () => {
    const segs = segmentsOf(rec.agents[0]!.score!);
    expect(segs.map((s) => s.id)).toEqual(['visible_tests', 'hidden_tests', 'checks', 'ci', 'diff', 'judge']);
    const checks = segs.find((s) => s.id === 'checks')!;
    expect(checks).toMatchObject({ awarded: 15, max: 15, na: false });
    expect(segs.find((s) => s.id === 'ci')).toMatchObject({ na: true, max: 10 });
    // track max = sum of all maxes with max > 0 = 50+20+15+10+10+15 = 120
    expect(segs.reduce((n, s) => n + s.widthPct, 0)).toBeCloseTo(100, 5);
    expect(segs.find((s) => s.id === 'visible_tests')!.widthPct).toBeCloseTo((50 / 120) * 100, 5);
  });
});
```

```ts
// ui/src/theme.ts  (every literal value comes from the handoff README / markup)
import type { AgentStatus, DriverId, ScoreBreakdown, TokenUsage } from '@contract';
import type { CSSProperties } from 'react';

export const T = {
  bg: '#0A0A0F', text: '#F4F4F7', muted: 'rgba(255,255,255,.55)', dim: 'rgba(255,255,255,.45)', faint: 'rgba(255,255,255,.4)',
  hairline: 'rgba(255,255,255,.08)', divider: 'rgba(255,255,255,.06)', surface: 'rgba(255,255,255,.02)', surface2: 'rgba(255,255,255,.025)', track: 'rgba(255,255,255,.06)',
  plus: '#4ADE80', minus: '#F87171', penalty: 'rgba(248,113,113,.65)', zeroLine: 'rgba(255,255,255,.18)', naBorder: '1px dashed rgba(255,255,255,.18)',
  mono: "'Geist Mono', ui-monospace, monospace",
} as const;

export const DRIVER_META: Record<DriverId, { name: string; color: string }> = {
  claude: { name: 'Claude Code', color: '#F59E6B' },
  codex: { name: 'Codex', color: '#5EC8CE' },
  opencode: { name: 'OpenCode', color: '#E58BC7' },
  gemini: { name: 'Gemini CLI', color: '#9BCB6E' },
};
export const PILL: Record<AgentStatus, { label: string; fg: string; bg: string }> = {
  running: { label: 'Running', fg: '#60A5FA', bg: 'rgba(96,165,250,.12)' },
  ok: { label: 'Done', fg: '#4ADE80', bg: 'rgba(74,222,128,.12)' },
  crashed: { label: 'Crashed', fg: '#F87171', bg: 'rgba(248,113,113,.12)' },
  timeout: { label: 'Timed out', fg: '#F87171', bg: 'rgba(248,113,113,.12)' },
  budget_exceeded: { label: 'Over budget', fg: '#F87171', bg: 'rgba(248,113,113,.12)' },
};
export const SEGMENTS = [
  { id: 'visible_tests', name: 'Tests', color: 'rgba(214,224,255,.62)' },
  { id: 'hidden_tests', name: 'Hidden tests', color: 'rgba(176,196,240,.5)' },
  { id: 'checks', name: 'Lint & types', color: 'rgba(160,214,214,.4)' },
  { id: 'ci', name: 'CI', color: 'rgba(206,196,236,.32)' },
  { id: 'diff', name: 'Diff discipline', color: 'rgba(220,208,180,.26)' },
  { id: 'judge', name: 'Judge', color: 'rgba(255,255,255,.18)' },
] as const;
export type SegmentId = (typeof SEGMENTS)[number]['id'];
export interface Segment { id: SegmentId; name: string; color: string; max: number; awarded: number | null; na: boolean; widthPct: number }

/** Merge typecheck+lint, drop max-0 components, size widths by the sum of all visible maxes (n/a segments keep their max as a dashed placeholder). */
export function segmentsOf(score: ScoreBreakdown): Segment[] {
  const get = (id: string) => score.components.find((c) => c.id === id);
  const tc = get('typecheck'), lint = get('lint');
  const merged = { id: 'checks', max: (tc?.max ?? 0) + (lint?.max ?? 0), awarded: tc?.awarded === null && lint?.awarded === null ? null : (tc?.awarded ?? 0) + (lint?.awarded ?? 0) };
  const raw = SEGMENTS.map((s) => {
    const c = s.id === 'checks' ? merged : get(s.id);
    return { id: s.id, name: s.name, color: s.color, max: c?.max ?? 0, awarded: c?.awarded ?? null, na: (c?.awarded ?? null) === null };
  }).filter((s) => s.max > 0);
  const trackMax = raw.reduce((n, s) => n + s.max, 0) || 1;
  return raw.map((s) => ({ ...s, widthPct: ((s.na ? s.max : Math.max(0, s.awarded ?? 0)) / trackMax) * 100 }));
}

export const fmtCost = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
export function fmtClock(ms: number): string { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
const k = (n: number) => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
export const fmtTok = (t: TokenUsage | null) => (t ? `${k(t.input)} / ${k(t.output)}` : '—');

export const page: CSSProperties = { position: 'relative', minHeight: '100vh', minWidth: 1200, overflow: 'clip', backgroundImage: 'linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px)', backgroundSize: '32px 32px' };
export const col: CSSProperties = { position: 'relative', width: 1200, margin: '0 auto', padding: '36px 0 64px', display: 'flex', flexDirection: 'column', gap: 28 };
export const surface: CSSProperties = { border: `1px solid ${T.hairline}`, background: T.surface, borderRadius: 12 };
export const pill = (status: AgentStatus, size: 12 | 11 = 12): CSSProperties => ({ fontSize: size, fontWeight: 500, color: PILL[status].fg, background: PILL[status].bg, padding: size === 12 ? '3px 9px' : '2px 8px', borderRadius: 999 });
export const dot = (color: string, px: number): CSSProperties => ({ width: px, height: px, borderRadius: '50%', background: color, display: 'block', flex: 'none' });
export const ghostButton: CSSProperties = { fontSize: 13, fontWeight: 500, color: T.text, border: '1px solid rgba(255,255,255,.12)', background: 'rgba(255,255,255,.03)', padding: '7px 14px', borderRadius: 6 };
```

Run: `bun test test/ui/theme.test.ts` → FAIL, write `theme.ts`, run again → PASS.

- [x] **Step 3: data.ts with a failing test, then App.tsx**

```ts
// test/ui/data.test.ts
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
});
```

```ts
// ui/src/data.ts
import { useEffect, useState } from 'react';
import { RaceEventSchema, applyEvent, initialState, parseEventLines, reduceEvents, type Ladder, type RaceEvent, type RaceState } from '@contract';

export type Bootstrap = { mode: 'static'; events: RaceEvent[]; ladder?: Ladder } | { mode: 'live'; eventsUrl: string };
declare global { interface Window { __BAKEOFF__?: Bootstrap } }

export function parseBootstrap(json: string | null, win: Window | null, fallback: string | null): Bootstrap {
  if (json) { const b = JSON.parse(json) as Bootstrap; if (b.mode === 'static') b.events = b.events.map((e) => RaceEventSchema.parse(e)); return b; }
  if (win?.__BAKEOFF__) return win.__BAKEOFF__;
  if (fallback) return { mode: 'static', events: parseEventLines(fallback) };
  return { mode: 'static', events: [] };
}
export function loadBootstrap(): Bootstrap {
  const tag = document.getElementById('bakeoff-data');
  return parseBootstrap(tag?.textContent ?? null, window, import.meta.env.DEV ? (window as unknown as { __DEV_EVENTS__?: string }).__DEV_EVENTS__ ?? null : null);
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
```

```tsx
// ui/src/App.tsx
import { useEffect, useState } from 'react';
import { loadBootstrap, useRaceState } from './data';
import { Scoreboard } from './screens/Scoreboard';
import { T, ghostButton, page } from './theme';

const bootstrap = loadBootstrap();
type Tab = 'race' | 'scoreboard' | 'ladder';
export function App() {
  const state = useRaceState(bootstrap);
  const [tab, setTab] = useState<Tab>(state.finished ? 'scoreboard' : 'race');
  useEffect(() => { if (state.finished) setTab('scoreboard'); }, [state.finished]);
  const tabs: [Tab, string][] = [['race', 'Race'], ['scoreboard', 'Scoreboard'], ['ladder', 'Ladder']];
  return (
    <div style={page}>
      <nav style={{ position: 'absolute', top: 36, right: 'calc(50% - 600px)', display: 'flex', gap: 8, zIndex: 1 }}>
        {tabs.map(([k, label]) => <button key={k} onClick={() => setTab(k)} style={{ ...ghostButton, background: tab === k ? 'rgba(255,255,255,.08)' : ghostButton.background, color: tab === k ? T.text : T.muted }}>{label}</button>)}
      </nav>
      {tab === 'scoreboard' && <Scoreboard state={state} />}
      {tab === 'race' && <div style={{ padding: 36, color: T.muted }}>Race view arrives in Task 29.</div>}
      {tab === 'ladder' && <div style={{ padding: 36, color: T.muted }}>Ladder arrives in Task 31.</div>}
    </div>
  );
}
```

- [x] **Step 4: Scoreboard screen and components (markup mirrors the handoff one-to-one)**

```tsx
// ui/src/components/Dot.tsx
import { dot } from '../theme';
export const Dot = ({ color, px }: { color: string; px: number }) => <span style={dot(color, px)} />;
```

```tsx
// ui/src/components/Pill.tsx
import type { AgentStatus } from '@contract';
import { PILL, pill } from '../theme';
export function Pill({ status, size = 12, label }: { status: AgentStatus; size?: 12 | 11; label?: string }) {
  return <span style={pill(status, size)}>{label ?? PILL[status].label}</span>;
}
```

```tsx
// ui/src/components/WinnerSurface.tsx
import { useEffect, useState } from 'react';
import type { AgentResult } from '@contract';
import { Dot } from './Dot';
import { Pill } from './Pill';
import { DRIVER_META, T, fmtClock, fmtCost } from '../theme';

function useCountUp(target: number, ms = 1400): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const start = performance.now(); let raf = 0;
    const tick = (t: number) => { const p = Math.min(1, (t - start) / ms); const e = 1 - Math.pow(1 - p, 3); setN(Math.round(target * e * 10) / 10); if (p < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick); return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}
const stat = (label: string, value: string) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>{label}</span>
    <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.02em' }}>{value}</span>
  </div>
);
export function WinnerSurface({ a }: { a: AgentResult }) {
  const meta = DRIVER_META[a.driver];
  const n = useCountUp(a.score?.total ?? 0);
  const tests = a.score?.components.find((c) => c.id === 'visible_tests')?.detail.split(',')[0]?.replace(' passed', '') ?? '—';
  return (
    <div style={{ position: 'relative', border: `1px solid ${T.hairline}`, background: T.surface2, borderRadius: 12, padding: '28px 32px 30px', boxShadow: `inset 0 0 0 1px ${meta.color}22, inset 0 0 80px ${meta.color}14`, display: 'flex', flexDirection: 'column', gap: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <Dot color={meta.color} px={8} /><span style={{ fontSize: 16, fontWeight: 500 }}>{meta.name}</span><Pill status={a.status} label={a.prUrl ? 'PR open' : undefined} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 136, lineHeight: 0.9, fontWeight: 700, letterSpacing: '-.04em' }}>{n}</span>
        <span style={{ fontSize: 20, color: T.muted }}>/ {a.score?.maxPossible ?? 0}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36 }}>
        {stat('Cost', fmtCost(a.costUsd))}{stat('Duration', fmtClock(a.durationMs))}{stat('Tests', tests)}
        {a.prUrl && <a href={a.prUrl} style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 500, color: T.bg, background: T.text, padding: '8px 14px', borderRadius: 6 }}>View PR #{a.prNumber}</a>}
      </div>
    </div>
  );
}
```

```tsx
// ui/src/components/OthersColumn.tsx
import type { AgentResult } from '@contract';
import { Dot } from './Dot';
import { Pill } from './Pill';
import { DRIVER_META, T, fmtClock, fmtCost, surface } from '../theme';
export function OthersColumn({ agents }: { agents: AgentResult[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {agents.map((a, i) => {
        const meta = DRIVER_META[a.driver];
        const tests = a.score?.components.find((c) => c.id === 'visible_tests')?.detail.split(',')[0]?.replace(' passed', '') ?? '—';
        return (
          <div key={a.driver} style={{ ...surface, flex: 1, padding: '16px 20px', display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 14, alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>{a.rank ?? i + 2}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Dot color={meta.color} px={7} /><span style={{ fontSize: 14, fontWeight: 500 }}>{meta.name}</span><Pill status={a.status} size={11} /></div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: T.muted }}><span>{fmtCost(a.costUsd)}</span><span>{fmtClock(a.durationMs)}</span><span>{tests}</span></div>
            </div>
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.04em', lineHeight: 1 }}>{a.score ? a.score.total : 0}</span>
          </div>
        );
      })}
    </div>
  );
}
```

```tsx
// ui/src/components/Breakdown.tsx
import type { AgentResult, TamperFlag } from '@contract';
import { Dot } from './Dot';
import { DRIVER_META, SEGMENTS, T, segmentsOf, surface } from '../theme';

const FLAG_WORD: Record<TamperFlag['rule'], string> = { test_skipped: 'skipped test', test_deleted: 'deleted test', asserts_weakened: 'weakened asserts', config_write: 'edited config', hidden_path_write: 'wrote hidden path' };
export const flagLabel = (f: TamperFlag) => `${FLAG_WORD[f.rule]}: ${f.file}`;

export function Breakdown({ agents }: { agents: AgentResult[] }) {
  const legend = [...SEGMENTS.map((s) => ({ name: s.name, color: s.color, border: 'none' })), { name: 'Penalty', color: T.penalty, border: 'none' }, { name: 'n/a', color: 'transparent', border: '1px dashed rgba(255,255,255,.3)' }];
  return (
    <div style={{ ...surface, display: 'flex', flexDirection: 'column', padding: '8px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 12px', borderBottom: `1px solid ${T.divider}` }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Score breakdown</span>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: T.muted }}>
          {legend.map((l) => <span key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, border: l.border, boxSizing: 'border-box', display: 'block' }} />{l.name}</span>)}
        </div>
      </div>
      {agents.map((a, i) => {
        const meta = DRIVER_META[a.driver];
        const segs = a.score ? segmentsOf(a.score) : [];
        const penalty = a.score?.tamperPenalty ?? 0;
        const tests = a.score?.components.find((c) => c.id === 'visible_tests')?.detail.split(',')[0]?.replace(' passed', '') ?? '—';
        return (
          <div key={a.driver} style={{ display: 'grid', gridTemplateColumns: '150px 1fr 48px', gap: 20, alignItems: 'center', padding: '18px 0', borderBottom: i === agents.length - 1 ? 'none' : `1px solid ${T.divider}` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><Dot color={meta.color} px={7} /><span style={{ fontSize: 13, fontWeight: 500 }}>{meta.name}</span></div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 4fr', alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderRight: `1px solid ${T.zeroLine}`, height: 6, alignItems: 'center' }}>
                  {penalty < 0 && <span style={{ height: 6, borderRadius: '3px 0 0 3px', background: T.penalty, width: `${(Math.abs(penalty) / 25) * 100}%`, display: 'block' }} />}
                </div>
                <div style={{ display: 'flex', gap: 2, height: 6 }}>
                  {a.score ? segs.map((s, j) => <span key={s.id} style={{ height: 6, width: `${s.widthPct}%`, borderRadius: j === 0 ? '3px 0 0 3px' : j === segs.length - 1 ? '0 3px 3px 0' : 0, background: s.na ? 'transparent' : (s.awarded ?? 0) > 0 ? s.color : 'rgba(255,255,255,.06)', border: s.na ? T.naBorder : 'none', boxSizing: 'border-box', display: 'block', flex: 'none' }} />)
                    : <span style={{ fontSize: 12, color: T.faint, lineHeight: '6px' }}>No score, run {a.status === 'timeout' ? 'timed out' : a.status === 'budget_exceeded' ? 'went over budget' : 'crashed'}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: T.muted, paddingLeft: '20%' }}>
                <span>{tests} tests</span>
                <span><span style={{ color: T.plus }}>+{a.linesAdded}</span> <span style={{ color: T.minus }}>-{a.linesRemoved}</span></span>
                <span>{a.filesTouched.length} files</span>
                <span>exit {a.exitCode === 0 ? 'ok' : a.exitCode ?? a.status}</span>
                {a.score?.tamperFlags.map((f, k) => <span key={k} style={{ color: T.minus }}>{flagLabel(f)}</span>)}
              </div>
            </div>
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.03em', textAlign: 'right' }}>{a.score ? a.score.total : 0}</span>
          </div>
        );
      })}
    </div>
  );
}
```

```tsx
// ui/src/screens/Scoreboard.tsx
import type { RaceState, RunRecord } from '@contract';
import { Breakdown } from '../components/Breakdown';
import { OthersColumn } from '../components/OthersColumn';
import { Pill } from '../components/Pill';
import { WinnerSurface } from '../components/WinnerSurface';
import { DRIVER_META, T, col, fmtClock, fmtCost, ghostButton } from '../theme';

export function Scoreboard({ state }: { state: RaceState }) {
  const rec = state.record;
  if (!rec) return <div style={{ ...col }}><span style={{ color: T.muted }}>Race still running.</span></div>;
  const ranked = [...rec.agents].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const winner = ranked[0]!;
  const wc = DRIVER_META[winner.driver].color;
  return (
    <>
      <div style={{ position: 'absolute', left: '50%', top: 120, width: 1100, height: 620, transform: 'translateX(-50%)', pointerEvents: 'none', background: `radial-gradient(ellipse at 35% 40%, ${wc}1A 0%, ${wc}0A 30%, transparent 65%)`, animation: 'glowIn 1.6s ease-out both' }} />
      <div style={col}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{rec.issue.title}</span>
          <span style={{ fontSize: 13, color: T.muted }}>{rec.repo.owner}/{rec.repo.name} #{rec.issue.number}</span>
          <span style={{ fontSize: 13, color: T.muted }}>{rec.id}</span>
          <span style={{ marginLeft: 'auto' }}><Pill status="ok" label="Finished" /></span>
        </div>
        {rec.baseline.testsGreen === false && <div style={{ fontSize: 13, color: '#FBBF24' }}>Tests were already failing on {rec.repo.baseSha.slice(0, 7)}. Visible-test points are unreliable for this run.</div>}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'stretch' }}>
          <WinnerSurface a={winner} />
          <OthersColumn agents={ranked.slice(1)} />
        </div>
        <Breakdown agents={ranked} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <a href={`./${rec.id}.png`} style={ghostButton}>Share card</a>
          <button onClick={() => navigator.clipboard.writeText(toMarkdown(rec))} style={ghostButton}>Copy results</button>
        </div>
      </div>
    </>
  );
}

export function toMarkdown(rec: RunRecord): string {
  const rows = [...rec.agents].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99)).map((a) =>
    `| ${a.rank ?? '-'} | ${DRIVER_META[a.driver].name} | ${a.score ? `${a.score.total}/${a.score.maxPossible}` : a.status} | ${fmtCost(a.costUsd)} | ${fmtClock(a.durationMs)} | ${a.prUrl ? `[#${a.prNumber}](${a.prUrl})` : '-'} |`);
  return [`**Bakeoff** · [#${rec.issue.number} ${rec.issue.title}](${rec.issue.url})`, '', '| # | Agent | Score | Cost | Time | PR |', '|---|---|---|---|---|---|', ...rows].join('\n');
}
```

- [x] **Step 5: Run tests, build, compare against the handoff**

```bash
bun test && bun run typecheck && bun run build:ui && grep -c 'BAKEOFF_DATA' dist/ui.html
bunx vite --config ui/vite.config.ts   # open the URL; Scoreboard tab renders the fixture
open "design/handoff/design_handoff_bakeoff/standalone/Bakeoff Scoreboard.html"
```

Expected: `grep` prints 1. Side by side with the handoff: same header, winner surface with glow and count-up, others column, breakdown rows with a dashed n/a CI segment and a red penalty segment on Codex, footer buttons. Differences allowed: `/ 75` instead of `/ 100`, `Lint & types` legend entry, `PR open` pill on the winner. Screenshot it.

- [x] **Step 6: Commit**

```bash
git add -A && git commit -m "feat(ui): vite single-file app with scoreboard screen from the design handoff"
```

---

### Task 26: Static HTML export

**Files:**
- Create: `src/cli/export.ts`, `test/cli/export.test.ts`
- Modify: `src/cli/commands/run.ts` (write html after the race), `src/cli/index.ts` (`bakeoff export <id>` for re-rendering)

**Interfaces:**
- Produces: `injectData(html: string, bootstrap: Bootstrap): string` (replaces `<!--BAKEOFF_DATA-->` with the JSON script tag, escaping `</script>` as `<\/script>`), `uiTemplate(): string` (reads `dist/ui.html` next to the built CLI, or `../../dist/ui.html` from source), `exportRun(repoRoot, runId): string` (path written).

- [ ] **Step 1: Write the failing test**

```ts
// test/cli/export.test.ts
import { describe, expect, it } from 'vitest';
import { injectData } from '../../src/cli/export';

describe('injectData', () => {
  it('injects a JSON script tag and escapes closing tags', () => {
    const html = '<head><!--BAKEOFF_DATA--></head>';
    const out = injectData(html, { mode: 'static', events: [{ type: 'agent.started', at: 'x</script>', driver: 'claude', branch: 'b' }] });
    expect(out).toContain('<script type="application/json" id="bakeoff-data">');
    expect(out).toContain('<\\/script>');
    expect(out).not.toContain('<!--BAKEOFF_DATA-->');
  });
  it('throws when the marker is missing', () => {
    expect(() => injectData('<head></head>', { mode: 'live', eventsUrl: '/events' })).toThrow(/marker/);
  });
});
```

- [ ] **Step 2: Run to verify failure, then write export.ts**

```ts
// src/cli/export.ts
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { RaceEvent } from '@contract';
import { paths, readEvents } from '../core/store';

export type Bootstrap = { mode: 'static'; events: RaceEvent[] } | { mode: 'live'; eventsUrl: string };
const MARKER = '<!--BAKEOFF_DATA-->';

export function injectData(html: string, bootstrap: Bootstrap): string {
  if (!html.includes(MARKER)) throw new Error(`ui template has no ${MARKER} marker`);
  const json = JSON.stringify(bootstrap).replaceAll('</script', '<\\/script');
  return html.replace(MARKER, `<script type="application/json" id="bakeoff-data">${json}</script>`);
}
export function uiTemplate(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  for (const c of [join(here, 'ui.html'), join(here, '..', 'ui.html'), join(here, '..', '..', 'dist', 'ui.html')]) if (existsSync(c)) return readFileSync(c, 'utf8');
  throw new Error('dist/ui.html not found. Run `bun run build:ui`.');
}
export function exportRun(repoRoot: string, runId: string): string {
  const out = paths(repoRoot).html(runId);
  writeFileSync(out, injectData(uiTemplate(), { mode: 'static', events: readEvents(repoRoot, runId) }));
  return out;
}
```

In `run.ts` after the race: `const html = exportRun(repo.root, runId);` then `console.log(renderScoreboard(rec, { htmlPath: relative(repo.root, html), opened: !!opts.watch }))` (replace the earlier call). Add `program.command('export <id>').action((id) => console.log(exportRun(detectRoot(), id)))` where `detectRoot` is `must('git', ['rev-parse','--show-toplevel'])`.

- [ ] **Step 3: Run tests, export the last scratch run, open it, commit**

```bash
bun test && bun run typecheck && bun run build:ui
# in scratch/: bun run /path/to/bakeoff/src/cli/index.ts export <id> && open .bakeoff/runs/<id>.html
git add -A && git commit -m "feat(cli): static html scoreboard export"
```

---

### Task 27: Share PNG card

**Files:**
- Create: `src/render/card.tsx`, `src/render/fonts.ts`, `src/cli/commands/share.ts`, `test/render/card.test.ts`
- Modify: `src/cli/index.ts`

**Interfaces:**
- Produces: `renderCardSvg(rec: RunRecord): Promise<string>` (satori, 1200×630, layout and values from the handoff's Share Card file, text and color only, no emoji), `renderCardPng(rec): Promise<Uint8Array>` (resvg), `shareCommand(id)` writing `.bakeoff/runs/<id>.png`.

- [ ] **Step 1: Bundle a font**

satori needs font data. The handoff specifies Geist (OFL, by Vercel). Download the static weights once into the package:

```bash
mkdir -p src/render/fonts && cd "$(mktemp -d)" && gh release download -R vercel/geist-font --pattern '*.zip' && unzip -o -q *.zip && find . -iname 'Geist-Regular.*' -o -iname 'Geist-Bold.*' | grep -Ei '\.(ttf|otf)$' | head -4
```

Copy `Geist-Regular` and `Geist-Bold` (ttf or otf, either works with satori) to `src/render/fonts/Geist-Regular.ttf` and `src/render/fonts/Geist-Bold.ttf`. If the release has only a variable font, download the static instances from https://vercel.com/font instead. Add `"files": ["dist", "src/render/fonts", "README.md"]` in package.json.

```ts
// src/render/fonts.ts
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
export const fonts = () => [
  { name: 'Geist', data: readFileSync(join(here, 'fonts', 'Geist-Regular.ttf')), weight: 400 as const, style: 'normal' as const },
  { name: 'Geist', data: readFileSync(join(here, 'fonts', 'Geist-Bold.ttf')), weight: 700 as const, style: 'normal' as const },
];
```

- [ ] **Step 2: Write the failing test**

```ts
// test/render/card.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { renderCardPng, renderCardSvg } from '../../src/render/card';
import { RunRecordSchema } from '../../src/contract/schema';

const rec = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

describe('card', () => {
  it('renders an svg with the podium and a png of the right size', async () => {
    const svg = await renderCardSvg(rec);
    expect(svg).toContain('Claude Code'); expect(svg).toContain('74.7'); expect(svg).toContain('edited config vitest.config.ts'); expect(svg).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);
    const png = await renderCardPng(rec);
    expect(png.length).toBeGreaterThan(10_000);
    expect(png.subarray(0, 8)).toEqual(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  });
});
```

- [ ] **Step 3: Run to verify failure, then write card.tsx and share.ts**

Every value below is from `design/handoff/design_handoff_bakeoff/Bakeoff Share Card.dc.html`. satori supports flexbox and gradient backgrounds, not CSS grid, so the handoff's `grid-template-columns: 1.25fr 1fr` becomes two flex children with `flex: 1.25` and `flex: 1`, and the others' `28px 1fr auto` row becomes a flex row. No emoji anywhere; tamper flags are red text.

```tsx
// src/render/card.tsx
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import type { RunRecord, TamperFlag } from '@contract';
import { fonts } from './fonts';

const META: Record<string, { name: string; color: string }> = { claude: { name: 'Claude Code', color: '#F59E6B' }, codex: { name: 'Codex', color: '#5EC8CE' }, opencode: { name: 'OpenCode', color: '#E58BC7' }, gemini: { name: 'Gemini CLI', color: '#9BCB6E' } };
const MUTED = 'rgba(255,255,255,.55)';
const FLAG_WORD: Record<TamperFlag['rule'], string> = { test_skipped: 'skipped test', test_deleted: 'deleted test', asserts_weakened: 'weakened asserts', config_write: 'edited config', hidden_path_write: 'wrote hidden path' };
const cost = (n: number | null) => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
const clock = (ms: number) => { const s = Math.round(ms / 1000); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const testsOf = (a: RunRecord['agents'][number]) => a.score?.components.find((c) => c.id === 'visible_tests')?.detail.split(',')[0]?.replace(' passed', '') ?? '—';
const stat = (label: string, value: string) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
    <span style={{ fontSize: 16, fontWeight: 500, color: MUTED }}>{label}</span>
    <span style={{ fontSize: 30, fontWeight: 600, letterSpacing: '-0.02em' }}>{value}</span>
  </div>
);

export async function renderCardSvg(rec: RunRecord): Promise<string> {
  const ranked = [...rec.agents].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const w = ranked[0]!;
  const wc = META[w.driver]!.color;
  const flags = ranked.flatMap((a) => (a.score?.tamperFlags ?? []).map((f) => `${META[a.driver]!.name}: ${FLAG_WORD[f.rule]} ${f.file}`));
  return satori(
    <div style={{ width: 1200, height: 630, position: 'relative', overflow: 'hidden', background: '#0A0A0F', color: '#F4F4F7', padding: '56px 64px', display: 'flex', flexDirection: 'column', gap: 40, fontFamily: 'Geist' }}>
      <div style={{ position: 'absolute', left: -80, top: 40, width: 820, height: 620, borderRadius: 400, background: `radial-gradient(ellipse at 40% 45%, ${wc}2E 0%, ${wc}12 35%, transparent 70%)` }} />
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 16 }}>
        <span style={{ fontSize: 26, fontWeight: 500, letterSpacing: '-0.01em' }}>{rec.issue.title}</span>
        <span style={{ fontSize: 20, color: MUTED }}>{rec.repo.owner}/{rec.repo.name} #{rec.issue.number}</span>
      </div>
      <div style={{ display: 'flex', gap: 40, flex: 1 }}>
        <div style={{ flex: 1.25, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.03)', borderRadius: 16, padding: '32px 36px', boxShadow: `inset 0 0 0 1px ${wc}26, inset 0 0 90px ${wc}18`, display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <span style={{ width: 14, height: 14, borderRadius: 7, background: wc, display: 'flex' }} />
            <span style={{ fontSize: 28, fontWeight: 500 }}>{META[w.driver]!.name}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14 }}>
            <span style={{ fontSize: 180, lineHeight: 0.85, fontWeight: 700, letterSpacing: '-0.05em' }}>{w.score ? String(w.score.total) : w.status}</span>
            <span style={{ fontSize: 28, color: MUTED }}>/ {w.score?.maxPossible ?? 0}</span>
          </div>
          <div style={{ display: 'flex', gap: 40 }}>{stat('Cost', cost(w.costUsd))}{stat('Duration', clock(w.durationMs))}{stat('Tests', testsOf(w))}</div>
        </div>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {ranked.slice(1, 4).map((a, i) => (
            <div key={a.driver} style={{ flex: 1, border: '1px solid rgba(255,255,255,.1)', background: 'rgba(255,255,255,.025)', borderRadius: 16, padding: '0 28px', display: 'flex', alignItems: 'center', gap: 16 }}>
              <span style={{ width: 28, fontSize: 18, fontWeight: 500, color: MUTED }}>{a.rank ?? i + 2}</span>
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><span style={{ width: 10, height: 10, borderRadius: 5, background: META[a.driver]!.color, display: 'flex' }} /><span style={{ fontSize: 22, fontWeight: 500 }}>{META[a.driver]!.name}</span></div>
                <span style={{ fontSize: 16, color: MUTED }}>{a.score ? `${cost(a.costUsd)} · ${clock(a.durationMs)}` : a.status.replace('_', ' ')}</span>
              </div>
              <span style={{ fontSize: 52, fontWeight: 700, letterSpacing: '-0.04em', lineHeight: 1 }}>{a.score ? String(a.score.total) : '0'}</span>
            </div>
          ))}
        </div>
      </div>
      {flags.length > 0 && <div style={{ position: 'absolute', left: 64, bottom: 40, display: 'flex', fontSize: 16, color: '#F87171' }}>{flags.join('   ')}</div>}
      <div style={{ position: 'absolute', right: 64, bottom: 40, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ width: 8, height: 8, borderRadius: 2, background: '#F4F4F7', display: 'flex' }} />
        <span style={{ fontSize: 16, fontWeight: 600, letterSpacing: '-0.02em' }}>bakeoff</span>
      </div>
    </div>,
    { width: 1200, height: 630, fonts: fonts() },
  );
}
export async function renderCardPng(rec: RunRecord): Promise<Uint8Array> {
  return new Resvg(await renderCardSvg(rec), { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
}
```

```ts
// src/cli/commands/share.ts
import * as p from '@clack/prompts';
import { writeFileSync } from 'node:fs';
import { must } from '../../core/exec';
import { paths, readRun } from '../../core/store';
import { renderCardPng } from '../../render/card';

export async function shareCommand(id: string): Promise<void> {
  const root = await must('git', ['rev-parse', '--show-toplevel']);
  const rec = readRun(root, id);
  const out = paths(root).png(id);
  writeFileSync(out, await renderCardPng(rec));
  p.log.success(`Share card: ${out}`);
}
```

Register `program.command('share <id>').action(shareCommand)` and call `shareCommand(runId)` at the end of `runCommand`. `card.tsx` uses JSX at runtime, so move `react` and `react-dom` from `devDependencies` to `dependencies`.

- [ ] **Step 4: Run tests, generate a real card, commit**

```bash
bun test && bun run typecheck
# in scratch/: bun run /path/to/bakeoff/src/cli/index.ts share <id> && open .bakeoff/runs/<id>.png
git add -A && git commit -m "feat(render): satori share card + share command"
```

---

# Day 7: live race view

### Task 28: SSE server and `--watch`

**Files:**
- Create: `src/cli/server.ts`, `test/cli/server.test.ts`
- Modify: `src/cli/commands/run.ts`

**Interfaces:**
- Produces: `startServer(o: { repoRoot; runId; abort: AbortRegistry; port?: number }): { url: string; stop(): void; broadcast(e: RaceEvent): void }`. Routes: `GET /` → `dist/ui.html` with `{mode:'live', eventsUrl:'/events'}` injected; `GET /events` → SSE: replay `events.jsonl` then live; `POST /abort/:driver` → `abort.abort(driver)`, 204.

- [ ] **Step 1: Write the failing test**

```ts
// test/cli/server.test.ts
import { describe, expect, it } from 'vitest';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { startServer } from '../../src/cli/server';
import { appendEvent } from '../../src/core/store';
import { createAbortRegistry } from '../../src/core/race';

describe('server', () => {
  it('serves ui, replays events then streams new ones, and aborts', async () => {
    const root = mkdtempSync(join(tmpdir(), 'bakeoff-srv-'));
    appendEvent(root, 'r1', { type: 'agent.started', at: 'a', driver: 'claude', branch: 'b' });
    const abort = createAbortRegistry();
    let aborted = false; abort.signalFor('codex').addEventListener('abort', () => { aborted = true; });
    const srv = startServer({ repoRoot: root, runId: 'r1', abort, port: 0, template: '<head><!--BAKEOFF_DATA--></head>' });
    const html = await (await fetch(`${srv.url}/`)).text();
    expect(html).toContain('"mode":"live"');
    const res = await fetch(`${srv.url}/events`);
    const reader = res.body!.getReader();
    const dec = new TextDecoder();
    let buf = dec.decode((await reader.read()).value);
    expect(buf).toContain('agent.started');
    srv.broadcast({ type: 'agent.pr_opened', at: 'b', driver: 'claude', prUrl: 'u', prNumber: 1 });
    buf += dec.decode((await reader.read()).value);
    expect(buf).toContain('agent.pr_opened');
    expect((await fetch(`${srv.url}/abort/codex`, { method: 'POST' })).status).toBe(204);
    expect(aborted).toBe(true);
    reader.cancel(); srv.stop();
  });
});
```

- [ ] **Step 2: Run to verify failure, then write server.ts**

```ts
// src/cli/server.ts
import { DriverIdSchema, type RaceEvent } from '@contract';
import type { AbortRegistry } from '../core/race';
import { NAMES } from '../core/names';
import { readEvents } from '../core/store';
import { injectData, uiTemplate } from './export';

export function startServer(o: { repoRoot: string; runId: string; abort: AbortRegistry; port?: number; template?: string }) {
  const clients = new Set<(e: RaceEvent) => void>();
  const html = injectData(o.template ?? uiTemplate(), { mode: 'live', eventsUrl: '/events' });
  const server = Bun.serve({
    port: o.port ?? NAMES.port,
    fetch(req) {
      const url = new URL(req.url);
      if (req.method === 'GET' && url.pathname === '/') return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8' } });
      if (req.method === 'GET' && url.pathname === '/events') {
        let send: ((e: RaceEvent) => void) | null = null;
        const stream = new ReadableStream<Uint8Array>({
          start(ctrl) {
            const enc = new TextEncoder();
            send = (e) => { try { ctrl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`)); } catch { /* closed */ } };
            for (const e of readEvents(o.repoRoot, o.runId)) send(e);
            clients.add(send);
          },
          cancel() { if (send) clients.delete(send); },
        });
        return new Response(stream, { headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' } });
      }
      const m = /^\/abort\/([a-z]+)$/.exec(url.pathname);
      if (req.method === 'POST' && m) { const id = DriverIdSchema.safeParse(m[1]); if (id.success) { o.abort.abort(id.data); return new Response(null, { status: 204 }); } return new Response('unknown driver', { status: 400 }); }
      return new Response('not found', { status: 404 });
    },
  });
  return { url: `http://localhost:${server.port}`, stop: () => server.stop(true), broadcast: (e: RaceEvent) => { for (const c of clients) c(e); } };
}
```

In `run.ts`, when `opts.watch`: create `abort = createAbortRegistry()`, `srv = startServer({ repoRoot: repo.root, runId, abort })`, set `deps.abort = abort`, chain `deps.onEvent` to also call `srv.broadcast(e)`, open the browser with `Bun.spawn(['open', srv.url])` on darwin / `xdg-open` elsewhere, and call `srv.stop()` after export. Note the events file must exist before the server replays it: `runRace` creates it on the first `emit`; the browser opening 200ms later is fine, and `readEvents` returns `[]` for a missing file.

- [ ] **Step 3: Run tests, commit**

```bash
bun test && bun run typecheck && git add -A && git commit -m "feat(cli): SSE server, POST abort, run --watch"
```

---

### Task 29: Race view screen

**Files:**
- Create: `ui/src/screens/Race.tsx`, `ui/src/components/Lane.tsx`, `ui/src/useNow.ts`
- Modify: `ui/src/App.tsx` (render `<Race state={state} bootstrap={bootstrap} />`)

**Interfaces:**
- Consumes: `RaceState.agents: AgentLane[]`, `state.caps.budgetUsd`, `Pill`, `Dot`, `theme.ts`.
- Produces: `Race` screen mirroring `design/handoff/design_handoff_bakeoff/Bakeoff Race.dc.html`: header with `N of M running`, one surface with stacked lanes; each lane has row 1 `220px 1fr auto` (dot + name + pill | last action | elapsed / tokens / files), row 2 `1fr 64px` (cost track with gradient fill, cost label above the fill's end, budget marker | `$3.00 budget`), a click-toggled log drawer in Geist Mono, and in live mode an `Abort` ghost button for running agents that POSTs `/abort/<driver>`.

- [x] **Step 1: useNow, Lane, Race**

```ts
// ui/src/useNow.ts
import { useEffect, useState } from 'react';
export function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { if (!active) return; const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, [active]);
  return now;
}
```

```tsx
// ui/src/components/Lane.tsx
import { useState } from 'react';
import type { AgentLane, RunRecord } from '@contract';
import { Dot } from './Dot';
import { Pill } from './Pill';
import { DRIVER_META, T, fmtClock, fmtCost, fmtTok, ghostButton } from '../theme';
import { useNow } from '../useNow';

const logColor = (line: string) => (line.startsWith('Error') ? 'rgba(248,113,113,.8)' : line.startsWith('✓') ? 'rgba(74,222,128,.7)' : T.dim);

export function Lane({ lane, budget, record, live, last }: { lane: AgentLane; budget: number; record: RunRecord | null; live: boolean; last: boolean }) {
  const [open, setOpen] = useState(false);
  const running = lane.status === 'running';
  const now = useNow(running);
  const elapsed = running && lane.startedAt ? now - Date.parse(lane.startedAt) : (lane.durationMs ?? 0);
  const meta = DRIVER_META[lane.driver];
  const fillPct = lane.costUsd === null ? 0 : Math.min(100, (lane.costUsd / budget) * 100);
  const tail = record?.agents.find((a) => a.driver === lane.driver)?.logTail ?? '';
  const abort = (e: React.MouseEvent) => { e.stopPropagation(); void fetch(`/abort/${lane.driver}`, { method: 'POST' }); };
  return (
    <div style={{ borderBottom: last ? 'none' : `1px solid ${T.divider}` }}>
      <div onClick={() => setOpen(!open)} style={{ cursor: 'pointer', padding: '18px 24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr auto', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Dot color={meta.color} px={8} /><span style={{ fontSize: 15, fontWeight: 500 }}>{meta.name}</span><Pill status={lane.status} size={11} label={lane.status === 'ok' && lane.prUrl ? 'PR open' : undefined} />
          </div>
          <span style={{ fontSize: 13, color: T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>{lane.lastAction || (running ? 'starting' : '')}</span>
          <div style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}><span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-.02em' }}>{fmtClock(elapsed)}</span><span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>elapsed</span></div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}><span style={{ fontSize: 14, fontWeight: 500 }}>{fmtTok(lane.tokens)}</span><span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>tokens</span></div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}><span style={{ fontSize: 14, fontWeight: 500 }}>{lane.filesTouched}</span><span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>files</span></div>
            {live && running && <button onClick={abort} style={{ ...ghostButton, padding: '3px 9px', fontSize: 12 }}>Abort</button>}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', height: 6, borderRadius: 3, background: T.track }}>
            <span style={{ position: 'absolute', left: 0, top: 0, height: 6, width: `${fillPct}%`, borderRadius: 3, background: `linear-gradient(90deg, ${meta.color}33, ${meta.color}CC)`, display: 'block', transition: 'width .6s linear' }} />
            <span style={{ position: 'absolute', left: `${fillPct}%`, top: -16, transform: fillPct > 0 ? 'translateX(-100%)' : 'none', fontSize: 13, fontWeight: 600, letterSpacing: '-.02em', color: meta.color, transition: 'left .6s linear', whiteSpace: 'nowrap' }}>{lane.costUsd === null ? 'cost n/a' : fmtCost(lane.costUsd)}</span>
            <span style={{ position: 'absolute', right: 0, top: -3, width: 1, height: 12, background: 'rgba(255,255,255,.35)', display: 'block' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: T.muted, textAlign: 'right' }}>{fmtCost(budget)} budget</span>
        </div>
      </div>
      {open && (
        <div style={{ background: 'rgba(255,255,255,.015)', borderTop: `1px solid ${T.divider}`, padding: '14px 24px 16px', display: 'flex', flexDirection: 'column', gap: 5, fontFamily: T.mono, fontSize: 12, lineHeight: 1.5, color: T.dim }}>
          {(tail || 'log available when the agent exits').split('\n').map((line, i) => <span key={i} style={{ whiteSpace: 'pre', color: logColor(line) }}>{line}</span>)}
        </div>
      )}
    </div>
  );
}
```

```tsx
// ui/src/screens/Race.tsx
import type { RaceState } from '@contract';
import type { Bootstrap } from '../data';
import { Lane } from '../components/Lane';
import { T, col, surface } from '../theme';

export function Race({ state, bootstrap }: { state: RaceState; bootstrap: Bootstrap }) {
  const running = state.agents.filter((a) => a.status === 'running').length;
  return (
    <div style={{ ...col, gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: `1px solid ${T.hairline}` }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{state.issue?.title ?? 'No run loaded'}</span>
        <span style={{ fontSize: 13, color: T.muted }}>{state.repo ? `${state.repo.owner}/${state.repo.name} #${state.issue?.number}` : ''}</span>
        <span style={{ fontSize: 13, color: T.muted }}>{state.runId ?? ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: T.muted }}>{state.finished ? 'Finished' : `${running} of ${state.agents.length} running`}</span>
      </div>
      <div style={{ ...surface, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {state.agents.map((lane, i) => <Lane key={lane.driver} lane={lane} budget={state.caps?.budgetUsd ?? 1} record={state.record} live={bootstrap.mode === 'live'} last={i === state.agents.length - 1} />)}
      </div>
    </div>
  );
}
```

- [x] **Step 2: Wire into App.tsx, build, run a watched race**

Replace the Race placeholder in `App.tsx` with `<Race state={state} bootstrap={bootstrap} />` (the `useEffect` switching to the scoreboard on `state.finished` is already there). Then:

```bash
bun run typecheck && bun run build:ui
# in scratch/: bun run /path/to/bakeoff/src/cli/index.ts run 1 --agents claude,codex --watch
open "design/handoff/design_handoff_bakeoff/standalone/Bakeoff Race.html"
```

Expected: the browser opens on the Race tab; lanes tick, the cost fill and label creep right, pills flip to `PR open`, the log drawer opens on click, and the tab switches to Scoreboard when `race.finished` arrives. Side by side with the handoff the only differences are live data and the `Abort` button. Record the 30-60s screen video here.

- [x] **Step 3: Commit**

```bash
git add -A && git commit -m "feat(ui): live race view from the design handoff"
```

---

# Day 8: ladder and README

### Task 30: Ladder core and `bakeoff ladder`

**Files:**
- Create: `src/core/ladder.ts`, `src/cli/commands/ladder.ts`, `test/core/ladder.test.ts`
- Modify: `src/core/race.ts` (call `updateLadder` after finalize), `src/cli/index.ts`

**Interfaces:**
- Produces: `displayRating(mu, sigma): number` = `Math.round(1000 + 40 * (mu - 3 * sigma))`, `updateLadder(ladder: Ladder, rec: RunRecord): Ladder` (pure), `renderLadder(ladder): string`.

- [ ] **Step 1: Write the failing test**

```ts
// test/core/ladder.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { displayRating, renderLadder, updateLadder } from '../../src/core/ladder';
import { RunRecordSchema } from '../../src/contract/schema';

const rec = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

describe('ladder', () => {
  it('new agents start at 1000', () => { expect(displayRating(25, 25 / 3)).toBe(1000); });
  it('winner goes up, loser goes down, timeout excluded but recorded', () => {
    const l = updateLadder({ schemaVersion: 1, entries: {} }, rec);
    expect(l.entries.claude!.rating).toBeGreaterThan(l.entries.codex!.rating);
    expect(l.entries.claude!.races).toBe(1); expect(l.entries.claude!.wins).toBe(1);
    expect(l.entries.codex!.wins).toBe(0);
    expect(l.entries.opencode!.races).toBe(0);
    expect(l.entries.opencode!.rating).toBe(1000);
    expect(l.entries.opencode!.history).toHaveLength(1);
    expect(l.entries.claude!.avgCostUsd).toBe(1.42);
    expect(l.entries.opencode!.avgCostUsd).toBeNull();
  });
  it('is idempotent per run id', () => {
    const once = updateLadder({ schemaVersion: 1, entries: {} }, rec);
    expect(updateLadder(once, rec)).toEqual(once);
  });
  it('renders a table', () => {
    expect(renderLadder(updateLadder({ schemaVersion: 1, entries: {} }, rec))).toMatch(/claude\s+\d{3,4}\s+1\s+1/);
  });
});
```

- [ ] **Step 2: Run to verify failure, then write ladder.ts**

```ts
// src/core/ladder.ts
import { rate, rating as newRating } from 'openskill';
import type { DriverId, Ladder, LadderEntry, RunRecord } from '@contract';

export const displayRating = (mu: number, sigma: number) => Math.round(1000 + 40 * (mu - 3 * sigma));

function entry(l: Ladder, d: DriverId): LadderEntry {
  const r = newRating();
  return l.entries[d] ?? { driver: d, mu: r.mu, sigma: r.sigma, rating: displayRating(r.mu, r.sigma), races: 0, wins: 0, avgCostUsd: null, avgDurationMs: 0, history: [] };
}

export function updateLadder(ladder: Ladder, rec: RunRecord): Ladder {
  if (Object.values(ladder.entries).some((e) => e?.history.some((h) => h.runId === rec.id))) return ladder;
  const entries: Partial<Record<DriverId, LadderEntry>> = { ...ladder.entries };
  const ranked = rec.agents.filter((a) => a.status === 'ok' && a.rank !== null);
  const at = rec.finishedAt ?? rec.createdAt;
  if (ranked.length >= 2) {
    const teams = ranked.map((a) => { const e = entry(ladder, a.driver); return [{ mu: e.mu, sigma: e.sigma }]; });
    const out = rate(teams, { rank: ranked.map((a) => a.rank!) });
    ranked.forEach((a, i) => {
      const e = entry(ladder, a.driver); const r = out[i]![0]!;
      const races = e.races + 1;
      const costs = a.costUsd === null ? e.avgCostUsd : e.avgCostUsd === null ? a.costUsd : (e.avgCostUsd * e.races + a.costUsd) / races;
      entries[a.driver] = { ...e, mu: r.mu, sigma: r.sigma, rating: displayRating(r.mu, r.sigma), races, wins: e.wins + (a.rank === 1 ? 1 : 0),
        avgCostUsd: costs, avgDurationMs: (e.avgDurationMs * e.races + a.durationMs) / races, history: [...e.history, { runId: rec.id, at, rating: displayRating(r.mu, r.sigma) }] };
    });
  }
  for (const a of rec.agents) {
    if (entries[a.driver]?.history.some((h) => h.runId === rec.id)) continue;
    const e = entry(ladder, a.driver);
    entries[a.driver] = { ...e, history: [...e.history, { runId: rec.id, at, rating: e.rating }] };
  }
  return { schemaVersion: 1, entries };
}

export function renderLadder(l: Ladder): string {
  const rows = Object.values(l.entries).filter((e): e is LadderEntry => !!e).sort((a, b) => b.rating - a.rating);
  const head = ['agent', 'rating', 'races', 'wins', 'avg cost', 'avg time'];
  const data = rows.map((e) => [e.driver, String(e.rating), String(e.races), String(e.wins), e.avgCostUsd === null ? 'n/a' : `$${e.avgCostUsd.toFixed(2)}`, `${Math.round(e.avgDurationMs / 1000)}s`]);
  const w = head.map((h, i) => Math.max(h.length, ...data.map((r) => r[i]!.length)));
  const line = (r: string[]) => r.map((c, i) => c.padEnd(w[i]!)).join('  ').trimEnd();
  return [line(head), line(w.map((n) => '-'.repeat(n))), ...data.map(line)].join('\n');
}
```

```ts
// src/cli/commands/ladder.ts
import { must } from '../../core/exec';
import { renderLadder } from '../../core/ladder';
import { readLadder } from '../../core/store';
export async function ladderCommand(): Promise<void> {
  const root = await must('git', ['rev-parse', '--show-toplevel']);
  console.log(renderLadder(readLadder(root)));
}
```

In `race.ts` after `record.finishedAt = at()`: `writeLadder(repoRoot, updateLadder(readLadder(repoRoot), record))`. Register `program.command('ladder').action(ladderCommand)`. In `run.ts`, pass `ladder: readLadder(repo.root)` to `renderScoreboard` so the `Ladder` footer line prints.

- [ ] **Step 3: Run tests, commit**

```bash
bun test && bun run typecheck && git add -A && git commit -m "feat: openskill ladder, ladder command, updated after each race"
```

---

### Task 31: Ladder screen

**Files:**
- Create: `ui/src/screens/Ladder.tsx`, `ui/src/components/Sparkline.tsx`
- Modify: `src/cli/export.ts` (static bootstrap also carries `ladder`), `ui/src/data.ts` (`Bootstrap` static variant gains `ladder?: Ladder`), `src/cli/server.ts` (`GET /ladder.json`), `ui/src/App.tsx`

**Interfaces:**
- Produces: `Ladder` screen mirroring `Bakeoff Ladder.dc.html` (table + empty state) with a `Sparkline` of `history[].rating` per row. Data: static → `bootstrap.ladder`; live → fetch `/ladder.json` once when `state.finished` flips.

- [x] **Step 1: Sparkline and screen (markup from `Bakeoff Ladder.dc.html`)**

```tsx
// ui/src/components/Sparkline.tsx
export function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <svg viewBox="0 0 140 28" width="140" height="28" style={{ display: 'block', justifySelf: 'end' }} />;
  const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
  const xy = values.map((v, i) => [(i / (values.length - 1)) * 136 + 2, 26 - ((v - min) / span) * 24] as const);
  const last = xy[xy.length - 1]!;
  return (
    <svg viewBox="0 0 140 28" width="140" height="28" style={{ display: 'block', justifySelf: 'end' }}>
      <polyline points={xy.map(([x, y]) => `${x},${y}`).join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" opacity=".85" />
      <circle cx={last[0]} cy={last[1]} r="2.5" fill={color} />
    </svg>
  );
}
```

```tsx
// ui/src/screens/Ladder.tsx
import type { Ladder as LadderT, LadderEntry, RaceState } from '@contract';
import { Dot } from '../components/Dot';
import { Sparkline } from '../components/Sparkline';
import { DRIVER_META, T, col, fmtClock, fmtCost, surface } from '../theme';

const COLS = '32px 1fr 100px 80px 80px 110px 110px 140px';
const right = { textAlign: 'right' as const };

export function Ladder({ ladder, state }: { ladder: LadderT | null; state: RaceState }) {
  const rows = ladder ? Object.values(ladder.entries).filter((e): e is LadderEntry => !!e).sort((a, b) => b.rating - a.rating) : [];
  const races = rows.reduce((n, e) => Math.max(n, e.history.length), 0);
  return (
    <div style={{ ...col, gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 16, borderBottom: `1px solid ${T.hairline}` }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>Ladder</span>
        <span style={{ fontSize: 13, color: T.muted }}>{state.repo ? `${state.repo.owner}/${state.repo.name}` : ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: T.muted }}>{races} race{races === 1 ? '' : 's'}</span>
      </div>
      <div style={{ ...surface, padding: '0 24px' }}>
        <div style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '14px 0 12px', borderBottom: `1px solid ${T.divider}`, fontSize: 12, fontWeight: 500, color: T.muted }}>
          <span>#</span><span>Agent</span><span style={right}>Rating</span><span style={right}>Races</span><span style={right}>Wins</span><span style={right}>Avg cost</span><span style={right}>Avg time</span><span style={right}>Rating trend</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '72px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>No races yet.</span>
            <span style={{ fontSize: 13, color: T.muted }}>Run one with <span style={{ fontFamily: T.mono, fontSize: 12, color: 'rgba(255,255,255,.75)', background: 'rgba(255,255,255,.05)', border: `1px solid ${T.hairline}`, padding: '2px 7px', borderRadius: 6 }}>bakeoff run owner/repo#123</span></span>
          </div>
        ) : rows.map((e, i) => (
          <div key={e.driver} style={{ display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center', padding: '16px 0', borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${T.divider}` }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>{i + 1}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}><Dot color={DRIVER_META[e.driver].color} px={8} /><span style={{ fontSize: 14, fontWeight: 500 }}>{DRIVER_META[e.driver].name}</span></div>
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.03em', ...right }}>{e.rating}</span>
            <span style={{ fontSize: 14, ...right }}>{e.races}</span>
            <span style={{ fontSize: 14, ...right }}>{e.wins}</span>
            <span style={{ fontSize: 14, ...right }}>{fmtCost(e.avgCostUsd)}</span>
            <span style={{ fontSize: 14, ...right }}>{fmtClock(e.avgDurationMs)}</span>
            <Sparkline values={e.history.map((h) => h.rating)} color={DRIVER_META[e.driver].color} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

- [~] **Step 2: Plumb the data** (`data.ts` `useLadder` + `App.tsx` done; `export.ts` and `server.ts` do not exist yet -- finish in Tasks 26 and 28)

`export.ts`: `Bootstrap` static variant becomes `{ mode: 'static'; events: RaceEvent[]; ladder?: Ladder }` and `exportRun` passes `ladder: readLadder(repoRoot)`. `server.ts`: add `GET /ladder.json` → `Response.json(readLadder(o.repoRoot))`. `data.ts`: mirror the type; add `useLadder(bootstrap, finished): Ladder | null` that returns `bootstrap.ladder ?? null` for static and fetches `/ladder.json` in an effect when `finished` is true for live. `App.tsx`: `<Ladder ladder={useLadder(bootstrap, state.finished)} state={state} />`.

- [x] **Step 3: Typecheck, build, verify, commit** (verified against `standalone/Bakeoff Ladder.html` with a fixture harness; `bakeoff export` lands in Task 26)

```bash
bun test && bun run typecheck && bun run build:ui
# in scratch/: bun run /path/to/bakeoff/src/cli/index.ts export <id> && open .bakeoff/runs/<id>.html  # Ladder tab matches standalone/Bakeoff Ladder.html
git add -A && git commit -m "feat(ui): ladder screen from the design handoff"
```

---

### Task 32: README and packaging check

**Files:**
- Create: `README.md`, `docs/hero.gif` (from the day-7 recording), `LICENSE` (MIT)
- Modify: `package.json` (`repository`, `homepage`, `keywords`)

- [ ] **Step 1: Write README.md**

Sections, in order: one-line pitch and the hero GIF; install (`npm i -g bakeoff-cli` then `bakeoff doctor`); quickstart (5 lines: `cd repo`, `bakeoff init`, edit test command, `bakeoff run 123 --agents claude,codex`, look at the scoreboard); how scoring works (the table from SPEC.md section 4, shortened); tamper detection (the five rules); the ladder (one paragraph: OpenSkill, "Elo-style"); config reference (the YAML from SPEC.md section 2); "How is this different from Emdash / Conductor?" (three sentences from the product spec section 2); honest limits (agents can read disk; costs are estimates; CI churn); license.

- [ ] **Step 2: Build and pack check**

```bash
bun run build && ls -la dist/ && npm pack --dry-run 2>&1 | tail -20
cd "$(mktemp -d)" && npm i -g "$OLDPWD/$(cd "$OLDPWD" && npm pack 2>/dev/null | tail -1)" && bakeoff --version && bakeoff doctor; cd "$OLDPWD"
```

Expected: `dist/cli.js` and `dist/ui.html` in the tarball, fonts included, `bakeoff --version` prints 0.1.0 from a clean global install.

- [ ] **Step 3: Commit**

```bash
git add -A && git commit -m "docs: README as landing page; packaging verified"
```

---

# Day 9: CI polling, merge, hidden tests end-to-end

### Task 33: CI checks component

**Files:**
- Create: `src/core/scorer/ci.ts`, `test/core/scorer/ci.test.ts`
- Modify: `src/core/race.ts` (after publish and before scoring, when `configured.ci`: await `ciComponent`, splice into the score in `scoreAgent` via `ScoreCtx.ci: ScoreComponent | null`), `src/core/scorer/index.ts` (use `ctx.ci` instead of the placeholder)

**Interfaces:**
- Produces: `ciComponent(o: { repo; prNumber; timeoutMs; intervalMs?; run?; sleep? }): Promise<ScoreComponent>` polling `gh pr checks <n> -R owner/name --json name,state,bucket`.

- [ ] **Step 1: Write the failing test**

```ts
// test/core/scorer/ci.test.ts
import { describe, expect, it } from 'vitest';
import { ciComponent } from '../../../src/core/scorer/ci';
import { fakeExec } from '../../helpers/exec';

const repo = { owner: 'a', name: 'b' };
describe('ciComponent', () => {
  it('awards 10 when all checks pass', async () => {
    const { run } = fakeExec([[/gh pr checks 5/, { stdout: JSON.stringify([{ name: 'test', state: 'SUCCESS', bucket: 'pass' }]) }]]);
    const c = await ciComponent({ repo, prNumber: 5, timeoutMs: 1000, intervalMs: 1, run, sleep: async () => {} });
    expect(c).toMatchObject({ id: 'ci', max: 10, awarded: 10, detail: '1/1 checks passed' });
  });
  it('awards 0 on failure and n/a when the repo has no checks', async () => {
    const fail = fakeExec([[/gh pr checks/, { stdout: JSON.stringify([{ name: 't', state: 'FAILURE', bucket: 'fail' }]) }]]).run;
    expect((await ciComponent({ repo, prNumber: 1, timeoutMs: 10, intervalMs: 1, run: fail, sleep: async () => {} })).awarded).toBe(0);
    const none = fakeExec([[/gh pr checks/, { code: 1, stderr: 'no checks reported on the \'x\' branch' }]]).run;
    expect((await ciComponent({ repo, prNumber: 1, timeoutMs: 10, intervalMs: 1, run: none, sleep: async () => {} })).awarded).toBeNull();
  });
  it('times out while pending', async () => {
    let t = 0;
    const { run } = fakeExec([[/gh pr checks/, { stdout: JSON.stringify([{ name: 't', state: 'PENDING', bucket: 'pending' }]) }]]);
    const c = await ciComponent({ repo, prNumber: 1, timeoutMs: 30, intervalMs: 10, run, sleep: async (ms) => { t += ms; }, now: () => t });
    expect(c.awarded).toBe(0); expect(c.detail).toContain('timed out');
  });
});
```

- [ ] **Step 2: Run to verify failure, then write ci.ts**

```ts
// src/core/scorer/ci.ts
import { z } from 'zod';
import type { ScoreComponent } from '@contract';
import { exec, type Exec } from '../exec';

const Checks = z.array(z.object({ name: z.string(), state: z.string(), bucket: z.string().optional() }));

export async function ciComponent(o: { repo: { owner: string; name: string }; prNumber: number; timeoutMs: number; intervalMs?: number; run?: Exec; sleep?: (ms: number) => Promise<void>; now?: () => number }): Promise<ScoreComponent> {
  const run = o.run ?? exec, sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms))), now = o.now ?? Date.now, interval = o.intervalMs ?? 15_000;
  const start = now();
  while (true) {
    const r = await run('gh', ['pr', 'checks', String(o.prNumber), '-R', `${o.repo.owner}/${o.repo.name}`, '--json', 'name,state,bucket']);
    if (r.code !== 0 && /no checks/i.test(r.stderr + r.stdout)) return { id: 'ci', max: 10, awarded: null, detail: 'no checks on this repo' };
    const checks = r.code === 0 ? Checks.safeParse(JSON.parse(r.stdout || '[]')) : null;
    const list = checks?.success ? checks.data : [];
    if (list.length === 0 && r.code === 0) return { id: 'ci', max: 10, awarded: null, detail: 'no checks on this repo' };
    const failed = list.filter((c) => /fail|error|cancel|timed_out/i.test(c.bucket ?? c.state));
    const pending = list.filter((c) => /pending|queued|in_progress|expected/i.test(c.bucket ?? c.state));
    if (failed.length) return { id: 'ci', max: 10, awarded: 0, detail: `${failed.length}/${list.length} checks failed (${failed[0]!.name})` };
    if (!pending.length && list.length) return { id: 'ci', max: 10, awarded: 10, detail: `${list.length}/${list.length} checks passed` };
    if (now() - start >= o.timeoutMs) return { id: 'ci', max: 10, awarded: 0, detail: `timed out with ${pending.length} pending` };
    await sleep(interval);
  }
}
```

Wire: `ScoreCtx` gains `ci: ScoreComponent | null`; `runOne` computes `ci = configured.ci && out.prNumber ? await ciComponent({ repo, prNumber: out.prNumber, timeoutMs: parseDuration(config.ci_timeout) }) : null` and passes it; `scoreAgent` uses `ctx.ci ?? { id: 'ci', max: 10, awarded: null, detail: 'n/a' }`.

- [ ] **Step 3: Run tests, add a workflow to scratch, race, commit**

```bash
bun test && bun run typecheck
# in scratch/: mkdir -p .github/workflows && printf 'on: [pull_request]\njobs:\n  test:\n    runs-on: ubuntu-latest\n    steps:\n      - uses: actions/checkout@v4\n      - uses: oven-sh/setup-bun@v2\n      - run: bun test\n' > .github/workflows/ci.yml && git add -A && git commit -m "ci" && git push
# then: bun run /path/to/bakeoff/src/cli/index.ts run 1 --agents claude,codex   # CI column fills in
git add -A && git commit -m "feat(scorer): CI checks component via gh pr checks"
```

---

### Task 34: `bakeoff merge <id>`

**Files:**
- Create: `src/cli/commands/merge.ts`, `test/cli/merge.test.ts`
- Modify: `src/cli/index.ts`

**Interfaces:**
- Produces: `mergePlan(rec: RunRecord): { winner: AgentResult; losers: AgentResult[] }` (throws when no winner or winner has no PR), `mergeCommand(id, opts: { yes?: boolean })`: confirms with clack, `gh pr merge <n> --squash --delete-branch`, then for each loser with a PR `gh pr close <n> --comment "<scoreboard link + rank>" --delete-branch`.

- [ ] **Step 1: Write the failing test**

```ts
// test/cli/merge.test.ts
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { mergePlan, runMergePlan } from '../../src/cli/commands/merge';
import { RunRecordSchema } from '../../src/contract/schema';
import { fakeExec } from '../helpers/exec';

const rec = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));
describe('merge', () => {
  it('plans winner + losers with PRs', () => {
    const p = mergePlan(rec);
    expect(p.winner.driver).toBe('claude');
    expect(p.losers.map((l) => l.driver)).toEqual(['codex']);
  });
  it('merges the winner and closes losers with a comment', async () => {
    const { run, calls } = fakeExec([[/gh pr merge 12/, {}], [/gh pr close 13/, {}]]);
    await runMergePlan(mergePlan(rec), rec, run);
    expect(calls[0]).toMatch(/^gh pr merge 12 -R bakeoff-dev\/scratch --squash --delete-branch/);
    expect(calls[1]).toMatch(/^gh pr close 13 .*--comment .*ranked #2/);
  });
});
```

- [ ] **Step 2: Run to verify failure, then write merge.ts**

```ts
// src/cli/commands/merge.ts
import * as p from '@clack/prompts';
import type { AgentResult, RunRecord } from '@contract';
import { exec, must, type Exec } from '../../core/exec';
import { readRun } from '../../core/store';

export function mergePlan(rec: RunRecord): { winner: AgentResult; losers: AgentResult[] } {
  const winner = rec.agents.find((a) => a.rank === 1);
  if (!winner || !winner.prNumber) throw new Error('No winner with an open PR in this run');
  return { winner, losers: rec.agents.filter((a) => a !== winner && a.prNumber !== null) };
}
export async function runMergePlan(plan: ReturnType<typeof mergePlan>, rec: RunRecord, run: Exec = exec): Promise<void> {
  const R = `${rec.repo.owner}/${rec.repo.name}`;
  await must('gh', ['pr', 'merge', String(plan.winner.prNumber), '-R', R, '--squash', '--delete-branch'], {}, run);
  for (const l of plan.losers) {
    const body = `Closed by Bakeoff: ${l.driver} ranked #${l.rank ?? '-'} (${l.score?.total ?? 0}/${l.score?.maxPossible ?? 0}) in run ${rec.id}; ${plan.winner.driver}'s PR #${plan.winner.prNumber} was merged. Scoreboard: .bakeoff/runs/${rec.id}.html`;
    await must('gh', ['pr', 'close', String(l.prNumber), '-R', R, '--comment', body, '--delete-branch'], {}, run);
  }
}
export async function mergeCommand(id: string, opts: { yes?: boolean }): Promise<void> {
  const root = await must('git', ['rev-parse', '--show-toplevel']);
  const rec = readRun(root, id);
  const plan = mergePlan(rec);
  p.intro(`merge run ${id}`);
  p.log.info(`Merge ${plan.winner.driver}'s PR #${plan.winner.prNumber}; close ${plan.losers.map((l) => `#${l.prNumber}`).join(', ') || 'nothing'}.`);
  if (!opts.yes) { const ok = await p.confirm({ message: 'Proceed?' }); if (p.isCancel(ok) || !ok) { p.cancel('Aborted.'); return; } }
  await runMergePlan(plan, rec);
  p.outro('Merged.');
}
```

Register `program.command('merge <id>').option('-y, --yes').action(mergeCommand)`.

- [ ] **Step 3: Run tests, commit**

```bash
bun test && bun run typecheck && git add -A && git commit -m "feat(cli): merge winner, close losers with scoreboard comment"
```

---

### Task 35: Hidden tests end-to-end on scratch

No new code unless it breaks. This proves SPEC.md section 1's hidden-test policy.

- [ ] **Step 1: Configure hidden tests on scratch**

```bash
# in scratch/
mkdir -p .bakeoff/hidden && cat > .bakeoff/hidden/paginate.hidden.test.ts <<'EOF'
import { expect, test } from 'bun:test';
import { paginate } from '../../paginate';
test('last page is short', () => { expect(paginate([1,2,3,4,5], 3, 2)).toEqual([5]); });
test('page past end is empty', () => { expect(paginate([1,2,3], 5, 2)).toEqual([]); });
EOF
cat >> bakeoff.yml <<'EOF'
hidden_tests:
  dest: tests/hidden
  command: bun test tests/hidden
EOF
grep -q '.bakeoff/hidden/' .gitignore && git add -A && git commit -m "hidden tests config" && git push
bun run /path/to/bakeoff/src/cli/index.ts run 1 --agents claude,codex --keep-worktrees
```

- [ ] **Step 2: Verify the policy**

```bash
ls "$TMPDIR/bakeoff/<runId>/claude/.bakeoff" 2>&1   # expected: No such file or directory
grep -c hidden .bakeoff/logs/<runId>/claude.log       # agent never mentions the hidden dir (0), or investigate
jq '.agents[] | {driver, hidden: (.score.components[] | select(.id=="hidden_tests"))}' .bakeoff/runs/<runId>.json
```

Expected: visible tests max 30, hidden max 20 awarded 20 or 0, and `git status` in scratch shows `.bakeoff/hidden` untracked-ignored. Fix anything that leaks, add a regression test in `test/core/worktree.test.ts` if it was the worktree, then commit.

```bash
git add -A && git commit -m "test: hidden tests verified end-to-end"
```

---

# Cut-able tail (only if day 9 finishes early)

### Task 36: Blind LLM judge (off by default)

**Files:**
- Create: `src/core/scorer/judge.ts`, `test/core/scorer/judge.test.ts`
- Modify: `src/core/scorer/index.ts` (`finalizeScores` accepts an optional `judgeScores: Map<DriverId, ScoreComponent>`), `src/core/race.ts` (after all agents finish and before finalize, when `config.judge.enabled`, call `judgeDiffs`)

**Interfaces:**
- Produces: `anonymize(diffs: { driver: DriverId; diff: string }[]): { letters: Record<string, DriverId>; prompt: string }` (shuffled with an injectable rng, labeled A/B/C), `parseJudgeReply(text): Record<string, { score: number; reason: string }>` (expects one JSON object), `judgeDiffs(o: { diffs; model; run?: Exec }): Promise<Map<DriverId, ScoreComponent>>` calling `claude -p --model <model> --output-format json` with the prompt and reading `result`.

- [ ] **Step 1: Write the failing test**

```ts
// test/core/scorer/judge.test.ts
import { describe, expect, it } from 'vitest';
import { anonymize, parseJudgeReply } from '../../../src/core/scorer/judge';

describe('judge', () => {
  it('anonymizes deterministically with an injected rng and never leaks driver names', () => {
    const a = anonymize([{ driver: 'claude', diff: '+1' }, { driver: 'codex', diff: '+2' }], () => 0.9);
    expect(Object.keys(a.letters).sort()).toEqual(['A', 'B']);
    expect(a.prompt).not.toMatch(/claude|codex/i);
    expect(a.prompt).toContain('### Diff A');
  });
  it('parses the reply and clamps to 0-15', () => {
    const r = parseJudgeReply('Here you go:\n{"A":{"score":19,"reason":"great"},"B":{"score":-2,"reason":"meh"}}');
    expect(r.A!.score).toBe(15); expect(r.B!.score).toBe(0);
    expect(parseJudgeReply('nope')).toEqual({});
  });
});
```

- [ ] **Step 2: Run to verify failure, then write judge.ts**

```ts
// src/core/scorer/judge.ts
import type { DriverId, ScoreComponent } from '@contract';
import { exec, type Exec } from '../exec';

export function anonymize(diffs: { driver: DriverId; diff: string }[], rng: () => number = Math.random): { letters: Record<string, DriverId>; prompt: string } {
  const order = [...diffs].sort(() => rng() - 0.5);
  const letters: Record<string, DriverId> = {};
  const sections = order.map((d, i) => { const L = String.fromCharCode(65 + i); letters[L] = d.driver; return `### Diff ${L}\n\`\`\`diff\n${d.diff.slice(0, 40_000)}\n\`\`\``; });
  const prompt = [
    'You are judging competing pull requests for the same issue. Score each diff from 0 to 15 on correctness, minimality, and code quality. Do not reward volume.',
    'Reply with ONLY a JSON object of the form {"A":{"score":n,"reason":"one line"},"B":{...}}.',
    ...sections,
  ].join('\n\n');
  return { letters, prompt };
}
export function parseJudgeReply(text: string): Record<string, { score: number; reason: string }> {
  const m = /\{[\s\S]*\}/.exec(text);
  if (!m) return {};
  try {
    const j = JSON.parse(m[0]) as Record<string, { score?: unknown; reason?: unknown }>;
    const out: Record<string, { score: number; reason: string }> = {};
    for (const [k, v] of Object.entries(j)) out[k] = { score: Math.max(0, Math.min(15, Number(v?.score) || 0)), reason: typeof v?.reason === 'string' ? v.reason : '' };
    return out;
  } catch { return {}; }
}
export async function judgeDiffs(o: { diffs: { driver: DriverId; diff: string }[]; model: string; run?: Exec }): Promise<Map<DriverId, ScoreComponent>> {
  const run = o.run ?? exec;
  const { letters, prompt } = anonymize(o.diffs);
  const r = await run('claude', ['-p', '--model', o.model, '--output-format', 'json', '--max-budget-usd', '1'], { stdin: prompt });
  const out = new Map<DriverId, ScoreComponent>();
  let text = '';
  try { text = String((JSON.parse(r.stdout) as { result?: unknown }).result ?? ''); } catch { text = r.stdout; }
  const parsed = parseJudgeReply(text);
  for (const [L, driver] of Object.entries(letters)) {
    const s = parsed[L];
    out.set(driver, { id: 'judge', max: 15, awarded: s ? s.score : null, detail: s ? `subjective: ${s.reason}` : 'judge gave no answer' });
  }
  return out;
}
```

Diffs come from `git diff <baseSha>` in each kept worktree before removal; `runOne` must capture `diffText` when `config.judge.enabled` and hand it to the race-level judge call before `finalize`. Prefix every judge detail with `subjective:` so the UI can style it.

- [ ] **Step 3: Run tests, commit**

```bash
bun test && bun run typecheck && git add -A && git commit -m "feat(scorer): blind LLM judge, off by default"
```

---

# Days 10-14 (no code tasks; from the product spec)

- Day 10-11: fork 2-3 popular OSS repos, race 10 real issues with `--agents claude,codex,opencode`, budget ~$60. Collect `.bakeoff/runs/*.json`, write up the numbers. Fix whatever breaks; each fix is a test + commit.
- Day 12: Show HN 8-11am ET with the scoreboard PNG; X thread.
- Day 13: Reddit data post.
- Day 14: merge external PRs, recap.

---

## Self-review against SPEC.md

- **Section 1 naming**: Task 1 (`names.ts`), Task 15 (`init` gitignores hidden and logs). Package name `bakeoff-cli`, bin `bakeoff`: Task 1.
- **Section 2 config**: Task 4. `ci_timeout: 0` disables CI: Task 4 `configuredFlags` and Task 33.
- **Section 3 run flow**: preflight doctor Task 15, issue resolve Task 6, baseline Task 17 + 22, packet Task 7, worktree with `.bakeoff` stripped Task 10, publish Task 13, orchestration Task 14, issue picker Task 15, `--keep-worktrees` Task 14/15.
- **Section 4 scoring**: tests Task 18, hidden Task 18, typecheck/lint Task 19, CI Task 33, diff with zero guard Task 20, tamper rules 1-5 Task 21, judge Task 36, crash/timeout exclusion Task 22 (`rankAgents`) and Task 30, tiebreak Task 22, n/a rendering Task 23 (`-`/`n/a`) and Task 25 (grey segment), baseline banner Task 23 + 25.
- **Section 5 packet**: Task 7; no per-agent strings, verified by test.
- **Section 6 contract**: Task 2 + 3.
- **Section 7 ladder**: Task 30 (`displayRating`, exclusion, history on non-rated runs, idempotency).
- **Section 8 drivers + budget**: meter Task 8, pricing Task 9, Claude Task 12 (also `--max-budget-usd`), Codex Task 16, OpenCode Task 24, unknown model → null cost Task 8/9, `maxTurns` ignored for Claude Task 12.
- **Section 9 process**: Task 8 (detached, SIGTERM then SIGKILL after 10s, `budget_exceeded`, `aborted`).
- **Section 10 CLI/UI/outputs**: `run/doctor/init` Task 11/15, `share` Task 27, `ladder` Task 30, `merge` Task 34, `export` Task 26, server Task 28, Race screen Task 29, Scoreboard Task 25, Ladder screen Task 31, card Task 27, terminal live view Task 15 and final table Task 23 (both per `design/TERMINAL.md`), copy-markdown Task 25.
- **Section 11 testing**: fixture repos helper Task 10; every task carries its tests.
- **Section 12 cut order**: judge (36), merge (34), replay (not planned; cut pre-emptively), ladder screen (31), race view (28-29), OpenCode (24), hidden tests (18/35), CI (33) are all separable tasks at the tail of their day.

UI styling: Tasks 25, 27, 29 and 31 carry inline style objects transcribed from the handoff markup; no Tailwind, no separate stylesheet, no emoji.

Type consistency checked: `ScoreCtx` fields (`worktree, repoRoot, baseSha, config, agent, hiddenDir, repo, baselineGreen, ci`) are introduced in Tasks 14, 22, 33 in that order; `Bootstrap` is defined in `src/cli/export.ts` and mirrored in `ui/src/data.ts` (Task 25/26/31); `AbortRegistry` from Task 14 is what Task 28 consumes; `fmtCost`/`fmtDuration` exist separately in `src/cli/render/table.ts` and `ui/src/theme.ts` because the UI must not import from `src/cli`.
