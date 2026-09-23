# Bakeoff (working name, formerly "PR Arena") v1: Research, Differentiation, Features, UI, Plan

> Naming: "PR Arena" collides with neulab/pr-arena and prarena.ai, and "arena" is crowded by LMArena's Code Arena. Working name is Bakeoff; verify npm, GitHub org, and domain before launch. CLI examples below use `bakeoff`.

## 1. The positioning (this is the whole decision)

There are two crowded categories you must NOT sound like:

1. **Orchestrators**: Emdash, Conductor, Vibe Kanban, Agent Workspace, Shep, Crystal, Claude Squad. They run N agents on N *different* tasks in worktrees so you ship faster. Emdash has 22 CLI integrations and is YC-backed. Conductor has $22M and is Mac-only. You cannot out-build them on "run agents in parallel."
2. **Benchmarks**: oxagen/arena, mattWoolly/agent-arena, hybrid-arena, orq-arena. They run agents on *curated* tasks with held-out tests and publish statistics. Oxagen already has the "same model, same budget, same timeout, hidden tests" rigor story.

Bakeoff sits in the gap neither covers. Note the closest shipping feature: Emdash's "Best-of-N" runs the same task on N agents in worktrees with side-by-side diffs and can open PRs, but has no scoring, no anti-cheat, and no ladder. That is the answer to "how is this different."

> **Your repo. Your open issue. Real PRs. One scoreboard. Merge the winner.**

The wedge is "which agent is actually best on *my* codebase, on *this* issue," answered with a real PR you can merge instead of a report you read. Nobody does that. The orchestrators split work; the benchmarks use someone else's tasks.

The compounding piece that turns a demo into a tool people keep: **a per-repo ladder**. Every run writes a record; over time the repo has an Elo table ("Claude Code 1240, Codex 1180, OpenCode 1090 on this codebase, 14 races"). That's data no leaderboard on the internet has, and every new race is a post.

Tagline options:
- "Race coding agents on your real issues. Merge the winner."
- "Kaggle for your own issues."
- "Stop picking an agent from a leaderboard. Race them on your bug."

## 2. Competitor table (what to say when asked "how is this different")

| Tool | What it is | Why PR Arena is not it |
|---|---|---|
| Emdash (Best-of-N) / Conductor / Vibe Kanban | Parallel agents in worktrees; Emdash can run the same task on N agents and diff them | Scored, anti-cheat, per-repo ladder, real competing PRs. They're a workspace; this is a contest. |
| neulab/pr-arena, prarena.ai | Human A/B voting on LLM diffs (dormant); global PR stats dashboard | Name collision only. Neither races CLI agents on your issue. |
| oxagen/arena, agent-arena | Head-to-head on curated task sets, hidden tests, stats | Curated tasks, no real PRs, no per-repo history. PR Arena runs on your live issue tracker. |
| Codeband | Claude writes, Codex reviews (adversarial roles) | Cooperative pipeline, not a race, no scoreboard. |
| Baton | Polls GH issues, dispatches one agent per issue | One agent per issue. PR Arena is N agents per issue. |
| Warp / Claude Code worktrees | Manual parallel sessions | No scoring, no cost comparison, no artifact. |

Borrow from oxagen: process-group kill on timeout (their #1 bug), held-out tests copied in *after* the agent exits, "agent-error" excluded from comparisons rather than counted as a loss, normalized token accounting (cache reads tracked separately).

## 3. Feature list

### Must ship (v1, day 14)

**Core race**
- `bakeoff run owner/repo#123 --agents claude,codex,opencode`
- `bakeoff run` with no issue arg: pick an open issue from a list (`gh issue list`)
- One worktree + branch per agent: `arena/<issue>-<agent>-<runid>`
- Task packet: issue title/body, comments, repo `AGENTS.md`/`CLAUDE.md`, detected test command, "open a PR when done" instruction. Same packet to every agent, byte-identical.
- Per-agent hard caps: `--budget 3.00` (USD), `--timeout 20m`, `--max-turns`. Kill the whole process group on timeout.
- Each agent commits and pushes; PR opened via `gh pr create` under the user's identity, labeled `arena` and `arena-run:<id>`, body includes the scoreboard link.
- `arena.yml`: test, lint, typecheck commands; default agents; default budgets; hidden test path (optional).

**Drivers (3 at launch, interface for more)**
- Claude Code (build first, most stable): `claude -p --output-format json --max-budget-usd --max-turns --permission-mode acceptEdits` (or `--allowedTools` scoped), consider `--bare` for a clean room (requires ANTHROPIC_API_KEY). JSON envelope returns `total_cost_usd` (client-side estimate), `usage`, `session_id`, `num_turns`, `duration_ms`. SIGTERM exits 143.
- Codex CLI (second): `codex exec --json --full-auto -C <worktree>` (`--ephemeral` to skip session files, `CODEX_API_KEY` for auth). JSONL event stream; token usage from events; cost computed from a pricing table and shown as "unavailable" when the envelope has none.
- OpenCode (third, best-effort): `opencode run`. Structured output is less mature; parse the session store or use `opencode serve`. Cost reports $0 on custom providers, so display "cost unavailable" rather than 0.
- Driver interface: `launch(packet, worktree, caps) -> {exitCode, sessionLog, tokens, costUsd, durationMs}`. Gemini CLI is a 30-minute fourth driver (`gemini -p --output-format json`) if time allows.

**Scoring (deterministic, objective dominates)**
- Tests pass: 50
- Hidden acceptance tests pass (if configured): folded into the 50, weighted 30/20 visible/hidden
- Typecheck + lint clean: 15
- CI checks green on the PR (poll `gh pr checks`): 10
- Diff discipline: 10. Lines changed vs. median of contestants, plus a penalty for touching files outside the median set.
- Test tampering penalty: any deleted/skipped/`.only`/`@ignore` test, weakened or removed asserts, or writes to conftest/test-config/CI files = minus 25. Hidden tests are restored from a clean ref AFTER the agent exits, then re-run; the agent must never be able to write a path the scorer reads. Show it on the card as a red flag. This is the anti-cheat and it's a great content moment.
- LLM judge: 15, off by default, blind (diffs anonymized as A/B/C, judge model configurable). Marked "subjective" in the UI.
- Crash or timeout: 0, excluded from Elo, log tail shown.
- Tiebreak: cost, then duration.

**Run record**
- `.arena/runs/<id>.json`: issue, agents, packet hash, per-agent {score breakdown, cost, tokens, duration, files touched, lines +/-, PR url, exit status}.
- `.arena/ladder.json`: per-repo rating per agent, races played, win rate, avg cost. Use OpenSkill (multiplayer-correct), market it as "Elo-style"; classic Elo only handles two-player matches.

**Outputs**
- Terminal scoreboard (table + podium).
- Self-contained static HTML scoreboard (`.arena/runs/<id>.html`), screenshot-ready, dark by default.
- `arena share <id>`: renders a 1200x630 PNG card (podium, scores, cost, issue title) for X. This is the viral unit; make it look great.

### Should ship if week 2 has room
- `arena ladder`: terminal + HTML Elo table for the repo.
- `arena replay <id>`: side-by-side diffs of all contestants.
- `arena merge <id>`: merges the winner's PR, closes the others with a comment linking the scoreboard.
- Docker isolation flag (`--docker`) using the repo's devcontainer if present.
- GitHub Action: label an issue `arena` and it races in CI, posts the scoreboard as an issue comment. Big distribution lever, but it needs secrets handling. v1.1.

### Explicitly not in v1
Cloud execution, accounts, hosted gallery, multiplayer, editor extensions, Windows testing, GitLab, Jira/Linear, model hosting.

## 4. The UI

Yes to a UI, but be precise about which one. The category's desktop apps (Emdash, Conductor) are IDE-like workspaces. If you ship a Mac workspace app, you look like a worse Emdash. What no one has is a **race broadcast**: a live view of N agents competing that's fun to watch and screenshot.

### Recommendation: local web UI served by the CLI, not a native Mac app

- `arena run --watch` starts the race and opens `localhost:4141`. Same UI is emitted as the static HTML scoreboard at the end. One codebase for live view, final card, and share image.
- Zero distribution friction: no code signing, no notarization, no Gatekeeper dialog, no dmg. Those alone can eat 2 to 3 days of a 2-week clock. `npm i -g pr-arena` or `bunx pr-arena` and it works on Mac and Linux.
- Every user's screenshot looks identical to yours, which matters for the "scoreboard gallery."
- If you still want a Mac app after launch, wrap the same UI in Tauri or a SwiftUI WKWebView in a weekend (v1.1, menubar app that shows the live race). You know SwiftUI, so that's a real option later; it's just the wrong first move on this clock.

### Screens (3, that's it)

**1. Race view (live)**
- Four horizontal lanes, one per agent. Each lane: agent logo/name, elapsed timer, $ spent ticking up, tokens, files touched count, last tool action (one line, truncated), status pill (running / pushing / opening PR / done / timed out / crashed).
- Progress isn't linear, so show a "spend bar" (cost vs. budget) instead of a fake progress bar.
- Live log drawer per lane on click.
- Top bar: issue title, repo, run id, "3 of 4 running."
- Data via SSE from the CLI process. Dark background, one accent color per agent, monospace numbers.

**2. Scoreboard (final)**
- Podium at top (1st bigger, 2nd and 3rd smaller). Winner card shows total score, cost, duration, "View PR."
- Below: per-agent breakdown as stacked horizontal bars (tests / lint / CI / diff / judge), red segments for penalties.
- Row of receipts under each: tests X/Y passed, +lines/-lines, files touched, PR link, exit status.
- "Share" button = the PNG card. "Copy markdown" = table for issue comments and Reddit.

**3. Ladder**
- Per-repo Elo table: agent, rating, races, wins, avg cost, avg time. Sparkline of rating over time.
- This is the screen that makes people run it more than once.

Visual direction: sports broadcast, not dashboard. Big numbers, timers, podium, agent colors. Think F1 timing screen, not Grafana. Avoid the generic shadcn card grid or it reads as another orchestrator.

## 5. Stack (pick fast, don't revisit)

- **Language:** TypeScript on Bun (or Node 22). Single binary via `bun build --compile` is a nice bonus. Go would also be fine but TS lets the CLI and web UI share types for the run record.
- **CLI:** commander + @clack/prompts. Live terminal table with ink or a plain redraw loop.
- **Git/GitHub:** shell out to `git` and `gh`. Don't wrap the GitHub API yourself.
- **UI:** Vite + React + Tailwind, built to a single HTML file (vite-plugin-singlefile) so the static scoreboard is one artifact. SSE endpoint from the CLI for live mode.
- **Share PNG:** satori + resvg (no headless Chrome dependency).
- **Ratings:** `openskill` npm package. Each race is one free-for-all match; crashed/timed-out agents are excluded from the rating update, not counted as a loss.
- **Tests:** vitest. Test the scorer and the driver parsers with recorded fixtures from real runs.

## 6. Two-week build plan (revised for UI)

**Day 1 (Wed, today):** Repo, `arena.yml` loader, worktree spawner, task packet builder. Announce tweet with a mocked scoreboard PNG.
**Day 2:** Claude Code driver end-to-end on a toy issue in your own repo, PR opened. Screenshot of branches spawning.
**Day 3:** Codex driver. Process-group timeout kill. Budget caps enforced.
**Day 4:** Scorer (tests, lint, diff discipline, tamper penalty). Run record JSON. Terminal scoreboard. Post the first raw, ugly result.
**Day 5:** OpenCode driver. Cost normalization. First 3-agent race on a real issue. Post "tests don't lie" result.
**Day 6:** Web UI scaffold: scoreboard screen from a run record, single-file HTML export. Share PNG.
**Day 7:** Race view with SSE, live lanes. Record the 30 to 60s video from this.
**Day 8:** Ladder + Elo. README as landing page: hero GIF, one-line install, quickstart that works on first try.
**Day 9:** Hidden tests option, CI checks polling, `arena merge`. Fix quickstart friction. DM 5 to 10 people to try it over the weekend.
**Day 10 to 11 (weekend):** Run the "10 real issues" data set on 2 to 3 popular OSS repos (fork them). Write up the numbers. Fix whatever those runs break.
**Day 12 (Tue):** Show HN, 8 to 11am ET. X thread same morning, scoreboard PNG first. Reply to everything within 2 hours.
**Day 13:** Reddit data post (r/ClaudeCode, r/LocalLLaMA, r/ExperiencedDevs): "I raced 3 agents on 10 real issues, here's the data." Triage issues.
**Day 14:** Merge any external PR. Recap post with honest numbers.

Skip Product Hunt. Dev CLIs underperform there and it costs a day.

## 7. Content that only this tool can generate

- "Claude beat Codex on 7 of 10 issues but cost 2.4x more." (cost/quality tradeoff, most quotable)
- "OpenCode deleted a failing test to make CI green. The tamper detector caught it." (anti-cheat)
- "Same issue, three completely different approaches" (side-by-side diff screenshot)
- Per-repo ladder after 20 races: "The best agent for my codebase is not the one on the leaderboard"
- Race a new model the day it drops. Instant post, every time a lab ships.

## 8. Risks

- **Driver flakiness** is the real week-1 risk. Headless flags change between releases; pin versions you tested and print a `arena doctor` check up front (copy oxagen's move).
- **Cost of the data post.** 10 issues x 3 agents x ~$2 is $60 plus retries. Budget it.
- **"Isn't this just N terminals?"** Answer: scoring, cost accounting, tamper detection, the ladder, and the artifact. Have the sentence ready.
- **Scope creep toward orchestrator.** The moment you add "assign different tasks to different agents," you're Emdash. Don't.
- **Finishing.** Everything above is cut-able except: 2 drivers, scorer, run record, HTML scoreboard, share PNG. If day 10 arrives and race view isn't done, launch without it.
