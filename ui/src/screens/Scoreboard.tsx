import type { RaceState, RunRecord } from '@contract';
import { Breakdown } from '../components/Breakdown';
import { OthersColumn } from '../components/OthersColumn';
import { Pill } from '../components/Pill';
import { WinnerSurface } from '../components/WinnerSurface';
import { DRIVER_META, T, col, fmtClock, fmtCost, ghostButton } from '../theme';

export function Scoreboard({ state }: { state: RaceState }) {
  const rec = state.record;
  if (!rec) return <div style={col}><span style={{ color: T.muted }}>Race still running.</span></div>;
  const ranked = [...rec.agents].sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
  const winner = ranked[0];
  if (!winner) return <div style={col}><span style={{ color: T.muted }}>No agents in this run.</span></div>;
  const wc = DRIVER_META[winner.driver].color;
  // Relatively positioned so the page glow is anchored to the top of this screen,
  // matching the handoff where the scoreboard is the whole page.
  return (
    <div style={{ position: 'relative' }}>
      <div
        style={{
          position: 'absolute', left: '50%', top: 120, width: 1100, height: 620, transform: 'translateX(-50%)',
          pointerEvents: 'none', background: `radial-gradient(ellipse at 35% 40%, ${wc}1A 0%, ${wc}0A 30%, transparent 65%)`,
          animation: 'glowIn 1.6s ease-out both',
        }}
      />
      <div style={col}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <span style={{ fontSize: 15, fontWeight: 500 }}>{rec.issue.title}</span>
          <span style={{ fontSize: 13, color: T.muted }}>{rec.repo.owner}/{rec.repo.name} #{rec.issue.number}</span>
          <span style={{ fontSize: 13, color: T.muted }}>{rec.id}</span>
          <span style={{ marginLeft: 'auto' }}><Pill status="ok" label="Finished" /></span>
        </div>
        {rec.baseline.testsGreen === false && (
          <div style={{ fontSize: 13, color: T.warn }}>
            Tests were already failing on {rec.repo.baseSha.slice(0, 7)}. Visible-test points are unreliable for this run.
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: '1.6fr 1fr', gap: 16, alignItems: 'stretch' }}>
          <WinnerSurface a={winner} />
          <OthersColumn agents={ranked.slice(1)} />
        </div>
        <Breakdown agents={ranked} />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <a href={`./${rec.id}.png`} style={ghostButton}>Share card</a>
          <button onClick={() => void navigator.clipboard.writeText(toMarkdown(rec))} style={ghostButton}>Copy results</button>
        </div>
      </div>
    </div>
  );
}

export function toMarkdown(rec: RunRecord): string {
  const rows = [...rec.agents]
    .sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
    .map((a) =>
      `| ${a.rank ?? '-'} | ${DRIVER_META[a.driver].name} | ${a.score ? `${a.score.total}/${a.score.maxPossible}` : a.status} | ${fmtCost(a.costUsd)} | ${fmtClock(a.durationMs)} | ${a.prUrl ? `[#${a.prNumber}](${a.prUrl})` : '-'} |`);
  return [
    `**Bakeoff** · [#${rec.issue.number} ${rec.issue.title}](${rec.issue.url})`,
    '',
    '| # | Agent | Score | Cost | Time | PR |',
    '|---|---|---|---|---|---|',
    ...rows,
  ].join('\n');
}
