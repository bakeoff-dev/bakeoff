# Terminal output

Principles: same as the web UI. One agent color each (truecolor, fall back to 256), muted grey for labels, white for numbers, tabular alignment, generous line spacing. No box-drawing borders, no ASCII art, no emoji. Nothing scrolls except the log tail. References: Vitest runner, Turborepo, Charm/lipgloss.

## Live view (Ink, redraws in place)

  bakeoff  shifan/gridloom #142  Image export ignores custom DPI setting
  3 of 4 running                                          02:14 elapsed

  ● Claude Code   running   $1.20 ▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱ $3.00   181k tok   3 files
                            editing src/export/dpi.ts

  ● Codex         done      $0.92 ▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱ $3.00    96k tok   9 files   PR #144

  ● OpenCode      running   $0.80 ▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱ $3.00   120k tok   4 files
                            running npm test

  ● Gemini CLI    crashed   $0.41 ▰▰▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱ $3.00    44k tok   1 file
                            Error: ENOENT: no such file or directory, open 'src/export/dpi.ts'

The ● is the agent color. The fill uses the agent color for filled cells and dim grey for empty. Second line per agent is the last action, dimmed, truncated to terminal width. Status word colors: running blue, done green, crashed/timed out red, matching the web tokens.

## Final table (plain text, no redraw)

  bakeoff  shifan/gridloom #142  Image export ignores custom DPI setting

   1  Claude Code    85   $1.84   6:52   48/48   +41 -12   3 files   PR #143
   2  Codex          40   $0.92   4:58   48/48   +210 -34  9 files   PR #144
   3  OpenCode       10   $1.10   5:55   47/48   +33 -18   4 files   PR #145   skipped test: export.test.ts
   4  Gemini CLI      0   $0.41   1:33   crashed

  Scoreboard  .bakeoff/runs/r_7f3a.html  (opened)
  Ladder      Claude Code 1240  Codex 1180  OpenCode 1090  Gemini CLI 990

Rank 1 line in the winner's agent color, others default. Penalty flags in soft red at the end of the row. Two blank lines above and below. Respects NO_COLOR and non-TTY (falls back to plain table, no live view).