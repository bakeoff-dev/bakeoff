import type { RaceState } from '@contract';
import type { Bootstrap } from '../data';
import { Lane } from '../components/Lane';
import { T, col, surface } from '../theme';

export function Race({ state, bootstrap }: { state: RaceState; bootstrap: Bootstrap }) {
  const running = state.agents.filter((a) => a.status === 'running').length;
  return (
    <div style={{ ...col, gap: 20 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, paddingBottom: 16, borderBottom: `1px solid ${T.hairline}` }}>
        <span style={{ fontSize: 15, fontWeight: 500 }}>{state.issue?.title ?? 'No run loaded'}</span>
        <span style={{ fontSize: 13, color: T.muted }}>
          {state.repo ? `${state.repo.owner}/${state.repo.name} #${state.issue?.number}` : ''}
        </span>
        <span style={{ fontSize: 13, color: T.muted }}>{state.runId ?? ''}</span>
        <span style={{ marginLeft: 'auto', fontSize: 13, color: T.muted }}>
          {state.finished ? 'Finished' : `${running} of ${state.agents.length} running`}
        </span>
      </div>
      <div style={{ ...surface, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {state.agents.map((lane, i) => (
          <Lane
            key={lane.driver}
            lane={lane}
            budget={state.caps?.budgetUsd ?? 1}
            record={state.record}
            live={bootstrap.mode === 'live'}
            last={i === state.agents.length - 1}
          />
        ))}
      </div>
    </div>
  );
}
