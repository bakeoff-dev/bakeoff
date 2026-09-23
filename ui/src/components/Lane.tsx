import { useState, type MouseEvent } from 'react';
import type { AgentLane, RunRecord } from '@contract';
import { Dot } from './Dot';
import { Pill } from './Pill';
import { ModelLine } from './ModelLine';
import { DRIVER_META, T, fmtClock, fmtCost, fmtTok, ghostButton, modelLabel } from '../theme';
import { useNow } from '../useNow';

export const logColor = (line: string): string =>
  line.startsWith('Error') ? 'rgba(248,113,113,.8)' : line.startsWith('✓') ? 'rgba(74,222,128,.7)' : T.dim;

/** A running lane counts up from its start; an exited one shows the duration it was given. */
export function elapsedOf(lane: AgentLane, now: number): number {
  if (lane.status !== 'running') return lane.durationMs ?? 0;
  if (!lane.startedAt) return 0;
  return Math.max(0, now - Date.parse(lane.startedAt));
}

export const costFillPct = (costUsd: number | null, budget: number): number =>
  costUsd === null || budget <= 0 ? 0 : Math.min(100, (costUsd / budget) * 100);

const Meter = ({ value, label }: { value: string; label: string }) => (
  <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
    <span style={{ fontSize: 14, fontWeight: 500 }}>{value}</span>
    <span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>{label}</span>
  </div>
);

export function Lane({
  lane, budget, record, live, last,
}: { lane: AgentLane; budget: number; record: RunRecord | null; live: boolean; last: boolean }) {
  const [open, setOpen] = useState(false);
  const running = lane.status === 'running';
  const now = useNow(running);
  const elapsed = elapsedOf(lane, now);
  const meta = DRIVER_META[lane.driver];
  const fillPct = costFillPct(lane.costUsd, budget);
  const tail = record?.agents.find((a) => a.driver === lane.driver)?.logTail ?? '';
  const abort = (e: MouseEvent) => {
    e.stopPropagation();
    void fetch(`/abort/${lane.driver}`, { method: 'POST' });
  };
  return (
    <div style={{ borderBottom: last ? 'none' : `1px solid ${T.divider}` }}>
      <div
        onClick={() => setOpen(!open)}
        style={{ cursor: 'pointer', padding: '18px 24px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}
      >
        <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr auto', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Dot color={meta.color} px={8} />
              <span style={{ fontSize: 15, fontWeight: 500 }}>{meta.name}</span>
              <Pill status={lane.status} size={11} label={lane.status === 'ok' && lane.prUrl ? 'PR open' : undefined} />
            </div>
            {/* A lane only ever learns what started, never what was asked for. */}
            <ModelLine text={modelLabel(lane.model, undefined)} indent={18} />
          </div>
          <span style={{ fontSize: 13, color: T.dim, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', minWidth: 0 }}>
            {lane.lastAction || (running ? 'starting' : '')}
          </span>
          <div style={{ display: 'flex', gap: 28, alignItems: 'baseline' }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'baseline' }}>
              <span style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-.02em' }}>{fmtClock(elapsed)}</span>
              <span style={{ fontSize: 12, fontWeight: 500, color: T.muted }}>elapsed</span>
            </div>
            <Meter value={fmtTok(lane.tokens)} label="tokens" />
            <Meter value={String(lane.filesTouched)} label="files" />
            {live && running && (
              <button onClick={abort} style={{ ...ghostButton, padding: '3px 9px', fontSize: 12 }}>Abort</button>
            )}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 64px', alignItems: 'center', gap: 14 }}>
          <div style={{ position: 'relative', height: 6, borderRadius: 3, background: T.track }}>
            <span
              style={{
                position: 'absolute', left: 0, top: 0, height: 6, width: `${fillPct}%`, borderRadius: 3,
                background: `linear-gradient(90deg, ${meta.color}33, ${meta.color}CC)`, display: 'block',
                transition: 'width .6s linear',
              }}
            />
            <span
              style={{
                position: 'absolute', left: `${fillPct}%`, top: -16,
                transform: fillPct > 0 ? 'translateX(-100%)' : 'none',
                fontSize: 13, fontWeight: 600, letterSpacing: '-.02em', color: meta.color,
                transition: 'left .6s linear', whiteSpace: 'nowrap',
              }}
            >
              {lane.costUsd === null ? 'cost n/a' : fmtCost(lane.costUsd)}
            </span>
            <span style={{ position: 'absolute', right: 0, top: -3, width: 1, height: 12, background: 'rgba(255,255,255,.35)', display: 'block' }} />
          </div>
          <span style={{ fontSize: 12, fontWeight: 500, color: T.muted, textAlign: 'right' }}>{fmtCost(budget)} budget</span>
        </div>
      </div>
      {open && (
        <div
          style={{
            background: 'rgba(255,255,255,.015)', borderTop: `1px solid ${T.divider}`, padding: '14px 24px 16px',
            display: 'flex', flexDirection: 'column', gap: 5, fontFamily: T.mono, fontSize: 12, lineHeight: 1.5, color: T.dim,
          }}
        >
          {(tail || 'Log available when the agent exits').split('\n').map((line, i) => (
            <span key={i} style={{ whiteSpace: 'pre', color: logColor(line) }}>{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
