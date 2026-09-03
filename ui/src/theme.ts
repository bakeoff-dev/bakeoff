import type { AgentStatus, DriverId, ScoreBreakdown, TokenUsage } from '@contract';
import type { CSSProperties } from 'react';

/** Every literal below is transcribed from design/handoff/design_handoff_bakeoff. */
export const T = {
  bg: '#0A0A0F',
  text: '#F4F4F7',
  muted: 'rgba(255,255,255,.55)',
  dim: 'rgba(255,255,255,.45)',
  faint: 'rgba(255,255,255,.4)',
  hairline: 'rgba(255,255,255,.08)',
  divider: 'rgba(255,255,255,.06)',
  surface: 'rgba(255,255,255,.02)',
  surface2: 'rgba(255,255,255,.025)',
  track: 'rgba(255,255,255,.06)',
  plus: '#4ADE80',
  minus: '#F87171',
  warn: '#FBBF24',
  penalty: 'rgba(248,113,113,.65)',
  zeroLine: 'rgba(255,255,255,.18)',
  naBorder: '1px dashed rgba(255,255,255,.18)',
  mono: "'Geist Mono', ui-monospace, monospace",
} as const;

export const DRIVER_META: Record<DriverId, { name: string; color: string }> = {
  claude: { name: 'Claude Code', color: '#F59E6B' },
  codex: { name: 'Codex', color: '#5EC8CE' },
  opencode: { name: 'OpenCode', color: '#E58BC7' },
  gemini: { name: 'Gemini CLI', color: '#9BCB6E' },
};

export const PILL: Record<AgentStatus, { label: string; fg: string; bg: string }> = {
  running: { label: 'Running', fg: '#60A5FA', bg: 'rgba(96,165,250,.12)' },
  ok: { label: 'Done', fg: '#4ADE80', bg: 'rgba(74,222,128,.12)' },
  crashed: { label: 'Crashed', fg: '#F87171', bg: 'rgba(248,113,113,.12)' },
  timeout: { label: 'Timed out', fg: '#F87171', bg: 'rgba(248,113,113,.12)' },
  budget_exceeded: { label: 'Over budget', fg: '#F87171', bg: 'rgba(248,113,113,.12)' },
};

export const SEGMENTS = [
  { id: 'visible_tests', name: 'Tests', color: 'rgba(214,224,255,.62)' },
  { id: 'hidden_tests', name: 'Hidden tests', color: 'rgba(176,196,240,.5)' },
  { id: 'checks', name: 'Lint & types', color: 'rgba(160,214,214,.4)' },
  { id: 'ci', name: 'CI', color: 'rgba(206,196,236,.32)' },
  { id: 'diff', name: 'Diff discipline', color: 'rgba(220,208,180,.26)' },
  { id: 'judge', name: 'Judge', color: 'rgba(255,255,255,.18)' },
] as const;

export type SegmentId = (typeof SEGMENTS)[number]['id'];
export interface Segment {
  id: SegmentId; name: string; color: string;
  max: number; awarded: number | null; na: boolean; widthPct: number;
}

/**
 * Merge typecheck+lint into one display segment, drop components with max 0, and size widths
 * by the sum of all visible maxes so n/a segments keep their max as a dashed placeholder.
 */
export function segmentsOf(score: ScoreBreakdown): Segment[] {
  const get = (id: string) => score.components.find((c) => c.id === id);
  const tc = get('typecheck');
  const lint = get('lint');
  const merged = {
    max: (tc?.max ?? 0) + (lint?.max ?? 0),
    awarded: (tc?.awarded ?? null) === null && (lint?.awarded ?? null) === null ? null : (tc?.awarded ?? 0) + (lint?.awarded ?? 0),
  };
  const raw = SEGMENTS.map((s) => {
    const c = s.id === 'checks' ? merged : get(s.id);
    const awarded = c?.awarded ?? null;
    return { id: s.id, name: s.name, color: s.color, max: c?.max ?? 0, awarded, na: awarded === null };
  }).filter((s) => s.max > 0);
  const trackMax = raw.reduce((n, s) => n + s.max, 0) || 1;
  return raw.map((s) => ({ ...s, widthPct: ((s.na ? s.max : Math.max(0, s.awarded ?? 0)) / trackMax) * 100 }));
}

export const fmtCost = (n: number | null): string => (n === null ? 'n/a' : `$${n.toFixed(2)}`);
export function fmtClock(ms: number): string {
  const s = Math.round(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
const k = (n: number): string => (n >= 10000 ? `${Math.round(n / 1000)}k` : n >= 1000 ? `${(n / 1000).toFixed(1)}k` : String(n));
export const fmtTok = (t: TokenUsage | null): string => (t ? `${k(t.input)} / ${k(t.output)}` : '—');

export const page: CSSProperties = {
  position: 'relative', minHeight: '100vh', minWidth: 1200, overflow: 'clip',
  backgroundImage:
    'linear-gradient(rgba(255,255,255,.015) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.015) 1px,transparent 1px)',
  backgroundSize: '32px 32px',
};
export const col: CSSProperties = {
  position: 'relative', width: 1200, margin: '0 auto', padding: '36px 0 64px',
  display: 'flex', flexDirection: 'column', gap: 28,
};
export const surface: CSSProperties = { border: `1px solid ${T.hairline}`, background: T.surface, borderRadius: 12 };
export const pill = (status: AgentStatus, size: 12 | 11 = 12): CSSProperties => ({
  fontSize: size, fontWeight: 500, color: PILL[status].fg, background: PILL[status].bg,
  padding: size === 12 ? '3px 9px' : '2px 8px', borderRadius: 999,
});
export const dot = (color: string, px: number): CSSProperties => ({
  width: px, height: px, borderRadius: '50%', background: color, display: 'block', flex: 'none',
});
export const ghostButton: CSSProperties = {
  fontSize: 13, fontWeight: 500, color: T.text, border: '1px solid rgba(255,255,255,.12)',
  background: 'rgba(255,255,255,.03)', padding: '7px 14px', borderRadius: 6,
};
