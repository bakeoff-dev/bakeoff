# Bakeoff

[![CI](https://github.com/bakeoff-dev/bakeoff/actions/workflows/ci.yml/badge.svg)](https://github.com/bakeoff-dev/bakeoff/actions/workflows/ci.yml)

**Race coding agents on your real issues. Merge the winner.**

<!-- hero GIF coming: docs/hero.gif, recorded from the live race view once the race screen is final -->

Pick an open issue in your repository. Bakeoff gives the same task packet to every agent
you name, runs each one in its own git worktree under the same budget and the same wall
clock, opens a real pull request per agent, and scores the results on your tests. You get a
scoreboard, a run record you can diff, and a per-repo ladder that gets more useful every
race.

The question it answers is not "which agent is best" but "which agent is best **on this
codebase, on this issue**" — and the answer is a branch you can merge, not a report.

> **Status:** pre-release, 0.1.0, not yet published to npm. Races, task packets and pull
> requests work end to end today. Scoring, the remaining agent drivers, the browser
> scoreboard and the `share` / `ladder` / `merge` / `export` commands are being wired up
> now.

## Install

```bash
npm i -g bakeoff-cli
bakeoff doctor
```

`bakeoff doctor` is the preflight: it checks each agent CLI is installed, logged in, and
still has the flags Bakeoff drives it with, and that `git` and `gh` are ready.

You need:

- **Bun 1.3+** — the binary runs on Bun
- **git**
- **GitHub CLI** (`gh`), authenticated: Bakeoff shells out to it for issues, pushes and PRs
- at least one agent CLI, installed and logged in

## Quickstart

```bash
cd your-repo
bakeoff init                              # writes bakeoff.yml and .gitignore entries
$EDITOR bakeoff.yml                       # set your test command
bakeoff run 123 --agents claude,codex     # or: bakeoff run   (picks from your open issues)
# scoreboard in the terminal; full record in .bakeoff/runs/<id>.json
```

An issue can be given as `123`, `#123`, `owner/repo#123`, or a GitHub issue URL. With no
issue argument, Bakeoff lists your open issues and asks.

What happens per agent: a worktree at `$TMPDIR/bakeoff/<run>/<driver>` on a branch
`bakeoff/<issue>-<driver>-<run>`, the agent runs headless against an identical task packet,
then Bakeoff commits anything left over, pushes, and opens a pull request labelled
`bakeoff` and `bakeoff-run:<id>`. The agent never pushes and never opens a PR itself.

## Agents

| Agent | Driver id | Status |
|---|---|---|
| Claude Code | `claude` | supported |
| Codex | `codex` | supported |
| Gemini CLI | `gemini` | supported (new) |
| Cursor | `cursor` | supported (new) |
| OpenCode | `opencode` | not supported yet |

Name them with `--agents`, or set `agents:` in `bakeoff.yml`. Each entry is `driver` or
`driver:model`:

```bash
bakeoff run 123 --agents claude:claude-opus-5,codex,cursor
```

No model, or `auto`, means the CLI's own default — Bakeoff passes no model flag at all.
Whatever model actually ran is read back from the agent's own output and recorded in the
run, so a race is never ambiguous about what competed. The ladder treats each driver and
model as its own competitor: `claude:claude-opus-5` and `claude:claude-sonnet-5` are two
different entries, rated separately.

An agent may appear only once per race.

## How scoring works

Deterministic, out of 100. Every component is your own command or your own CI — Bakeoff
supplies the harness, not the opinion.

| Component | Points | How it is earned |
|---|---|---|
| Visible tests | 50, or 30 when hidden tests are configured | Your test paths are restored from the base commit, then your `test` command runs. Exit 0 or nothing. |
| Hidden tests | 20 | Your held-out tests are copied in *after* the agent exits, then run. Exit 0 or nothing. |
| Typecheck | 7.5, or 15 if no lint is configured | Exit 0 of your `typecheck` command. |
| Lint | 7.5, or 15 if no typecheck is configured | Exit 0 of your `lint` command. |
| CI | 10 | `gh pr checks` polled until every check settles. All green or nothing. |
| Diff discipline | 10 | 6 points scaled against the median diff size, 4 for staying inside the file set most agents touched. Counts the product change only: test files are left out of both halves. A diff of zero scores zero. |
| Tamper | −25 | Any flag below, subtracted once. |

### Write one hidden test per issue

Put a test in `.bakeoff/hidden` that fails on the base commit and passes once the issue is
fixed. It is copied into each agent's worktree *after* that agent exits, so nobody can read
it or code against it. It is the only component that measures whether the issue was solved.

Without one, and with a green suite at the base commit, every check can only show that
nothing broke. Bakeoff says so, in the preflight and above the final table:

> No test checks this issue. Scores show nothing broke, not that the issue was solved.

That warning is there because of a real race. The issue asked for a `--tail` flag on a list
command. One agent built the command with thirteen tests; the other added an unrelated
`tail()` helper to a different file and never touched the list command at all. The suite was
green before and after for both, so visible tests separated nothing — and the smaller diff
won, 66 to 63.4. One hidden test calling `--tail` would have decided it in a second.

Restoring the test paths before the test run is the point: an agent that "fixed" the suite
by editing what it asserts gets measured against the assertions you wrote. Detection reads
the base commit, so it covers a suite the agent deleted, and it knows the layouts that keep
tests beside the code — `*_test.go`, `test_*.py`, `*_test.py` — as well as `test/` and
`*.test.*`.

Components you have not configured show as grey **n/a** and are left out of the
denominator — a repo with no lint is scored out of what it actually offers, never marked
down for it. A crashed, timed-out or over-budget agent scores nothing, is excluded from the
ladder, and still appears on the scoreboard with its log tail.

Ranking is total descending, then cost ascending, then duration ascending.

## Tamper detection

Five rules, evaluated against `base..HEAD` of the agent's branch. Each flag names the rule
and the file on the scoreboard, and any flag at all costs 25 points once.

- **`test_deleted`** — a test file deleted, or renamed out of the test paths.
- **`test_skipped`** — a skip marker added to a test file: `.skip(`, `.only(`, `xit(`, `@pytest.mark.skip`, `pytest.skip(`, `t.Skip(`, `@Ignore`, `@Disabled`, `unittest.skip`.
- **`asserts_weakened`** — a test file ends with fewer assertions than it had at base.
- **`config_write`** — a change to test or CI configuration: `vitest.config.*`, `jest.config.*`, `conftest.py`, `pytest.ini`, `pyproject.toml`, `tsconfig*.json`, `.eslintrc*`, `biome.json`, `bunfig.toml`, `.github/workflows/**`, `bakeoff.yml`, or the `test` / `lint` / `typecheck` scripts in `package.json`.
- **`hidden_path_write`** — anything written into the hidden-test destination.

## The ladder

Every race updates `.bakeoff/ladder.json` in your repository. Ratings come from
[OpenSkill](https://github.com/philihp/openskill.js) — one free-for-all match per race
among the agents that finished — displayed as `1000 + 40 × (mu − 3σ)` so a newcomer starts
near 1000 and the table reads Elo-style. Each driver and model pair is its own competitor,
and a race with fewer than two finishers records history without moving anyone's rating.
It is committed with the rest of `.bakeoff/`, so the ladder is a fact about your repository
rather than a score on someone else's website.

## Config reference

`bakeoff.yml` at the repository root. Unknown keys are an error. Durations accept `90s`,
`20m`, `1h`.

```yaml
# all keys optional except one of test / lint / typecheck
test: bun test                      # run from the worktree root; exit 0 is green
lint: bun run lint
typecheck: bunx tsc --noEmit
test_paths: [test/, "**/*.test.ts"] # restored from base before scoring; default: detected at base
agents: [claude, codex]             # each entry "driver" or "driver:model"
budget_usd: 3.00                    # per agent
timeout: 20m                        # per agent, wall clock
max_turns: 50                       # advisory; only enforced by CLIs that support it
ci_timeout: 10m                     # how long to poll gh pr checks; 0 disables CI scoring
hidden_tests:
  source: .bakeoff/hidden           # relative to the repo root; must be gitignored
  dest: tests/hidden                # relative to the worktree; copied in after the agent exits
  command: bun test tests/hidden
judge:                              # optional LLM judge, off by default
  enabled: false
  model: claude-sonnet-5
```

`--agents`, `--budget` and `--timeout` on `bakeoff run` override the file for one race, and
`--keep-worktrees` leaves each agent's worktree on disk for inspection.

A run leaves behind `.bakeoff/runs/<id>.json` (the full record), `.events.jsonl` (the race
log, replayable) and `.bakeoff/logs/<id>/<driver>.log` (the full agent session, gitignored
along with `.bakeoff/hidden/`).

## How is this different from Emdash or Conductor?

Those are workspaces: they run agents on *different* tasks in parallel so you ship faster,
and they are good at it. Bakeoff runs the *same* task on every agent and scores the
results, with anti-cheat checks and a per-repo ladder that compounds across races. The
closest shipping feature anywhere is Emdash's Best-of-N, which diffs N agents on one task —
but with no scoring, no tamper detection and no history, it is a comparison, not a contest.

## Honest limits

- **Every agent gets full command access in its worktree, with network.** That is the
  point: a race is only fair if every agent can run the tests, install what it needs, and
  commit. It also means each agent can run any command your user account can, against the
  network, on a checkout of your repository. Race only in repositories you would be willing
  to hand these agents, and expect them to do the things you asked for and some you did not.
- **A bare agent rates as an "auto" competitor.** `--agents cursor` is one ladder row
  whatever its provider routes to that day, so its rating mixes whichever models answered.
  A pinned agent -- `--agents cursor:gpt-5.3-codex-low` -- is the reproducible form, rated
  on its own row. Pin the model when you want a result you can compare next week.
- **Hidden tests are unreachable by path, not secret.** The agent runs with your
  permissions and can read the disk. Keeping them outside every worktree stops an agent
  from stumbling onto them and overfitting; it is not a sandbox and will not stop one that
  goes looking.
- **Every dollar figure is a client-side estimate**, computed from token counts and a local
  price table. Treat it as a comparison between agents in the same race, not as a bill.
- **Codex on a ChatGPT login is metered at API list prices**, which is not what your plan
  actually charges you. The number is useful for ranking, not for accounting.
- **Cursor may report no cost at all.** When an agent reports nothing, cost shows as
  unavailable rather than zero, and only the timeout caps the run.
- **Agent CLI flags churn.** Bakeoff feature-detects them by parsing each CLI's `--help`,
  and `bakeoff doctor` tells you when something it relies on has moved.

## License

MIT. See [LICENSE](LICENSE).
