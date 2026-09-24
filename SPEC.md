# Bakeoff v1 Spec

> Race coding agents on your real issues. Merge the winner.

Status: approved design, 2026-09-02. This file is the build contract: where anything else disagrees with it, this file wins.

## 0. Decisions already made (do not relitigate)

- TypeScript, shipped as an npm package that runs on **Node 22+**. Bun builds and tests it; users never need Bun. commander + @clack/prompts. Shell out to `git` and `gh`; no GitHub API client.
- Drivers in order: Claude Code, Codex, OpenCode. Gemini only if time allows.
- Deterministic scoring (section 4). Tamper penalty included. LLM judge off by default.
- Ratings: OpenSkill, marketed as "Elo-style".
- UI: local web UI served by the CLI (Vite + React, vite-plugin-singlefile; styling transcribed from the design handoff, Tailwind dropped 2026-09-02 because no component uses it). Static HTML export and a satori PNG card. No native app.
- Contract first: `src/contract/` (types, zod schemas, fixtures) lands before any UI or scorer code so they can proceed in parallel.
- Single package, not a monorepo.
- Live transport: SSE from CLI to browser, POST for the one browser-to-CLI command (abort).
- Hidden tests live outside every worktree and are copied in by the scorer after the agent exits.
- Day 2 "done" for the Claude driver: a real PR from one command on a scratch repo, run record on disk, parser fixture recorded.
- 2-week hard cap. Cut order in section 11.

## 1. Naming

| Thing | Value |
|---|---|
| Brand, repo, domain | Bakeoff |
| npm package | `bakeoff-cli` (`bakeoff` on npm is a dead backoff package, one release, 2022) |
| Binary | `bakeoff` via `"bin": { "bakeoff": "dist/cli.js" }` |
| GitHub org | `bakeoff-dev` (`BakeOff` is taken; `bakeoff-dev` verified free 2026-09-02) |
| Config file | `bakeoff.yml` at repo root |
| State dir | `.bakeoff/` at repo root |
| Branches | `bakeoff/<issue>-<driver>-<runId>` |
| PR labels | `bakeoff`, `bakeoff-run:<runId>` |
| Worktrees | `$TMPDIR/bakeoff/<runId>/<driver>` (never inside the repo) |
| Local UI port | 4141 |

Every string above lives in `src/core/names.ts`. A rename touches one file.

`.bakeoff/` contents and git policy:

| Path | Committed? | Purpose |
|---|---|---|
| `.bakeoff/runs/<id>.json` | yes | run record (section 6) |
| `.bakeoff/runs/<id>.events.jsonl` | yes | race event log, replayed by the static UI |
| `.bakeoff/runs/<id>.html` | yes | self-contained scoreboard |
| `.bakeoff/runs/<id>.png` | yes | share card |
| `.bakeoff/ladder.json` | yes | per-repo ratings |
| `.bakeoff/hidden/**` | **no** (gitignored) | held-out tests |
| `.bakeoff/logs/<id>/<driver>.log` | no (gitignored) | full agent session logs |

`bakeoff init` writes `bakeoff.yml` and appends `.bakeoff/hidden/` and `.bakeoff/logs/` to `.gitignore`.

## 2. Configuration: `bakeoff.yml`

```yaml
# all keys optional except one of test/lint/typecheck
test: bun test                # run from worktree root; exit 0 = green
lint: bun run lint
typecheck: bunx tsc --noEmit
test_paths: [test/, src/paginate.test.ts]  # directories or files, no globs; default: auto-detect
agents: [claude, codex, opencode]
budget_usd: 3.00
timeout: 20m
max_turns: 50                 # advisory; enforced only by drivers whose CLI supports it
ci_timeout: 10m               # how long to poll gh pr checks; 0 disables CI scoring
hidden_tests:
  source: .bakeoff/hidden     # relative to repo root; must be gitignored
  dest: tests/hidden          # relative to worktree root; copied in after agent exit
  command: bun test tests/hidden
judge:
  enabled: false
  model: claude-sonnet-5
```

Parsed with zod in `src/core/config.ts`. Unknown keys are an error. Durations accept `20m`, `90s`, `1h`.

## 3. Run flow

```
bakeoff run owner/repo#123 --agents claude,codex --budget 3 --timeout 20m [--watch]

preflight
  doctor: each requested driver binary found + auth ok, gh auth ok, git clean
  resolve issue via gh issue view --json
  detect repo: owner/name, default branch, base sha (origin/<default>)
  baseline: run test/lint/typecheck on a clean worktree of base sha
            record {testsGreen, lintGreen, typecheckGreen} in the run
            if testsGreen === false: warn loudly, continue
  build task packet (section 5) and sha256 it
  write .bakeoff/runs/<id>.json (status: running) and open events.jsonl

per agent, in parallel
  worktree: git worktree add $TMPDIR/bakeoff/<id>/<driver> -b bakeoff/<issue>-<driver>-<id> <baseSha>
            then rm -rf <worktree>/.bakeoff   (hidden tests must not be reachable)
  driver.launch(...)  emits AgentEvents; process group killed on timeout or budget
  publish: git add -A && git commit (if dirty) ; git push -u origin <branch>
           gh pr create --title "<issue title> (<driver>)" --body <scoreboard link + packet hash>
           gh pr edit --add-label bakeoff --add-label bakeoff-run:<id>
  score: section 4 (per-agent parts now; diff discipline after all finish)

after all agents
  diff discipline, ranks, tiebreaks, winner
  ladder update (section 7)
  write final run json, events.jsonl race.finished, <id>.html
  terminal scoreboard; open browser if --watch
  worktrees removed unless --keep-worktrees
```

Bakeoff, not the agent, pushes and opens the PR. The packet tells the agent to commit as it goes and never push. Anything left uncommitted is committed by bakeoff as `bakeoff: final state (<driver>)`.

`bakeoff run` with no issue argument lists open issues via `gh issue list --json` in a clack select.

## 4. Scoring

Max possible without judge: 100. With judge: 115. Penalties can push a total below 0; clamp at 0 for display, keep the raw value in the record.

| id | Max | Rule |
|---|---|---|
| `visible_tests` | 50, or 30 when hidden tests configured | Restore `test_paths` from base sha inside the worktree, run `test`. Exit 0 = full points, else 0. Per-test counts parsed best-effort (vitest, jest, bun test, pytest, go test) for the receipts row only; never used for points. |
| `hidden_tests` | 20 | Copy `<repo>/.bakeoff/hidden/**` to `<worktree>/<dest>`, run `command`. Exit 0 = 20, else 0. n/a when not configured. |
| `typecheck` | 7.5 (15 if lint unconfigured) | Exit 0 of `typecheck`. n/a when unconfigured. |
| `lint` | 7.5 (15 if typecheck unconfigured) | Exit 0 of `lint`. n/a when unconfigured. |
| `ci` | 10 | `gh pr checks <pr> --json` polled every 15s up to `ci_timeout`. All checks passing = 10. Any failure = 0. Still pending at timeout = 0 with detail "timed out". n/a when the repo has no checks or `ci_timeout: 0`. |
| `diff` | 10 | Over agents with status `ok`. **Test files and documentation are excluded from both halves.** A test is a file matching the shared `TEST_FILE_NAME` rule or sitting under one of the run's test paths; documentation is `*.md`, `*.mdx`, `*.rst`, or anything under a `docs/` directory. `L` = the remaining lines added + removed, `M` = median of L across finishers. Files touched for the scope term counts the same remainder. Updating the docs alongside a fix is what a good change looks like -- es-toolkit's own upstream fixes edit four locales -- so charging for it would reward an agent that skips it. Size = 6 × min(1, M / L). Scope = 4 × (files in consensus set / files touched), consensus set = files touched by at least half the finishers. **L = 0 or files touched = 0 gives 0 for the whole component.** Single finisher gets 10 unless L = 0. |
| `judge` | 15 | Off by default. Diffs anonymized as A/B/C, prompt asks for a 0-15 score per entry with one-line reasons. Labeled "subjective" everywhere it renders. n/a when disabled. |
| tamper | −25 | Any flag (below) subtracts 25 once. Flags are listed on the card as red flags with the matched rule and file. |

**No acceptance test.** When `hidden_tests` is not configured and the visible suite is
already green at the base commit, nothing in the run can tell whether the issue was solved:
every component only shows that nothing broke. The run record carries `noAcceptanceTest:
true` and the CLI says so in the preflight and above the final table, in these words:

> No test checks this issue. Scores show nothing broke, not that the issue was solved.

Tamper rules, evaluated on `git diff <baseSha>..HEAD` of the agent branch plus untracked files:

1. `test_deleted`: a file matching `test_paths` deleted or renamed away.
2. `test_skipped`: added lines in test files matching `\.(skip|only)\(`, `\bx(it|describe|test)\(`, `@pytest\.mark\.skip`, `pytest\.skip\(`, `@Ignore`, `@Disabled`, `t\.Skip\(`, `unittest\.skip`.
3. `asserts_weakened`: count of assertion tokens (`expect(`, `assert `, `assert(`, `assert.`, `should.`, `t.Error`, `require.`) in test files decreased between base and HEAD.
4. `config_write`: any change to `conftest.py`, `pytest.ini`, `setup.cfg`, `pyproject.toml`, `tox.ini`, `vitest.config.*`, `jest.config.*`, `bunfig.toml`, `package.json` scripts `test`/`lint`/`typecheck`, `.github/workflows/**`, `bakeoff.yml`, `tsconfig*.json`, `.eslintrc*`, `eslint.config.*`, `biome.json`.
5. `hidden_path_write`: any file under `hidden_tests.dest` exists on the agent branch.

Unconfigured components render **grey "n/a" with the max shown**, e.g. `CI n/a /10`, never a red 0. The total's denominator on the card is the sum of configured maxes.

Status `timeout`, `crashed`, or `budget_exceeded`: total 0, no components run, log tail (last 40 lines) recorded, excluded from the ladder update, still shown on the scoreboard in its lane.

Ranking: total desc, then cost asc (null cost sorts last), then duration asc.

Baseline warning: when `baseline.testsGreen === false`, the scoreboard shows a yellow banner "Tests were already failing on <baseSha>" and the visible-tests component shows detail "baseline red".

## 5. Task packet

Markdown, built by `src/core/packet.ts`, identical bytes for every agent in a run:

```
# Task
<issue title>

## Issue #<n> (<url>)
<issue body>

## Comments
<author>: <body>   (each, oldest first; omitted if none)

## Repository guidance
<contents of AGENTS.md, then CLAUDE.md, if present at repo root>

## How to verify
Run: `<test command>`
(also lint / typecheck lines when configured)

## Rules
- Work only in this directory. It is a git worktree on its own branch.
- Commit as you go with clear messages. Do NOT push, do NOT open a pull request.
- Do not modify or delete existing tests, test configuration, or CI files. Add new tests if useful.
- When finished, stop. A pull request will be opened for you.
```

`packetHash` = sha256 of the exact bytes. Nothing per-agent (branch, driver name) appears in the packet, so every agent in a run shares the hash.

## 6. Contract: `src/contract/`

Types plus zod schemas. `fixtures/run.json` and `fixtures/events.jsonl` are hand-written first and validated by a test; the UI, scorer, and card all build against them.

```ts
export const SCHEMA_VERSION = 1 as const;
export type DriverId = 'claude' | 'codex' | 'opencode' | 'gemini'; // gemini: schema slot only, no driver in v1
export type AgentStatus = 'running' | 'ok' | 'timeout' | 'crashed' | 'budget_exceeded';
export type ComponentId = 'visible_tests' | 'hidden_tests' | 'typecheck' | 'lint' | 'ci' | 'diff' | 'judge';

export interface TokenUsage { input: number; output: number; cacheRead: number; cacheWrite: number }
export interface Caps { budgetUsd: number; timeoutMs: number; maxTurns: number | null }

export interface ScoreComponent {
  id: ComponentId; max: number;
  awarded: number | null;        // null = n/a (unconfigured)
  detail: string;                // "312/312 passed", "timed out", "baseline red", "n/a"
}
export interface TamperFlag { rule: 'test_deleted'|'test_skipped'|'asserts_weakened'|'config_write'|'hidden_path_write'; file: string; detail: string }
export interface ScoreBreakdown {
  components: ScoreComponent[]; tamperFlags: TamperFlag[]; tamperPenalty: number;
  total: number;                 // raw, may be negative
  maxPossible: number;           // sum of configured maxes
}

export interface AgentResult {
  driver: DriverId; status: AgentStatus; branch: string;
  exitCode: number | null; durationMs: number;
  costUsd: number | null; tokens: TokenUsage | null;
  filesTouched: string[]; linesAdded: number; linesRemoved: number;
  prUrl: string | null; prNumber: number | null;
  score: ScoreBreakdown | null; rank: number | null;
  logTail: string;
}

export interface Baseline { testsGreen: boolean | null; lintGreen: boolean | null; typecheckGreen: boolean | null }

export interface RunRecord {
  schemaVersion: 1; id: string; createdAt: string; finishedAt: string | null;
  repo: { owner: string; name: string; defaultBranch: string; baseSha: string };
  issue: { number: number; title: string; url: string };
  packetHash: string; caps: Caps; baseline: Baseline;
  configured: { test: boolean; lint: boolean; typecheck: boolean; hiddenTests: boolean; ci: boolean; judge: boolean };
  agents: AgentResult[]; winner: DriverId | null;
}

export type RaceEvent =
  | { type: 'race.started'; at: string; runId: string; issue: RunRecord['issue']; repo: RunRecord['repo']; agents: DriverId[]; caps: Caps; baseline: Baseline }
  | { type: 'agent.started'; at: string; driver: DriverId; branch: string }
  | { type: 'agent.progress'; at: string; driver: DriverId; costUsd: number | null; tokens: TokenUsage | null; lastAction: string; filesTouched: number }
  | { type: 'agent.exited'; at: string; driver: DriverId; status: AgentStatus; exitCode: number | null; durationMs: number; costUsd: number | null; tokens: TokenUsage | null }
  | { type: 'agent.pr_opened'; at: string; driver: DriverId; prUrl: string; prNumber: number }
  | { type: 'agent.scored'; at: string; driver: DriverId; score: ScoreBreakdown }
  | { type: 'race.finished'; at: string; record: RunRecord };

export interface LadderEntry {
  driver: DriverId; mu: number; sigma: number; rating: number; // rating = round(mu - 3*sigma scaled, section 7)
  races: number; wins: number; avgCostUsd: number | null; avgDurationMs: number;
  history: { runId: string; at: string; rating: number }[];
}
export interface Ladder { schemaVersion: 1; entries: Partial<Record<DriverId, LadderEntry>> }
```

The UI consumes only `RaceEvent[]`. Static export embeds `{ mode: 'static', events }`; live mode reads `/events`. One reducer, `applyEvent(state, event)`, in `src/contract/reducer.ts`, shared by the UI and the terminal renderer.

## 7. Ladder

`openskill` (v5). Each run is one free-for-all match among agents with status `ok`. `rate(teams, { rank })` with one agent per team. Displayed rating = `round(1000 + 40 * (mu - 3 * sigma))` so new agents start near 1000 and it reads as Elo. `wins` increments for rank 1. `avgCostUsd` ignores null costs. A run with fewer than two `ok` agents does not change ratings but still appends to `history` with the unchanged rating.

## 8. Drivers

```ts
export interface DriverDoctor { found: boolean; version: string | null; authOk: boolean; notes: string[] }
export interface LaunchInput {
  packet: string; packetPath: string; worktree: string; branch: string;
  caps: Caps; meter: BudgetMeter; onEvent: (e: AgentEvent) => void; signal: AbortSignal;
  logPath: string;
}
export type AgentEvent =
  | { kind: 'action'; text: string }                      // one-line "Edit src/foo.ts"
  | { kind: 'usage'; tokens: TokenUsage; model: string }  // cumulative or delta per driver, normalized by the driver
  | { kind: 'cost'; costUsd: number }                     // when the CLI reports it directly
  | { kind: 'file'; path: string };
export interface LaunchResult {
  exitCode: number | null; status: Exclude<AgentStatus, 'running'>;
  tokens: TokenUsage | null; costUsd: number | null; durationMs: number; raw: unknown;
}
export interface Driver {
  id: DriverId; displayName: string; color: string;
  doctor(): Promise<DriverDoctor>;
  launch(input: LaunchInput): Promise<LaunchResult>;
}
```

Budget enforcement is uniform and lives in `src/core/budget.ts` + `src/core/process.ts`, not in each driver:

- `BudgetMeter` holds `capUsd`, accumulates `costUsd` from `usage` events via `src/core/pricing.ts` (per-model USD per million tokens, cache reads and writes priced separately) or from `cost` events when the CLI reports cost directly. `meter.exceeded` flips true when `costUsd >= capUsd`.
- `runProcess` (section 9) takes the meter; when it flips, the process group gets SIGTERM, and the result status is `budget_exceeded`.
- Claude additionally receives `--max-budget-usd` as a belt-and-braces cap. Codex and OpenCode have no native cap and rely on the meter.
- Unknown model in the pricing table: cost stays `null`, the meter never trips, and the run shows "cost unavailable" plus a doctor warning. Timeout still applies.

Per driver (flags verified against installed versions where possible; re-verify in `doctor` by parsing `--help`):

**Claude Code** (verified 2.1.259): `claude -p --output-format stream-json --verbose --permission-mode acceptEdits --max-budget-usd <cap> --add-dir <worktree>` run with `cwd = worktree`, packet on stdin. `--max-turns` no longer exists in 2.1.259; `maxTurns` is ignored for Claude. Parse JSONL: `assistant` messages with `tool_use` blocks become `action` events (`Edit path`, `Bash cmd`), `usage` fields become `usage` events, the terminal `result` message provides `total_cost_usd`, `usage`, `duration_ms`, `is_error`. SIGTERM exits 143. `--bare` is used when `BAKEOFF_BARE=1` and `ANTHROPIC_API_KEY` is set.

**Codex** (`@openai/codex` 0.153.0 on npm, not installed locally yet): `codex exec --json --full-auto --ephemeral --skip-git-repo-check -C <worktree> -` with the packet on stdin. JSONL events on stdout; token usage events feed the meter; cost from the pricing table.

**OpenCode** (`opencode-ai` 1.18.27 on npm, not installed locally yet): `opencode run --format json` if available (feature-detected from `--help`), else plain output with usage read from `opencode stats` / the session store after exit. Cost `null` on custom providers.

## 9. Process control: `src/core/process.ts`

```ts
export interface RunProcessInput {
  cmd: string; args: string[]; cwd: string; env?: Record<string, string>;
  stdin?: string; timeoutMs: number; signal?: AbortSignal; meter?: BudgetMeter;
  onStdoutLine?: (line: string) => void; onStderrLine?: (line: string) => void;
  logPath?: string;   // every stdout/stderr line appended
}
export interface RunProcessResult { exitCode: number | null; status: 'ok' | 'timeout' | 'budget_exceeded' | 'aborted' | 'crashed'; durationMs: number }
```

Spawned detached (own process group). On timeout, budget trip, or abort: `kill(-pid, SIGTERM)`, wait 10s, `kill(-pid, SIGKILL)`. `crashed` = non-zero exit not caused by us. Every driver goes through this function; no driver spawns on its own.

## 10. CLI, UI, outputs

Commands (v1): `run`, `doctor`, `init`, `share <id>`, `ladder`, `export <id>`. Cut from v1: `replay <id>`, `merge <id>`.

`run --watch` starts a `node:http` server on 127.0.0.1, on the first free port from 4141, guarded by a per-run token that the opened URL carries: `GET /` serves `dist/ui.html` with `{mode:'live'}` injected, `GET /events` is SSE replaying `events.jsonl` then tailing it, `GET /ladder.json` returns the ladder, and `POST /abort/:driver` aborts one agent. Every endpoint but `/` rejects a missing or wrong token. Opens the browser.

Static export: `dist/ui.html` with `<script type="application/json" id="bakeoff-data">` containing `{mode:'static', events}` injected before `</head>`. Written to `.bakeoff/runs/<id>.html`.

Screens: Race (live lanes: driver, timer, spend bar cost/budget, tokens, files touched, last action, status pill, log drawer), Scoreboard (winner surface + others column, breakdown bars with a penalty zone and dashed n/a segments, receipts row, Share card and Copy results buttons), Ladder (table + rating sparkline, empty state). No emoji anywhere; text and color only.

Share card: satori + `@resvg/resvg-js`, 1200×630, podium, totals, cost, issue title, tamper flags if any. `bakeoff share <id>` writes `.bakeoff/runs/<id>.png`.

### Visual design

The four screens are specified pixel-accurately in `design/handoff/design_handoff_bakeoff/README.md` with editable sources (`*.dc.html`) and offline copies (`standalone/*.html`). Tokens, type (Geist / Geist Mono), spacing, radii, copy and motion come from that README and win over any styling in PLAN.md. Its `fixture.json` is illustrative; `src/contract/fixtures/run.json` is the data contract. Agreed deviations from the handoff:

| Handoff | Bakeoff | Why |
|---|---|---|
| Score shown as `85 / 100` | `total / maxPossible` (e.g. `74.7 / 75`) | Unconfigured components must not read as lost points (decision above). Segment widths are `awarded / maxPossible` of the positive track. |
| One `lint` segment (15) | `typecheck` + `lint` rendered as one segment labeled `Lint & types`, width = sum of both awarded, max = sum of both maxes | The contract scores them separately; the UI merges for display only. |
| States: running / done / crashed | `timeout` and `budget_exceeded` use the crashed colors with their own label; `ok` renders as `Done` (or `PR open` when a PR exists) | Contract has five statuses. |
| Gemini CLI lane in fixtures | `gemini` exists in `DriverId` and the color map so the UI renders it; no driver ships in v1 | Keeps the schema stable when the driver lands. |
| Geist via Google Fonts | Same `<link>` in `ui/index.html`; static exports opened offline fall back to the system stack. The share card bundles Geist TTFs for satori. | Single-file export cannot embed a variable font cheaply. |
| Run id `r_7f3a` | `YYYYMMDD-xxxx` | Store decision. |
| No model shown | A muted 12-13px line under every agent name: the model id, `auto: <model>` where the provider routed it, `auto` where neither side named one. Race lanes, Scoreboard (winner, others, breakdown), Ladder and the share card. | The handoff predates model selection. An agent's score is meaningless without knowing which model earned it, and the ladder rates `driver:model` as one competitor. |
| Lane tokens `118k / 6.1k` read as raw input / output | The left number counts `input + cacheRead + cacheWrite` | Claude bills almost all of its context through the cache, so raw input alone leaves the lane at `0k` for a whole race. Matches `fmtTok` in `src/cli/render/style.ts`. |


Terminal: specified in `design/TERMINAL.md`. Live view is an in-place redraw (a plain ANSI cursor loop, no Ink): header line `bakeoff  owner/name #N  title`, `N of M running` with elapsed clock, one block per agent (colored `●`, name, status word, cost, 20-cell `▰▱` spend bar in the agent color, `$budget`, tokens, files, `PR #n`, dimmed last action on the second line). Final table is plain text: rank, name, total, cost, `m:ss`, tests, `+a -r`, files, PR, tamper flag in soft red; rank 1 in the winner's color; then `Scoreboard <path>` and `Ladder <ratings>` lines. Colors are truecolor with a 256-color fallback; `NO_COLOR` strips color; a non-TTY stdout gets only the final table. No emoji, no box drawing.

## 11. Testing

vitest. `test/` mirrors `src/`.

- Contract fixtures validated by zod; the reducer applied to `fixtures/events.jsonl` must equal `fixtures/run.json`'s agents.
- Driver parsers tested against recorded real envelopes in `test/fixtures/drivers/<driver>/`.
- Scorer tested against small git repos built in a temp dir by `test/helpers/repo.ts` (green repo, red-baseline repo, skipped-test repo, deleted-test repo, sprawling-diff repo).
- `process.ts` tested with a child that spawns a grandchild; after timeout neither pid exists.
- Budget meter tested with a fake driver emitting usage events until the cap trips.
- End-to-end is manual against a scratch GitHub repo (`bakeoff-dev/scratch`), documented in PLAN.md.

## 12. Cut order

Cannot cut: two drivers, scorer, run record, HTML scoreboard, share PNG. Cut in this order if v1 has to shrink: LLM judge, `merge`, `replay`, ladder screen (keep `ladder.json` + terminal table), race view (ship scoreboard-only UI), OpenCode driver, hidden tests, CI polling.

Cut from v1, in that order: the **LLM judge** (a judged score is not a deterministic one, which is the property the scoreboard sells), **`merge`** (`gh pr merge` already does it, and choosing what to merge stays the maintainer's call), **`replay`** (never planned), and the **OpenCode driver** (a slot in `DriverIdSchema` and a UI colour, no driver). Everything below them shipped: the ladder screen, the race view, hidden tests and CI polling are all in.

## 13. Known risks

- Driver flag churn: `doctor` parses `--help` and refuses to run with a driver whose required flags are missing. Pin tested versions in `names.ts` `TESTED_VERSIONS`.
- Codex and OpenCode are not installed on the build machine; day 3 and day 5 start with installs and fixture recording.
- Cost estimates are client-side; the card says "est." next to every dollar figure.
- Agents can read anything on disk. Hidden tests are unreachable by path from the worktree, not cryptographically hidden. Documented honestly in the README.
