# Handoff: Bakeoff — race UI (4 screens)

## Overview
Bakeoff races 2–4 AI coding agents on one GitHub issue and scores their PRs. Four desktop screens: **Scoreboard** (post-race results, the screenshot people share), **Race view** (live lanes while agents run), **Ladder** (per-repo standings), **Share card** (1200×630 social image). All screens render the fixture run `r_7f3a` for `shifan/gridloom#142`.

## About the design files
The `.html` files in this bundle are **design references built in HTML** — they show intended look and behavior. Do not ship them. Recreate them in the target codebase's existing stack (React/Next, Vue, Svelte, etc.) using its patterns; if no frontend exists yet, pick the most appropriate framework for a browser-tab tool (Next.js/React is a fine default). The `standalone/*.html` copies open offline in any browser; the `*.dc.html` files are the editable sources.

## Fidelity
**High-fidelity.** Colors, type, spacing, radii and copy are final. Recreate pixel-accurately.

## Design tokens
Background `#0A0A0F`. Grid texture: two 1px `linear-gradient` lines `rgba(255,255,255,.015)`, 32px cells, on the page wrapper (not on the share card).
Text `#F4F4F7`. Muted label `rgba(255,255,255,.55)`. Dim text `rgba(255,255,255,.45)`.
Hairline border `rgba(255,255,255,.08)`; inner row divider `rgba(255,255,255,.06)`. Surface tint `rgba(255,255,255,.02)`–`.025`. Track background `rgba(255,255,255,.06)`.
Radii: 12px surfaces, 6px controls, 999px pills, 3px bar segments. Share card: 16px.
Agent colors (identity only — dots, glow, cost fill, sparkline; never fills): Claude Code `#F59E6B`, Codex `#5EC8CE`, OpenCode `#E58BC7`, Gemini CLI `#9BCB6E`.
State colors (pills only; text color + 12% tinted bg): running `#60A5FA` / `rgba(96,165,250,.12)`, done `#4ADE80` / `rgba(74,222,128,.12)`, crashed `#F87171` / `rgba(248,113,113,.12)`. Diff stats: +lines `#4ADE80`, −lines `#F87171`. Penalty segment `rgba(248,113,113,.65)`.
Winner glow: `box-shadow: inset 0 0 0 1px <agent>22, inset 0 0 80px <agent>14` on the winner surface, plus a page-level radial `radial-gradient(ellipse at 35% 40%, <agent>1A, <agent>0A 30%, transparent 65%)` 1100×620 centered behind the podium.
Breakdown segment tints (descending): tests `rgba(214,224,255,.62)`, hidden tests `rgba(176,196,240,.5)`, lint `rgba(160,214,214,.4)`, CI `rgba(206,196,236,.32)`, diff discipline `rgba(220,208,180,.26)`, judge `rgba(255,255,255,.18)`. Zero-value configured segment `rgba(255,255,255,.06)`. Unconfigured (n/a): transparent with `1px dashed rgba(255,255,255,.18)`.

Typography: **Geist** (Google Fonts, variable 300–900), `font-feature-settings:"tnum"`. Logs and CLI snippets: **Geist Mono** 12px. Scale: page title 15/500; header meta 13; labels 12–13/500 muted; body 14; stat 22/600 −0.02em; row score 32/700 −0.04em; winner score 136/700 −0.04em line-height .9; share card winner 180/700 −0.05em. All labels sentence case, no tracking.

Layout: content column 1200px centered, 36px top padding, 64px bottom; page wrapper `min-width:1200px`.

## Screens

### 1. Scoreboard (`Bakeoff Scoreboard`)
Header row (flex, gap 12): issue title 15/500, repo `shifan/gridloom #142` and run `r_7f3a` in muted 13, right-aligned "Finished" pill (done colors).
Podium grid `1.6fr 1fr`, gap 16.
- Winner surface: 12px radius, hairline border, surface tint .025, inner glow (see tokens), padding 28/32/30, column gap 24. Row 1: 8px dot + name 16/500 + "Done" pill. Row 2: score 136px with "/ 100" 20px muted. Row 3: Cost / Duration / Tests stat pairs (label 13 muted above value 22/600), and right-aligned "View PR #143" button (white `#F4F4F7` bg, `#0A0A0F` text, 13/500, 8×14 padding, 6px radius).
- Right column: three equal-height rows (flex:1, gap 12): rank 13 muted | dot 7px + name 14/500 + status pill 11px | meta line 12 muted `$0.92 · 4:58 · 48/48` | score 32/700 right.
Breakdown surface (hairline, 12px radius, padding 8×24): title row "Score breakdown" 13/500 + legend (8px squares) right. One row per agent, `150px 1fr 48px` grid, padding 18 vertical, .06 dividers. Bar: grid `1fr 4fr` — left cell is the penalty zone (right border 1px `rgba(255,255,255,.18)` = zero line), right cell the positive track. Segments 6px tall, 2px gaps, widths = points as % of 100 on the positive track; penalty width = |tamper|/25 of the penalty zone (so both scale equally). Outer corners 3px. Receipts line under each bar (12px, muted, indented 20%): `48/48 tests`, `+41 −12`, `3 files`, `exit ok`, flags in red. Crashed agent shows "No score, run crashed" instead of a bar.
Footer: "Share card", "Copy results" ghost buttons (border `rgba(255,255,255,.12)`, bg .03, 13/500, 7×14, 6px radius), right-aligned.

### 2. Race view (`Bakeoff Race`)
Header as Scoreboard, bottom hairline, right text `N of 4 running` (computed from statuses).
One surface (12px, hairline, .02 tint, overflow hidden) containing stacked lanes separated by .06 dividers. Lane (padding 18/24/16, click target = whole lane):
- Row 1 grid `220px 1fr auto`: dot 8px + name 15/500 + status pill | last action 13px `rgba(255,255,255,.45)` single line ellipsis | right group: elapsed 18/600 + "elapsed" label, `118k / 6.1k` + "tokens", `3` + "files".
- Row 2 grid `1fr 64px`: cost track 6px, bg .06, radius 3. Fill = costUsd/budget, `linear-gradient(90deg, <agent>33, <agent>CC)`, `transition: width .6s linear`. Cost label 13/600 in agent color sits above the fill's right end (`translateX(-100%)`). Budget marker: 1×12px line `rgba(255,255,255,.35)` at the track's right end; "$3.00 budget" 12 muted to the right.
- Log drawer (toggled per lane, Gemini open by default): bg `rgba(255,255,255,.015)`, top divider, padding 14/24/16, Geist Mono 12/1.5 `rgba(255,255,255,.45)`; lines starting `Error` in `rgba(248,113,113,.8)`, lines starting `✓` in `rgba(74,222,128,.7)`.
Fixture state: Claude Code running $1.20, Codex done $0.92, OpenCode running $0.80, Gemini crashed $0.41 with log tail `Error: ENOENT: no such file or directory, open 'src/export/dpi.ts'`.

### 3. Ladder (`Bakeoff Ladder`)
Header: "Ladder" 15/500, repo muted, "6 races" right. Table surface (12px, hairline, padding 0 24). Columns `32px 1fr 100px 80px 80px 110px 110px 140px`, gap 16; header 12/500 muted; rows padding 16, .06 dividers. Cells: rank muted 13 | dot + name 14/500 | rating 20/600 −0.03em right | races 14 | wins 14 | avg cost `$1.71` | avg time `6:29` | sparkline SVG 140×28, polyline 1.5px in agent color at .85 opacity, 2.5px end dot. Sorted by rating.
Empty state (second frame): same header/table header, then 72px vertical padding, centered: "No races yet." 14/500 and "Run one with `bakeoff run owner/repo#123`" 13 muted, the command in a Geist Mono 12 chip (bg .05, hairline, 6px radius, 2×7 padding).

### 4. Share card (`Bakeoff Share Card`)
Fixed 1200×630, bg `#0A0A0F`, padding 56/64, no grid texture. Radial glow ellipse 820×620 in winner color (`#F59E6B2E → 12 → transparent`) behind the left card. Title 26/500 + repo 20 muted. Grid `1.25fr 1fr`, gap 40. Winner card 16px radius, inner glow, padding 32/36: 14px dot + name 28/500; score 180/700 −0.05em + "/ 100" 28 muted; Cost/Duration/Tests 16 muted label over 30/600 value. Right: three equal rows (16px radius): rank 18 muted | 10px dot + name 22/500 over meta 16 muted (`$0.92 · 4:58`) | score 52/700. Wordmark bottom-right: 8px white square + "bakeoff" 16/600 −0.02em.

## Interactions & motion
- Scoreboard load: page glow fades in (`opacity 0→1`, 1.6s ease-out); winner score counts 0→85 over 1.4s with cubic ease-out. Nothing else animates. No hover animations anywhere.
- Race view: elapsed timers tick every 1s for running agents; cost fill and label creep forward (width transition .6s linear). Clicking a lane toggles its log drawer; multiple can be open.
- Buttons/links have no hover motion; a static color change at most.

## State
Run object per the fixture JSON (agents[], budgetUsd, config.hiddenTests/ci/judge). Derived: ranking by score; `running = agents.filter(s => s.status==='running').length`; segment widths from `breakdown` with `null` → n/a; `tamper < 0` → penalty. Race view state: `openDrawers: Set<agentId>`, live tick for elapsed/cost. Ladder: per-repo history with rating series per agent.

## Fixture data
See `fixture.json` (verbatim from the brief). Ladder history and race-view log lines are illustrative and not part of the fixture.

## Files
- `Bakeoff Scoreboard.dc.html`, `Bakeoff Race.dc.html`, `Bakeoff Ladder.dc.html`, `Bakeoff Share Card.dc.html` — editable sources
- `standalone/` — self-contained offline copies of each screen
- `fixture.json` — run data
