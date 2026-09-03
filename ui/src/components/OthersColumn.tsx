import type { AgentResult } from '@contract';
import { Dot } from './Dot';
import { Pill } from './Pill';
import { testsDetail } from './WinnerSurface';
import { DRIVER_META, T, fmtClock, fmtCost, surface } from '../theme';

export function OthersColumn({ agents }: { agents: AgentResult[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {agents.map((a, i) => {
        const meta = DRIVER_META[a.driver];
        return (
          <div
            key={a.driver}
            style={{ ...surface, flex: 1, padding: '16px 20px', display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: 14, alignItems: 'center' }}
          >
            <span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>{a.rank ?? i + 2}</span>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dot color={meta.color} px={7} />
                <span style={{ fontSize: 14, fontWeight: 500 }}>{meta.name}</span>
                <Pill status={a.status} size={11} />
              </div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12, color: T.muted }}>
                <span>{fmtCost(a.costUsd)}</span>
                <span>{fmtClock(a.durationMs)}</span>
                <span>{testsDetail(a)}</span>
              </div>
            </div>
            <span style={{ fontSize: 32, fontWeight: 700, letterSpacing: '-.04em', lineHeight: 1 }}>{a.score ? a.score.total : 0}</span>
          </div>
        );
      })}
    </div>
  );
}
