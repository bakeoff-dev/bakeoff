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
| 5 | Store (.bakeoff layout, run ids, events) | | pending |
| 6 | exec, repo detection, issue fetching | | pending |
| 7 | Task packet builder | | pending |
| 8 | Process control with group kill | | pending |
| 9 | Pricing table | | pending |
| 10 | Worktrees | | pending |
| 11 | Driver interface, registry, doctor | | pending |

Scope of this session: Tasks 4-11, then push and open a PR. Stop after Task 11.

## Notes

- This ledger did not exist when the session resumed; state for Tasks 1-3 was reconstructed
  from git history and the plan's checkboxes.
- Baseline at session start: 7 tests passing, typecheck clean, tree clean.
