import { useEffect, useState } from 'react';
import type { AgentResult } from '@contract';
import { Dot } from './Dot';
import { Pill } from './Pill';
import { ModelLine } from './ModelLine';
import { DRIVER_META, T, fmtClock, fmtCost, modelLabel } from '../theme';

/** 0 -> target over 1.4s, cubic ease-out. The only animation on this screen besides the glow. */
function useCountUp(target: number, ms = 1400): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      setN(target);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / ms);
      const e = 1 - Math.pow(1 - p, 3);
      setN(Math.round(target * e * 10) / 10);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, ms]);
  return n;
}

const Stat = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
    <span style={{ fontSize: 13, fontWeight: 500, color: T.muted }}>{label}</span>
    <span style={{ fontSize: 22, fontWeight: 600, letterSpacing: '-.02em' }}>{value}</span>
  </div>
);

export function testsDetail(a: AgentResult): string {
  const detail = a.score?.components.find((c) => c.id === 'visible_tests')?.detail;
  const head = detail?.split(',')[0]?.replace(' passed', '');
  return head && head !== 'n/a' ? head : '—';
}

export function WinnerSurface({ a }: { a: AgentResult }) {
  const meta = DRIVER_META[a.driver];
  const n = useCountUp(a.score?.total ?? 0);
  return (
    <div
      style={{
        position: 'relative', border: `1px solid ${T.hairline}`, background: T.surface2, borderRadius: 12,
        padding: '28px 32px 30px', boxShadow: `inset 0 0 0 1px ${meta.color}22, inset 0 0 80px ${meta.color}14`,
        display: 'flex', flexDirection: 'column', gap: 24,
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Dot color={meta.color} px={8} />
          <span style={{ fontSize: 16, fontWeight: 500 }}>{meta.name}</span>
          <Pill status={a.status} label={a.prUrl ? 'PR open' : undefined} />
        </div>
        <ModelLine text={modelLabel(a.model, a.requestedModel)} size={13} indent={18} />
      </div>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
        <span style={{ fontSize: 136, lineHeight: 0.9, fontWeight: 700, letterSpacing: '-.04em' }}>{n}</span>
        <span style={{ fontSize: 20, color: T.muted }}>/ {a.score?.maxPossible ?? 0}</span>
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 36 }}>
        <Stat label="Cost" value={fmtCost(a.costUsd)} />
        <Stat label="Duration" value={fmtClock(a.durationMs)} />
        <Stat label="Tests" value={testsDetail(a)} />
        {a.prUrl && (
          <a
            href={a.prUrl}
            style={{ marginLeft: 'auto', fontSize: 13, fontWeight: 500, color: T.bg, background: T.text, padding: '8px 14px', borderRadius: 6 }}
          >
            View PR #{a.prNumber}
          </a>
        )}
      </div>
    </div>
  );
}
