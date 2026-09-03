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
| 11 | Driver interface, registry, doctor | | pending |

Scope of this session: Tasks 4-11, then push and open a PR. Stop after Task 11.

## Notes

- This ledger did not exist when the session resumed; state for Tasks 1-3 was reconstructed
  from git history and the plan's checkboxes.
- Baseline at session start: 7 tests passing, typecheck clean, tree clean.

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
