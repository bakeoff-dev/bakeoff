import type { AgentStatus, DriverId, TokenUsage } from '@contract';

export const DRIVER_NAME: Record<DriverId, string> = {
  claude: 'Claude Code', codex: 'Codex', opencode: 'OpenCode', gemini: 'Gemini CLI',
};
export const DRIVER_HEX: Record<DriverId, string> = {
  claude: '#F59E6B', codex: '#5EC8CE', opencode: '#E58BC7', gemini: '#9BCB6E',
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

export function fmtClock(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtClockPadded(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
export function fmtTok(t: TokenUsage | null): string {
  return t ? `${Math.round((t.input + t.output) / 1000)}k tok` : '— tok';
}
/** null is "unavailable" and renders as such; it is never coerced to $0.00. */
export const fmtCost = (n: number | null): string => (n === null ? 'n/a' : `$${n.toFixed(2)}`);

export function spendBar(cost: number | null, budget: number, width = 20, hex = '#FFFFFF'): string {
  const filled = cost === null ? 0 : Math.min(width, Math.round((cost / budget) * width));
  return paint(hex, '▰'.repeat(filled)) + dim('▱'.repeat(width - filled));
}
