import type { AgentResult, AgentStatus, TamperFlag } from '@contract';
import { Dot } from './Dot';
import { testsDetail } from './WinnerSurface';
import { ModelLine } from './ModelLine';
import { DRIVER_META, SEGMENTS, T, modelLabel, segmentsOf, surface } from '../theme';

const FLAG_WORD: Record<TamperFlag['rule'], string> = {
  test_skipped: 'skipped test',
  test_deleted: 'deleted test',
  asserts_weakened: 'weakened asserts',
  config_write: 'edited config',
  hidden_path_write: 'wrote hidden path',
};
export const flagLabel = (f: TamperFlag) => `${FLAG_WORD[f.rule]}: ${f.file}`;

const NO_SCORE: Partial<Record<AgentStatus, string>> = {
  timeout: 'No score, run timed out',
  budget_exceeded: 'No score, run went over budget',
};
const noScoreLabel = (s: AgentStatus) => NO_SCORE[s] ?? 'No score, run crashed';

export function Breakdown({ agents }: { agents: AgentResult[] }) {
  const legend = [
    ...SEGMENTS.map((s) => ({ name: s.name, color: s.color, border: 'none' })),
    { name: 'Penalty', color: T.penalty, border: 'none' },
    { name: 'n/a', color: 'transparent', border: '1px dashed rgba(255,255,255,.3)' },
  ];
  return (
    <div style={{ ...surface, display: 'flex', flexDirection: 'column', padding: '8px 24px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '14px 0 12px', borderBottom: `1px solid ${T.divider}` }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>Score breakdown</span>
        <div style={{ display: 'flex', gap: 16, fontSize: 12, color: T.muted }}>
          {legend.map((l) => (
            <span key={l.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 8, height: 8, borderRadius: 2, background: l.color, border: l.border, boxSizing: 'border-box', display: 'block' }} />
              {l.name}
            </span>
          ))}
        </div>
      </div>
      {agents.map((a, i) => {
        const meta = DRIVER_META[a.driver];
        const segs = a.score ? segmentsOf(a.score) : [];
        const penalty = a.score?.tamperPenalty ?? 0;
        return (
          <div
            key={a.driver}
            style={{
              display: 'grid', gridTemplateColumns: '150px 1fr 48px', gap: 20, alignItems: 'center',
              padding: '18px 0', borderBottom: i === agents.length - 1 ? 'none' : `1px solid ${T.divider}`,
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 3, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Dot color={meta.color} px={7} />
                <span style={{ fontSize: 13, fontWeight: 500 }}>{meta.name}</span>
              </div>
              <ModelLine text={modelLabel(a.model, a.requestedModel)} indent={15} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 4fr', alignItems: 'center' }}>
                <div style={{ display: 'flex', justifyContent: 'flex-end', borderRight: `1px solid ${T.zeroLine}`, height: 6, alignItems: 'center' }}>
                  {penalty < 0 && (
                    <span style={{ height: 6, borderRadius: '3px 0 0 3px', background: T.penalty, width: `${(Math.abs(penalty) / 25) * 100}%`, display: 'block' }} />
                  )}
                </div>
                <div style={{ display: 'flex', gap: 2, height: 6 }}>
                  {a.score ? (
                    segs.map((s, j) => (
                      <span
                        key={s.id}
                        style={{
                          height: 6,
                          width: `${s.widthPct}%`,
                          borderRadius: j === 0 ? '3px 0 0 3px' : j === segs.length - 1 ? '0 3px 3px 0' : 0,
                          background: s.na ? 'transparent' : (s.awarded ?? 0) > 0 ? s.color : T.track,
                          border: s.na ? T.naBorder : 'none',
                          boxSizing: 'border-box', display: 'block', flex: 'none',
                        }}
                      />
                    ))
                  ) : (
                    <span style={{ fontSize: 12, color: T.faint, lineHeight: '6px' }}>{noScoreLabel(a.status)}</span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 16, fontSize: 12, color: T.muted, paddingLeft: '20%' }}>
                <span>{testsDetail(a)} tests</span>
                <span>
                  <span style={{ color: T.plus }}>+{a.linesAdded}</span> <span style={{ color: T.minus }}>-{a.linesRemoved}</span>
                </span>
                <span>{a.filesTouched.length} files</span>
                <span>exit {a.exitCode === 0 ? 'ok' : a.exitCode ?? a.status}</span>
                {a.score?.tamperFlags.map((f, j) => (
                  <span key={j} style={{ color: T.minus }}>{flagLabel(f)}</span>
                ))}
              </div>
            </div>
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: '-.03em', textAlign: 'right' }}>{a.score ? a.score.total : 0}</span>
          </div>
        );
      })}
    </div>
  );
}
