import {
  RaceEventSchema, type AgentStatus, type Baseline, type Caps, type DriverId, type IssueInfo,
  type RaceEvent, type RepoInfo, type RunRecord, type ScoreBreakdown, type TokenUsage,
} from './schema';

export interface AgentLane {
  driver: DriverId; model: string | null; status: AgentStatus; branch: string; startedAt: string | null;
  costUsd: number | null; tokens: TokenUsage | null; lastAction: string; filesTouched: number;
  durationMs: number | null; exitCode: number | null; prUrl: string | null; prNumber: number | null;
  score: ScoreBreakdown | null;
}
export interface RaceState {
  runId: string | null; issue: IssueInfo | null; repo: RepoInfo | null; caps: Caps | null;
  baseline: Baseline | null; agents: AgentLane[]; finished: boolean; record: RunRecord | null;
}
export const initialState: RaceState = {
  runId: null, issue: null, repo: null, caps: null, baseline: null, agents: [], finished: false, record: null,
};

function lane(driver: DriverId): AgentLane {
  return { driver, model: null, status: 'running', branch: '', startedAt: null, costUsd: null, tokens: null, lastAction: '',
    filesTouched: 0, durationMs: null, exitCode: null, prUrl: null, prNumber: null, score: null };
}
function patch(s: RaceState, driver: DriverId, f: (l: AgentLane) => AgentLane): RaceState {
  if (!s.agents.some((a) => a.driver === driver)) return s;
  return { ...s, agents: s.agents.map((a) => (a.driver === driver ? f(a) : a)) };
}

export function applyEvent(s: RaceState, e: RaceEvent): RaceState {
  switch (e.type) {
    case 'race.started':
      return { ...initialState, runId: e.runId, issue: e.issue, repo: e.repo, caps: e.caps, baseline: e.baseline, agents: e.agents.map(lane) };
    case 'agent.started':
      return patch(s, e.driver, (l) => ({ ...l, branch: e.branch, startedAt: e.at, status: 'running', model: e.model }));
    case 'agent.progress':
      return patch(s, e.driver, (l) => ({ ...l, costUsd: e.costUsd, tokens: e.tokens, lastAction: e.lastAction, filesTouched: e.filesTouched }));
    case 'agent.exited':
      return patch(s, e.driver, (l) => ({ ...l, status: e.status, exitCode: e.exitCode, durationMs: e.durationMs, costUsd: e.costUsd, tokens: e.tokens }));
    case 'agent.pr_opened':
      return patch(s, e.driver, (l) => ({ ...l, prUrl: e.prUrl, prNumber: e.prNumber }));
    case 'agent.scored':
      return patch(s, e.driver, (l) => ({ ...l, score: e.score }));
    case 'race.finished':
      return { ...s, finished: true, record: e.record };
  }
}
export function reduceEvents(events: RaceEvent[], start: RaceState = initialState): RaceState {
  return events.reduce(applyEvent, start);
}
export function parseEventLines(text: string): RaceEvent[] {
  return text.split('\n').filter((l) => l.trim().length > 0).map((l) => RaceEventSchema.parse(JSON.parse(l)));
}
