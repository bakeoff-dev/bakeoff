import type { AgentStatus, DriverId, TokenUsage } from '@contract';

export const DRIVER_NAME: Record<DriverId, string> = {
  claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode', gemini: 'Gemini CLI', cursor: 'Cursor',
};
export const DRIVER_HEX: Record<DriverId, string> = {
  claude: '#F59E6B', codex: '#5EC8CE', opencode: '#E58BC7', gemini: '#9BCB6E', cursor: '#A99BF0',
};
export const STATUS_HEX: Record<AgentStatus, string> = {
  running: '#60A5FA', ok: '#4ADE80', crashed: '#F87171', timeout: '#F87171', budget_exceeded: '#F87171',
};
export const STATUS_WORD: Record<AgentStatus, string> = {
  running: 'running', ok: 'done', crashed: 'crashed', timeout: 'timed out', budget_exceeded: 'over budget',
};
export const SOFT_RED = '#F87171';

export function colorEnabled(out: { isTTY?: boolean } = process.stdout): boolean {
  if (process.env.NO_COLOR) return false;
  if (process.env.FORCE_COLOR && process.env.FORCE_COLOR !== '0') return true;
  return !!out.isTTY;
}

const truecolor = (): boolean =>
  /truecolor|24bit/i.test(process.env.COLORTERM ?? '') || process.env.FORCE_COLOR === '3';
const rgb = (hex: string): [number, number, number] =>
  [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as [number, number, number];
const to256 = ([r, g, b]: [number, number, number]): number =>
  16 + 36 * Math.round(r / 51) + 6 * Math.round(g / 51) + Math.round(b / 51);

export function paint(hex: string, s: string): string {
  if (!colorEnabled()) return s;
  const c = rgb(hex);
  return truecolor() ? `\x1b[38;2;${c[0]};${c[1]};${c[2]}m${s}\x1b[39m` : `\x1b[38;5;${to256(c)}m${s}\x1b[39m`;
}
export const dim = (s: string): string => (colorEnabled() ? `\x1b[2m${s}\x1b[22m` : s);
export const bold = (s: string): string => (colorEnabled() ? `\x1b[1m${s}\x1b[22m` : s);

/** SGR sequences occupy no cells. Split on them so width and truncation agree. */
const SGR_SPLIT = /(\x1b\[[0-9;]*m)/;
const SGR_TEST = /^\x1b\[[0-9;]*m$/;
const RESET = '\x1b[0m';

/**
 * Visible cells a string occupies. East Asian Wide and Fullwidth code points take two;
 * everything else, including the ambiguous-width glyphs this UI uses (● ▰ ▱), takes one,
 * which is how macOS Terminal and iTerm2 render them by default.
 */
export function displayWidth(s: string): number {
  let n = 0;
  for (const part of s.split(SGR_SPLIT)) {
    if (SGR_TEST.test(part)) continue;
    for (const ch of part) n += isWide(ch) ? 2 : 1;
  }
  return n;
}

function isWide(ch: string): boolean {
  const c = ch.codePointAt(0) ?? 0;
  return (
    (c >= 0x1100 && c <= 0x115f) || (c >= 0x2e80 && c <= 0x303e) || (c >= 0x3041 && c <= 0x33ff) ||
    (c >= 0x3400 && c <= 0x4dbf) || (c >= 0x4e00 && c <= 0x9fff) || (c >= 0xa000 && c <= 0xa4cf) ||
    (c >= 0xac00 && c <= 0xd7a3) || (c >= 0xf900 && c <= 0xfaff) || (c >= 0xfe30 && c <= 0xfe6f) ||
    (c >= 0xff00 && c <= 0xff60) || (c >= 0xffe0 && c <= 0xffe6) || (c >= 0x20000 && c <= 0x3fffd)
  );
}

/** Cut to `max` visible cells without splitting an escape sequence, resetting colour at the cut. */
export function truncate(s: string, max: number): string {
  if (displayWidth(s) <= max) return s;
  let out = '';
  let n = 0;
  let painted = false;
  for (const part of s.split(SGR_SPLIT)) {
    if (SGR_TEST.test(part)) {
      out += part;
      painted = true;
      continue;
    }
    for (const ch of part) {
      const w = isWide(ch) ? 2 : 1;
      if (n + w > max) return painted ? out + RESET : out;
      out += ch;
      n += w;
    }
  }
  return painted ? out + RESET : out;
}

export function fmtClock(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtClockPadded(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
/**
 * Every token the turn paid for, not just the uncached ones. Claude sends nearly all
 * of its context through the cache -- a recorded race showed 28 input tokens against
 * 468k cache reads -- so summing input and output alone renders "0k tok" all race.
 */
export function fmtTok(t: TokenUsage | null): string {
  if (!t) return '— tok';
  const total = t.input + t.cacheRead + t.cacheWrite + t.output;
  return `${Math.round(total / 1000)}k tok`;
}
/**
 * null is "unavailable" and renders as such; it is never coerced to $0.00. A real cost
 * too small to show at two decimals reads as `<$0.01`, because a cheap model rounding
 * to `$0.00` looks free rather than nearly free.
 */
export const fmtCost = (n: number | null): string => {
  if (n === null) return 'n/a';
  if (n > 0 && n < 0.005) return '<$0.01';
  return `$${n.toFixed(2)}`;
};

export function spendBar(cost: number | null, budget: number, width = 20, hex = '#FFFFFF'): string {
  const filled = cost === null ? 0 : Math.min(width, Math.round((cost / budget) * width));
  return paint(hex, '▰'.repeat(filled)) + dim('▱'.repeat(width - filled));
}
