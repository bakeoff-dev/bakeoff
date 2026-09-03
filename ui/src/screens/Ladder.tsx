import type { Ladder as LadderT, LadderEntry, RaceState } from '@contract';
import { Dot } from '../components/Dot';
import { Sparkline } from '../components/Sparkline';
import { DRIVER_META, T, col, fmtClock, fmtCost, surface } from '../theme';

const COLS = '32px 1fr 100px 80px 80px 110px 110px 140px';
const right = { textAlign: 'right' as const };
const row = { display: 'grid', gridTemplateColumns: COLS, gap: 16, alignItems: 'center' } as const;

export function ladderRows(ladder: LadderT | null): LadderEntry[] {
  if (!ladder) return [];
  return Object.values(ladder.entries)
    .filter((e): e is LadderEntry => !!e)
    .sort((a, b) => b.rating - a.rating);
}

/** One rating range for the whole column, so the sparklines can be read against each other. */
export function ratingDomain(rows: LadderEntry[]): [number, number] | null {
  const all = rows.flatMap((e) => e.history.map((h) => h.rating));
  return all.length ? [Math.min(...all), Math.max(...all)] : null;
}

export function Ladder({ ladder, state }: { ladder: LadderT | null; state: RaceState }) {
  const rows = ladderRows(ladder);
  const domain = ratingDomain(rows);
  const races = rows.reduce((n, e) => Math.max(n, e.history.length), 0);
  return (
    <div style={{ ...col, gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, paddingBottom: 16, borderBottom: `1px solid ${T.hairline}` }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>Ladder</span>
        <span style={{ fontSize: 13, color: T.muted }}>{state.repo ? `${state.repo.owner}/${state.repo.name}` : ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: T.muted }}>{races} race{races === 1 ? '' : 's'}</span>
      </div>
      <div style={{ ...surface, padding: '0 24px' }}>
        <div style={{ ...row, padding: '14px 0 12px', borderBottom: `1px solid ${T.divider}`, fontSize: 12, fontWeight: 500, color: T.muted }}>
          <span>#</span><span>Agent</span><span style={right}>Rating</span><span style={right}>Races</span>
          <span style={right}>Wins</span><span style={right}>Avg cost</span><span style={right}>Avg time</span>
          <span style={right}>Rating trend</span>
        </div>
        {rows.length === 0 ? (
          <div style={{ padding: '72px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
            <span style={{ fontSize: 14, fontWeight: 500 }}>No races yet.</span>
            <span style={{ fontSize: 13, color: T.muted }}>
              Run one with{' '}
              <span style={{ fontFamily: T.mono, fontSize: 12, color: 'rgba(255,255,255,.75)', background: 'rgba(255,255,255,.05)', border: `1px solid ${T.hairline}`, padding: '2px 7px', borderRadius: 6 }}>
                bakeoff run owner/repo#123
              </span>
            </span>
          </div>
        ) : rows.map((e, i) => (
          <div key={e.driver} style={{ ...row, padding: '16px 0', borderBottom: i === rows.length - 1 ? 'none' : `1px solid ${T.divider}` }}>
            <span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>{i + 1}</span>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Dot color={DRIVER_META[e.driver].color} px={8} />
              <span style={{ fontSize: 14, fontWeight: 500 }}>{DRIVER_META[e.driver].name}</span>
            </div>
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.03em', ...right }}>{e.rating}</span>
            <span style={{ fontSize: 14, ...right }}>{e.races}</span>
            <span style={{ fontSize: 14, ...right }}>{e.wins}</span>
            <span style={{ fontSize: 14, ...right }}>{fmtCost(e.avgCostUsd)}</span>
            <span style={{ fontSize: 14, ...right }}>{fmtClock(e.avgDurationMs)}</span>
            <Sparkline values={e.history.map((h) => h.rating)} color={DRIVER_META[e.driver].color} domain={domain} />
          </div>
        ))}
      </div>
    </div>
  );
}
