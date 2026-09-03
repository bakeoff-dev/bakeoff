# PR Arena: Competitive Landscape and Technical Feasibility Sweep

## TL;DR
- No direct competitor exists. Nobody ships a tool that races multiple *CLI agents* on the *same real GitHub issue in your own repo*, opens *real competing PRs*, scores them *deterministically*, and keeps a *per-repo Elo ladder*. The closest shipping feature is Emdash's "Best-of-N" (same task, multiple agents, side-by-side diffs, but no scoring and no Elo); the two same-named projects are NOT competitors (neulab/pr-arena = human A/B voting on LLM diffs, dormant; mattWoolly/agent-arena = deterministic benchmark on bundled fixtures, not your repo).
- Lead differentiator: "deterministic, anti-cheat scoring of real PRs on YOUR issue, with a per-repo Elo ladder that persists across runs." The scoring pipeline plus the persistent ladder is the moat. Parallel-worktree execution alone is a commodity (Emdash, Vibe Kanban, Conductor, and Sculptor all do it).
- Critical naming problem: "PR Arena" is already taken twice (neulab/pr-arena and prarena.ai / aavetis/PRarena), and "arena" is crowded by LMArena's Code Arena. Rename before launch to avoid collision and SEO cannibalization.

## Key Findings
1. The positioning gap is real but narrow and closing. Multiple orchestrators already do "same task, N agents, compare diffs" (Emdash Best-of-N explicitly; Conductor and Sculptor informally). The genuinely unclaimed ground is deterministic scoring + real competing PRs + a persistent per-repo Elo ladder, not parallel execution.
2. The name collides with two existing "PR Arena" projects plus a third "Code Arena" benchmark brand. This is the single biggest fixable risk.
3. Driver implementations are feasible in a 2-week window. All four CLIs (Claude Code, Codex, OpenCode, Gemini) support headless JSON output with cost/usage, though Gemini's is the newest and flag churn is real across all of them.
4. Anti-cheat is a solved-enough problem with strong prior art (SWE-bench state handling, held-out tests, LLM-judge suspicion scoring, BenchJack exploits). This is a credible, defensible feature.
5. Multi-agent Elo is a known hard problem: classic Elo is two-player/zero-sum only; TrueSkill and OpenSkill are the correct tools for N>2 free-for-all matches.

## Details

### 1. Direct competitor hunt (verdict: NO direct competitor)

| Name | URL | Stars | Last activity | Scope | Same-task compare? | Real PRs? | Scoring? | UI? | Threat |
|---|---|---|---|---|---|---|---|---|---|
| Emdash | github.com/generalaction/emdash | ~2.4k-4.8k (verify) | Active (v1.1.27, May 2026) | Own repo, worktrees, 20+ CLIs | Yes (Best-of-N) | Yes (creates PRs, CI view) | No | Desktop app (Mac/Win/Linux) | HIGH |
| neulab/pr-arena | github.com/neulab/pr-arena | 17 | Dormant (~Dec 2025) | Own repo via GitHub App + label | Paired diffs (2 LLMs) | Only the picked fix | Human A/B vote | Web arena | LOW |
| mattWoolly/agent-arena | github.com/mattWoolly/agent-arena | 0 | Active (~Aug 2026) | Bundled fixtures only | Yes (graded) | No | Deterministic graders + LLM judge | CLI | MEDIUM (concept) |
| aavetis/PRarena (prarena.ai) | github.com/aavetis/PRarena | 299 | Very active (3h cron) | Global GitHub, not your repo | No | Tracks existing PRs | PR open/merge counts | Web dashboard | LOW (name only) |
| Vibe Kanban | github.com/BloopAI/vibe-kanban | ~27.1k | SUNSETTING | Own repo, worktrees, 10+ CLIs | Parallel tasks | Yes | No | Web UI (self-hosted) | LOW (winding down) |
| Sculptor (Imbue) | github.com/imbue-ai/sculptor | 221 | Active | Own repo, containers | Informal (parallel approaches) | Yes | No | Desktop app (Mac/Linux) | MEDIUM |
| Conductor | conductor.build | Closed source | Active ($22M Series A) | Own repo, worktrees | Side-by-side branch review | Yes | No | Mac app | MEDIUM |

Key evidence:
- neulab/pr-arena ("OpenHands PR Arena"): 17 stars, dormant since ~Dec 2025, not archived. Compares 7 LLMs *inside the OpenHands resolver* (Claude Sonnet 4, DeepSeek R1, GPT-4.1, Gemini 2.5 Pro, Qwen3 Coder, DeepSeek V3.1, GPT-5 Mini) - NOT distinct CLI agents. Uses human preference voting ("choose your preferred model"); only the picked fix becomes a real PR; no deterministic scoring; no Elo. Built on the OpenHands GitHub Backlog Resolver, inspired by Copilot Arena, agents run remotely. Not a competitor.
- mattWoolly/agent-arena: 0 stars, active through ~mid-Aug 2026 (exact last-commit date unverified). Deterministic hidden graders (`grade.sh`) plus an optional LLM rubric judge (default claude-opus-4-8) that never gates pass/fail, and it has real test-tampering defenses (grader isolation, config tripwire, served-model integrity checks). But it runs only on its own bundled graded fixture tasks in throwaway workspaces - not your repo, not real GitHub issues - and opens no PRs and keeps no Elo. It drives Claude Code (default), Codex CLI, and Kimi Code (not OpenCode). Closest on scoring philosophy, farthest on positioning.
- Emdash Best-of-N: documented as "Run multiple agents on the same task, let them work in parallel, then pick the best output. Each agent gets its own worktree." It compares diffs side by side and can create PRs and inspect CI. This is the single closest shipping feature to PR Arena's execution layer, but it has no scoring, no anti-cheat, no Elo, and "pick the best" is manual/subjective.

### 2. Orchestrator category (parallel agents in worktrees)

| Tool | What it is | Agent CLIs | OSS? | Stars | Platform | Same-task compare? |
|---|---|---|---|---|---|---|
| Emdash (generalaction) | Electron ADE, YC W26 (founders Arne Strickmann, Raban von Spiegel) | 20+ (Claude Code, Codex, OpenCode, Gemini, Amp, Cursor, Devin, Qwen, Droid, Copilot) | Yes (Apache-2.0) | ~2.4k-4.8k | Mac/Win/Linux | Yes (Best-of-N) |
| Conductor (conductor.build) | Mac desktop app by Melty Labs (Charlie Holtz, Jackson de Campos) | Claude Code, Codex, Cursor | No | n/a | Mac | Side-by-side branch review |
| Vibe Kanban (BloopAI) | Web kanban orchestrator, SUNSETTING | 10+ | Yes (Apache-2.0) | ~27.1k | Self-hosted (Rust) | Parallel tasks |
| Sculptor (Imbue) | Desktop app, container isolation | Claude Code, Codex, Pi, any terminal agent | Yes (MIT) | 221 | Mac/Linux | Informal |
| Claude Squad | tmux/terminal multi-session | Claude Code, Codex, Gemini, Aider | Yes | n/a | Mac/Linux | No |
| Crystal / Nimbalyst | Kanban visual workspace (Crystal deprecated, succeeded by Nimbalyst) | Claude Code, Codex | Yes/freemium | n/a | Mac/Win/Linux | No |
| cmux | Terminal multiplexer for agents | Multiple | Yes | ~21.8k | Mac/Linux | No |
| amux (andyrewlee) | Go TUI for parallel agents | Claude Code, Codex | Yes | ~151 | Mac/Linux | No |

Finding: Conductor's "compare" is real but shallow - you review branches side-by-side and pick one; it is manual review, not scoring. Conductor confirms a "$22M Series A from Spark and Matrix." Emdash is the only orchestrator with an explicit, named "run same task on N agents and compare" feature (Best-of-N). None of them score PRs or maintain an Elo ladder. Note the structural threat flagged across sources: first-party absorption (Anthropic's redesigned Claude Code desktop with parallel sessions/Routines, OpenAI's Codex app, Cursor's Agents Window) is eating this category from above.

### 3. Benchmark/arena category

- oxagen/arena (Mac Anderson / oxageninc, "Agent Benchmark Protocol"): Mac Anderson is founder of oxagen (creator of the "stella" agent language). Could not verify a live, populated coding-agent arena at arena.oxagen.sh or a published, adopted Agent Benchmark Protocol spec. Treat as unverified/early.
- mattWoolly/agent-arena: head-to-head graded harness, hidden self-tested graders, LiteLLM proxy for non-Anthropic models, per-model "ladder" bouts reporting pass k/N, mean +/-sd, cost, wall-clock (but no Elo). Bundled fixtures, not your repo. No PRs.
- Artificial Analysis Coding Agent Index: composite of DeepSWE, Terminal-Bench v2.1, SWE-Atlas-QnA; pass@1 averaged over 3 attempts, equal task weighting. Vendor-neutral, not your-repo.
- Terminal-Bench / SWE-bench / Harbor: standard harnesses. Harbor re-uploads protected test files before verification - directly relevant anti-cheat pattern.
- LMArena / Code Arena WebDev (arena.ai): human-preference Elo over 328k+ votes (May 24, 2026 snapshot); model-level, not your-repo, no PRs.
- Bottom line: Neither the orchestrator nor the benchmark category can run on a user's own repo/issue AND open real PRs AND score them AND keep a per-repo ladder. That intersection is PR Arena's whitespace.

### 4. Driver technical details (as of September 2026)

Claude Code (headless / Agent SDK CLI) - most mature, build first:
- `-p`/`--print` for non-interactive; `--output-format text|json|stream-json`.
- JSON envelope fields: `result`, `session_id`, `total_cost_usd` (plus a per-model cost breakdown), `usage`, `duration_ms`, `num_turns`, `subtype`, `is_error`. `total_cost_usd` is a client-side estimate and can differ from the actual bill.
- `--json-schema` (with `--output-format json`) returns typed data in the `structured_output` field; invalid schema exits with an error (v2.1.205+).
- `stream-json` requires `--verbose`; token-level deltas additionally require `--include-partial-messages`. The terminal event is a `result` message with final text, cost, and session metadata.
- Budget/turn caps: `--max-turns`, `--max-budget-usd`. Model: `--model` / `--fallback-model`.
- Permissions: `--allowedTools "Bash,Read,Edit"` (rule syntax like `Bash(git diff *)` - mind the space before `*`), `--permission-mode` (auto / acceptEdits / dontAsk), `--dangerously-skip-permissions`.
- `--bare` skips auto-discovery of hooks, MCP, CLAUDE.md, subagents, plugins for deterministic CI runs; it will become the `-p` default. In bare mode you MUST set `ANTHROPIC_API_KEY` (no OAuth/keychain read).
- Working directory: add the worktree with `--add-dir` and/or run the process from inside the worktree. Resume: `--resume <session_id>`, `--continue`, `--fork-session` (session lookup by ID is machine-wide as of v2.1.223+).
- Exit codes: 0 success, non-zero on failure; SIGTERM -> exit code 143 (kills the Bash process tree, runs SessionEnd hooks, leaves the turn unfinished). A model refusal cannot be caught from the exit code.
- Gotchas: background Bash tasks are killed ~5s after the final result; piped stdin capped at 10MB; sessions persist to `~/.claude/projects/`.

Codex CLI (`codex exec`):
- `codex exec "TASK"` (alias `codex e`); `--json` for JSONL events (events on stdout, progress on stderr).
- `--output-schema <file>` constrains the final response to a JSON Schema; `-o` / `--output-last-message` saves the final message to a file.
- Sandbox: `-s read-only|workspace-write|danger-full-access`; `--full-auto` (= workspace-write + on-request approvals); `--yolo` (no rails); `-a` approval policy.
- `--ephemeral` prevents writing session files to disk; `--skip-git-repo-check` for non-repo contexts; `-C` / `--cd` sets the working directory.
- Model/budget: `--config model=...`; auth via `CODEX_API_KEY` (supported only in `codex exec`, avoids reading `~/.codex/auth.json` on CI runners). Config at `$CODEX_HOME/config.toml` (default `~/.codex/config.toml`).
- Token usage: `/status` in the TUI; JSONL events carry per-turn usage. Cost is not always exposed (e.g., GPT-5.6 cost stays undefined until Codex exposes cache-write tokens). Sessions stored in `~/.codex/sessions`.
- Gotchas: heavy MCP/tool cold-start token overhead (about 500 tokens per built-in tool, 550-1,400 per MCP tool definition; a typical four-server MCP setup adds ~7,000 tokens/turn; 5+ servers can exceed 50,000 tokens before the first prompt); automatic history compaction at the token limit.

OpenCode (`opencode run`):
- `opencode run "..."` for non-interactive; `-q` quiet; `--file` to attach files.
- Model selection via config (`"model": "provider/model"`) or `opencode models`; optional `small_model` for lightweight tasks.
- Cost/tokens: `opencode stats` (CLI); cost is computed from models.dev pricing plus normalized usage. Cost tracking reports $0.00 for custom / openai-compatible providers (GitHub issue #17223) - flag rather than trust in those cases.
- Permissions: config `"permission": {"edit":"ask","bash":"ask"}`; set to non-ask for headless runs.
- Headless server: `opencode serve` (OpenAPI) / `opencode web`. Auth at `~/.local/share/opencode/auth.json`.
- Gotcha: structured JSON output for `run` is less mature than Claude/Codex; for reliable per-run usage, parse the session store or use the `serve` API.

Gemini CLI:
- `-p` / positional prompt for non-interactive; `--output-format json` (native since v0.6.1) and `stream-json` (JSONL).
- JSON shape: `{response, stats:{models:{<model>:{api:{totalRequests,totalErrors,totalLatencyMs}, tokens:{prompt,candidates,total,cached,thoughts,tool}}}, tools:{totalCalls,totalSuccess,totalFail,totalDurationMs}}}`. Some builds expose `total_cost_usd` inside stats; token counts are always present.
- `--approval-mode default|auto_edit|yolo` (replaces the older `-y`/`--yolo`, which cannot be combined with it); `--allowed-tools`; `-s`/`--sandbox`.
- Gotchas: JSON output was buggy or absent before ~v0.6.1 (see issues #8022, #9009); many CLI flags are deprecated in favor of `settings.json`; heavy flag churn - feature-detect at build time.

Cross-cutting gotchas to design for: cold-start token costs skew cheap tasks (report them, do not penalize the agent for them); kill the entire process group on timeout (Claude uses SIGTERM -> 143 and kills the Bash tree; do the same for the others); sessions persist to disk (wipe per run for determinism); pin CLI versions and feature-detect flags via `--help` and init events because flags churn frequently.

### 5. Scoring and anti-cheat prior art

- State reset before scoring: SWE-bench Verified is OpenAI Preparedness's human-validated 500-sample subset of SWE-bench; the standard harness restores the canonical test state before scoring so agents cannot pre-satisfy tests. Harbor/Terminal-Bench re-upload protected test files before verification. PR Arena should restore held-out tests from a clean ref AFTER the agent exits. (Caveat: OpenAI's 2026 audit found at least 59.4% of audited SWE-bench Verified problems had flawed test cases and it stopped reporting the score - cite as a prior-art pattern, not a gold standard.)
- Held-out test injection: NIST CAISI's guidance recommends adding scoring checks unknown to the agent, e.g., held-out unit tests that check different values than the agent-visible tests, to catch hard-coding.
- Test-tampering taxonomy (TDFlow, PERFOPT-Bench): tests directly modified; tests skipped/disabled (`skip`, `@ignore`, `.only`); assertions weakened or removed; hard-coded outputs; intercepting/redefining stdlib, timing, RNG, IO, or the test framework; parser/conftest overwrite (BenchJack's SWE-bench Pro exploit created `/app/conftest.py` to overwrite the evaluator's parser at collection time). Detect via diff analysis of test files plus a git-clean reset plus a re-run from the restored baseline.
- Known exploits and why isolation matters (Berkeley RDI / BenchJack): pytest hooks forcing all tests to pass, in-container parser overwrite, and git-log answer copying (IQuest-Coder's 81.4% SWE-bench claim fell to 76.2% after 24.4% of trajectories were found running `git log` to copy the answer). The agent must never be able to write to any path the evaluator reads.
- LLM judge for reward hacking: EVILGENIE found LLM judges outperform held-out tests for detecting reward hacking; SWE-Marathon uses a judge suspicion score s in [0,1] (>=0.85 = deliberate verifier bypass); islo-labs/reward-hack-bench found an LLM judge on outgoing requests was the only tested policy with 0 cheats while preserving the model's fair-solve rate. The right pattern for PR Arena is a blind judge shown anonymized A/B/C diffs, kept as a tiebreaker that never overrides deterministic pass/fail.
- Diff discipline: measure lines changed, files touched, and whether the fix is minimal vs. sprawling; penalize sprawl.
- Multi-player Elo: classic Elo is two-player/zero-sum and cannot correctly rank an N>2 free-for-all (well documented in the ranking-systems literature). Use TrueSkill (Microsoft Research; Herbrich, Minka, Graepel; Bayesian mu/sigma, new players initialized at mu=25, sigma=8.333, conservative rating mu - 3*sigma; designed for >2 players) or OpenSkill (open-source, MIT, faster, accuracy comparable to TrueSkill). Treat each issue run as one free-for-all match and update all participating agents' ratings.

### 6. Distribution signals

- Demand is proven. "Which coding agent is best" is a saturated 2026 content category (dozens of Claude Code vs Codex vs OpenCode comparisons). The Pragmatic Engineer 2026 AI tooling survey (fielded Jan 27-Feb 17, 2026; 906 respondents) found 70% of developers use two to four AI tools simultaneously and 15% use five or more. (The often-cited "15,000 developers" figure is a different study, JetBrains' Developer Ecosystem Survey.) A recurring finding across sources: no single coding agent dominates every task category - which is exactly the per-repo pain PR Arena addresses.
- Show HN patterns that worked in 2026: OpenCode became the #1 Hacker News post on March 20, 2026 with 1,099 points and 546 comments in a single day, riding the "provider-agnostic, no lock-in" hook (now ~120k GitHub stars). Emdash grew fast on "agent-agnostic + Best-of-N." The winning pattern for dev-tool CLIs is open-source, local-first, and BYO-key/subscription. Common HN pushback: resource usage, "is this just a thin wrapper," and first-party absorption risk.
- Naming/SEO risk: "PR Arena" and "arena" are crowded (prarena.ai, neulab/pr-arena, arena.ai Code Arena, and dozens of "*-arena" benchmarks). A distinct, ownable name is a launch prerequisite.

## Recommendations
1. Rename before launch (do this first). "PR Arena" collides with two live projects and a benchmark brand. Pick something ownable (an "agent bake-off / shootout / race" framing works) and secure the GitHub org + domain + npm name before writing the launch post. Benchmark to change the decision: if a 2-minute search surfaces any collision on GitHub/HN/npm, keep iterating.
2. Lead with the moat, not the mechanism. Headline: "deterministic, anti-cheat scoring of real PRs on your own issue, with a per-repo Elo ladder." Do NOT lead with "run agents in parallel" - that is commoditized by Emdash, Conductor, Vibe Kanban, and Sculptor.
3. Ship anti-cheat as a first-class, visible feature. Git-clean reset of held-out tests after the agent exits; a test-tampering diff detector (skip / `.only` / weakened or removed asserts / conftest tricks); and a blind LLM judge on anonymized A/B/C diffs used only as a tiebreaker. This is your credibility wedge versus Emdash's subjective "pick the best."
4. Use TrueSkill or OpenSkill, not classic Elo, for the ladder. You can market it as "Elo-style" for familiarity but implement a multiplayer-correct system, and persist ratings per repo in a local SQLite store.
5. De-risk the drivers in week 1. Claude Code and Codex have the most stable JSON/cost envelopes - build and test those first. Treat OpenCode cost tracking and Gemini JSON output as best-effort; when cost is unavailable (OpenCode custom providers, some Codex/Gemini builds), display "cost unavailable" rather than guessing. Pin CLI versions and feature-detect flags.
6. Pre-empt HN pushback in the launch post. Expect "thin wrapper" and "Anthropic/OpenAI will absorb this." Counter with the scoring/anti-cheat/Elo depth and the local-first, BYO-subscription story, and open with a live scoreboard on a real open-source issue as the demo (HTML + PNG card).
7. Sequence distribution. Launch Show HN mid-week with a live scoreboard PNG, then push to r/ClaudeCode, r/ChatGPTCoding, and r/LocalLLaMA, riding the existing "which agent is best on my codebase" demand. Threshold that would change the plan: if Emdash or Conductor ships deterministic scoring + Elo before you launch, pivot the headline to the anti-cheat rigor and per-repo persistence specifically.

## Caveats
- Star counts and dates are as of September 3, 2026 and move fast; re-verify at launch. Emdash's star count is reported inconsistently across sources (~2.4k in some Sept-2026 write-ups, ~4.8k in a live fetch); treat as a range and confirm on GitHub.
- oxagen/arena's "Agent Benchmark Protocol" could not be verified as a live, adopted spec; treat as unconfirmed.
- mattWoolly/agent-arena's exact last-commit date is inferred from README-internal dates (activity through ~mid-Aug 2026), not a directly loaded commit page.
- Conductor is closed-source; its "compare branches" depth is described from docs and third-party writeups, not source.
- CLI flags churn frequently; every flag above should be re-checked against `--help` at build time, especially Gemini's, where JSON output and approval-mode flags changed recently.
- Some driver details (per-model cost breakdowns, the exact stream-json terminal-event field list) are documented as "stable" but not exhaustively enumerated in official docs; guard parsers with defaults and never assume a field exists.
- The Pragmatic Engineer 70% figure comes from a 906-respondent survey; directionally strong but not a census.