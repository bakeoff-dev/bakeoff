# Bakeoff

Race coding agents on your real GitHub issues, score the PRs deterministically, keep a per-repo Elo-style ladder.

Read `SPEC.md` before changing behavior. `PLAN.md` is the task list; tasks are checkboxes, keep them current.

## Stack

- Runtime: Bun >= 1.3. TypeScript strict, ESM only. No Node-only APIs unless Bun lacks them (`node:child_process` for detached spawn is the one exception).
- CLI: `commander` for commands, `@clack/prompts` for interaction. Entry `src/cli/index.ts`.
- Config: `bakeoff.yml` parsed with `yaml` + `zod`. Unknown keys fail.
- Git/GitHub: shell out to `git` and `gh` through `src/core/exec.ts`. Never call the GitHub REST API directly.
- Ratings: `openskill`. Displayed as "Elo-style".
- UI: `ui/` is Vite + React, built to one file with `vite-plugin-singlefile` into `dist/ui.html`. Styling is inline style objects transcribed from the design handoff plus a few global rules in `ui/index.html`; no Tailwind, no CSS modules. It imports `src/contract` via the `@contract` alias and nothing else from `src/`.
- Share card: `satori` + `@resvg/resvg-js`.
- Tests: `vitest`. `test/` mirrors `src/`. Fixture repos are built in temp dirs by `test/helpers/repo.ts`.

## Commands

```bash
bun install
bun test              # vitest run
bun run typecheck     # tsc --noEmit
bun run build         # ui + cli -> dist/
bun run dev -- run owner/repo#1 --agents claude   # run the CLI from source
```

## Layout

```
src/contract/   types, zod schemas, reducer, fixtures. The shared language. Change with care; bump SCHEMA_VERSION on breaking changes.
src/core/       everything that is not CLI or UI: config, exec, repo, issue, packet, process, budget, pricing, worktree, publish, race, ladder
src/core/drivers/   one file per agent CLI + types.ts + registry.ts
src/core/scorer/    one file per score component + tamper.ts + index.ts
src/cli/        commander commands, terminal rendering, the Bun.serve SSE server
src/render/     satori card
ui/             React app (Race, Scoreboard, Ladder screens)
test/           vitest
```

## Conventions

- Every string that names the product (file names, branch prefix, labels, port) lives in `src/core/names.ts`. Do not inline `bakeoff` or `.bakeoff` anywhere else.
- Every subprocess an agent driver starts goes through `runProcess` in `src/core/process.ts`. It owns detached spawn, timeout, budget trip, and process-group kill. Drivers never spawn on their own.
- Functions that shell out take an `exec: Exec` parameter with `exec` as the default so tests can inject a fake. Same for `now: () => Date`.
- Cost is `number | null`. Null means "unavailable" and renders as such. Never coerce to 0.
- Score components that are not configured have `awarded: null` and render grey "n/a". Never award 0 for a check that did not run.
- Events are appended to `events.jsonl` before they are broadcast. The file is the source of truth; SSE and the terminal are views.
- TDD: write the failing test, run it, implement, run it, commit. Commit after every task with a conventional message (`feat:`, `fix:`, `test:`, `chore:`, `docs:`).
- No `any`. Parse unknown JSON with zod or explicit guards. Driver envelopes are untrusted: every field access is guarded with a default.
- Keep files under ~300 lines. Split by responsibility.
- Do not add an orchestrator feature (different tasks to different agents). That is out of scope by decision.

## Driver notes

- Claude Code 2.1.259 is installed and verified. `--max-turns` does not exist in this version; `maxTurns` is ignored for Claude.
- Codex 0.156.0, Gemini 0.60.0 and cursor-agent 2026.09.02 are installed and verified. OpenCode has a schema slot and a UI colour but no driver yet.
- Codex names no model anywhere in `--json`, so a default-model run meters to `cost: null`. Its prompt must go on stdin; passed as an argument it still blocks waiting for stdin to close.
- Gemini exits 55 in a folder it has not been told to trust, and every worktree is new. `GEMINI_CLI_TRUST_WORKSPACE=true` goes in the launch and probe env; `--skip-trust` is feature-detected as a second route.
- cursor-agent raises a workspace-trust prompt in a fresh directory too; `--force` answers it. Its `model` is a display label ("Codex 5.3 Low"), not the id you pass, so a requested model wins over the label.
- Feature-detect flags by parsing `<cli> --help` in `doctor()`. Flags churn.
- Headless Claude (`-p`) does not raise the workspace-trust prompt in a fresh `$TMPDIR` git repo, verified on 2.1.259. No `~/.claude.json` pre-seeding is needed.
- The `doctor` auth probe pins `--model claude-haiku-4-5`. Opus bills roughly $0.21 for the system-prompt cache write alone, so a small `--max-budget-usd` trips the cap on turn one and reports `error_max_budget_usd`, which looks like an auth failure but is not. `probeAuthOk` treats a budget stop as proof the API accepted us.

## Design

- The UI is specified in `design/handoff/design_handoff_bakeoff/README.md` (tokens, type, layout, motion) with HTML references in `standalone/`. Recreate it in React; do not ship the reference HTML.
- Agent identity colors: Claude Code `#F59E6B`, Codex `#5EC8CE`, OpenCode `#E58BC7`, Gemini CLI `#9BCB6E`. They live once in `ui/src/theme.ts` (UI) and are mirrored in each driver's `color` and in `src/render/card.tsx`.
- Deviations from the handoff are listed in SPEC.md section 10 under Visual design. Follow those, not the handoff, where they conflict.
- `design/handoff/**/fixture.json` is a design fixture. Code and tests use `src/contract/fixtures/run.json`.
- No emoji anywhere in the UI, the card, or the terminal. Text and color only.
- Terminal output follows `design/TERMINAL.md`: agent colors, dim labels, tabular numbers, no emoji, no box drawing, honors `NO_COLOR` and non-TTY. Color helpers live in `src/cli/render/style.ts`.

## Naming

Package `bakeoff-cli`, binary `bakeoff`, GitHub org `bakeoff-dev`. Brand is Bakeoff.
