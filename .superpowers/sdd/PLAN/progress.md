# PLAN progress ledger

Plan: `PLAN.md`. Branch: `t3code/70baae9b`. Worktree: `~/.t3/worktrees/bakeoff/t3code-70baae9b`.

Verification for every task: `bun run test && bun run typecheck` (never bare `bun test` — that
invokes Bun's native runner and bypasses the `@contract` alias in `vitest.config.ts`).
Single-file runs during TDD use `bunx vitest run <file>`.

## Status

| Task | Title | Commit | State |
|---|---|---|---|
| 1 | Scaffold the package | c2a372f | done |
| 2 | Contract schemas + run fixture | 2639ac2 | done |
| 3 | Reducer + events fixture | 1fa2bc2 | done |
| 4 | Config loader | (pending) | done |
| 5 | Store (.bakeoff layout, run ids, events) | (pending) | done |
| 6 | exec, repo detection, issue fetching | (pending) | done |
| 7 | Task packet builder | (pending) | done |
| 8 | Process control with group kill | (pending) | done |
| 9 | Pricing table | (pending) | done |
| 10 | Worktrees | (pending) | done |
| 11 | Driver interface, registry, doctor | (pending) | done |
| 12 | Claude Code driver | 4f94c2c | done |
| 13 | Publish (commit, push, PR) | 54e790b | done |
| 14 | Race orchestrator (no scoring) | d75bd65 | done |
| 15 | `run` + `init`, first real PR | (pending) | done |

Scope of the first session: Tasks 4-11, then push and open a PR (merged as #3).
Scope of this session: Tasks 12-15. Stop after Task 15.

## Notes

- This ledger did not exist when the session resumed; state for Tasks 1-3 was reconstructed
  from git history and the plan's checkboxes.
- Baseline at session start: 7 tests passing, typecheck clean, tree clean.

## Day-2 milestone (Task 15)

Real end-to-end race on `bakeoff-dev/scratch` issue #1, run `20260903-2s3b`:
Claude Code, status `ok`, $0.45, 43s, opened
[PR #2](https://github.com/bakeoff-dev/scratch/pull/2) with labels `bakeoff` and
`bakeoff-run:20260903-2s3b`. The diff touches only `paginate.ts`, which confirms the
`.bakeoff` sparse-checkout isolation: the agent's `git add -A` never staged the state dir.

Not verified: the live redraw was exercised only by unit tests. The milestone run happened in
a non-TTY shell, where `progressRenderer` correctly prints nothing. Needs a human eye in a
real terminal, along with the plan's screenshot.

## Deviations from PLAN.md

- **Task 10 / `src/core/exec.ts`**: the plan implements `exec` with `Bun.spawn`, but
  `bun run test` runs vitest under **Node**, where the `Bun` global does not exist.
  Tasks 4-9 never hit this because they all inject a fake `Exec`; Task 10's worktree test
  is the first to use the real one, and it failed with `ReferenceError: Bun is not defined`.
  Reimplemented on `node:child_process.spawn` (the exception CLAUDE.md already carves out
  for spawning) so one code path serves Bun at runtime and Node under test. A binary that
  cannot be spawned now resolves as code 127 with the reason on stderr rather than throwing,
  so `doctor` reports a missing CLI as a failed check instead of crashing.
- **Task 10 / `test/core/worktree.test.ts`**: the plan's `git ls-files -- .bakeoff` assertion
  (`.not.toContain('hidden')`) contradicts the two lines above it, which assert those same
  index entries exist and are tagged skip-worktree `S`. Keeping `.bakeoff` in the index is
  the entire point of the sparse-checkout approach. Replaced with the filesystem assertion
  that expresses the actual property: `.bakeoff/hidden/t.test.ts` does not exist on disk in
  the worktree. The plan's bogus `GIT_DIR` override was dropped with it.
- **Task 10 / `test/core/worktree.test.ts`**: added the missing `writeFileSync` import; the
  plan's snippet uses it without importing it.
- **Task 11 / `src/cli/commands/doctor.ts`**: `TESTED_VERSIONS[id]` does not typecheck --
  `DriverId` includes `gemini`, which has no entry (schema slot only, no driver in v1).
  Read through a `Partial<Record<DriverId, string>>` binding and only append the
  "tested with" note when a tested version is known.
- **Task 11 / `src/cli/commands/doctor.ts`**: wrapped `doctorReport` in try/catch so an
  unregistered driver prints one error line and exits 1, instead of surfacing as an
  unhandled promise rejection. Same exit code the plan expects before Task 12.

- **Task 12 / `doctor` auth probe**: the plan probes with `--max-budget-usd 0.05`. Opus bills
  roughly $0.21 for the system-prompt cache write before the first token, so the cap trips on
  turn one and the CLI returns `is_error: true`, `subtype: "error_max_budget_usd"`. The plan's
  parser read that as an auth failure and `doctor` reported Claude Code as broken when it was
  fine. Fixed two ways: the probe now pins `--model claude-haiku-4-5` (about $0.025 a run,
  matching the plan's "about one cent"), and `probeAuthOk` treats a budget stop as proof the
  API accepted us, since being billed can only happen after auth succeeds.

- **Task 14 / `runRace` worktree setup**: the plan creates every agent's worktree inside
  `Promise.all`. `git worktree add` and `sparse-checkout set` both write the shared
  `.git/config`, which git locks per repo, so concurrent agents fail with
  `could not lock config file`. Two of the four race tests passed by luck and the third
  caught it. Added a `serialQueue` so worktree add/remove queue while agent execution stays
  parallel, plus a regression test asserting those git calls never overlap (verified by
  reverting the fix and watching it fail).

- **Task 14 / test hygiene**: worktree paths are keyed by run id, so the plan's fixed
  `20260902-test` id collided across tests and left stale directories that broke later runs.
  Each test now gets its own run id.

- **Task 15 / milestone budget**: ran with `--budget 3` instead of the plan's `--budget 1`,
  since the measured Opus floor of ~$0.21 per turn made a $1 cap a real risk of tripping
  mid-fix. Actual spend was $0.45.

- **Task 15 / workspace trust**: the plan's Step 4a contingency was not needed. Headless
  `claude -p` in a fresh `$TMPDIR` git repo returned a clean JSON envelope and exit 0 with no
  trust prompt on 2.1.259. Recorded in CLAUDE.md under Driver notes.
