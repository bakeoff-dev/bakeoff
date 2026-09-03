import { useEffect, useState } from 'react';
import { loadBootstrap, useRaceState } from './data';
import { Race } from './screens/Race';
import { Scoreboard } from './screens/Scoreboard';
import { T, ghostButton, page } from './theme';

const bootstrap = loadBootstrap();
type Tab = 'race' | 'scoreboard' | 'ladder';
const TABS: [Tab, string][] = [['race', 'Race'], ['scoreboard', 'Scoreboard'], ['ladder', 'Ladder']];

export function App() {
  const state = useRaceState(bootstrap);
  const [tab, setTab] = useState<Tab>(state.finished ? 'scoreboard' : 'race');
  useEffect(() => {
    if (state.finished) setTab('scoreboard');
  }, [state.finished]);
  return (
    <div style={page}>
      <nav style={{ position: 'relative', width: 1200, margin: '0 auto', padding: '18px 0 0', display: 'flex', justifyContent: 'flex-end', gap: 8, zIndex: 1 }}>
        {TABS.map(([k, label]) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            style={{
              ...ghostButton,
              background: tab === k ? 'rgba(255,255,255,.08)' : ghostButton.background,
              color: tab === k ? T.text : T.muted,
            }}
          >
            {label}
          </button>
        ))}
      </nav>
      {tab === 'scoreboard' && <Scoreboard state={state} />}
      {tab === 'race' && <Race state={state} bootstrap={bootstrap} />}
      {tab === 'ladder' && <div style={{ padding: 36, color: T.muted }}>Ladder arrives in Task 31.</div>}
    </div>
  );
}
