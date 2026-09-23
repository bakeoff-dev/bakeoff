import { SCHEMA_VERSION, competitorKey, type AgentResult, type Ladder, type LadderEntry, type RunRecord } from '@contract';
import { rate, rating as newRating } from 'openskill';

export const displayRating = (mu: number, sigma: number): number =>
  Math.round(1000 + 40 * (mu - 3 * sigma));

/** A competitor is a driver on a model: the same CLI on two models rates separately. */
function entry(ladder: Ladder, agent: Pick<AgentResult, 'driver' | 'model'>): LadderEntry {
  const initial = newRating();
  return (
    ladder.entries[competitorKey(agent.driver, agent.model)] ?? {
      driver: agent.driver,
      model: agent.model,
      mu: initial.mu,
      sigma: initial.sigma,
      rating: displayRating(initial.mu, initial.sigma),
      races: 0,
      wins: 0,
      avgCostUsd: null,
      avgDurationMs: 0,
      history: [],
    }
  );
}

export function updateLadder(ladder: Ladder, rec: RunRecord): Ladder {
  const alreadyRecorded = Object.values(ladder.entries).some((item) =>
    item?.history.some((history) => history.runId === rec.id),
  );
  if (alreadyRecorded) return ladder;

  const entries: Ladder['entries'] = { ...ladder.entries };
  const ranked = rec.agents.filter(
    (agent) => agent.status === 'ok' && agent.rank !== null,
  );
  const at = rec.finishedAt ?? rec.createdAt;

  if (ranked.length >= 2) {
    const teams = ranked.map((agent) => {
      const current = entry(ladder, agent);
      return [{ mu: current.mu, sigma: current.sigma }];
    });
    const ratings = rate(teams, {
      rank: ranked.map((agent) => agent.rank!),
    });

    ranked.forEach((agent, index) => {
      const current = entry(ladder, agent);
      const next = ratings[index]![0]!;
      const races = current.races + 1;
      const avgCostUsd =
        agent.costUsd === null
          ? current.avgCostUsd
          : current.avgCostUsd === null
            ? agent.costUsd
            : (current.avgCostUsd * current.races + agent.costUsd) / races;
      const rating = displayRating(next.mu, next.sigma);

      entries[competitorKey(agent.driver, agent.model)] = {
        ...current,
        mu: next.mu,
        sigma: next.sigma,
        rating,
        races,
        wins: current.wins + (agent.rank === 1 ? 1 : 0),
        avgCostUsd,
        avgDurationMs:
          (current.avgDurationMs * current.races + agent.durationMs) / races,
        history: [...current.history, { runId: rec.id, at, rating }],
      };
    });
  }

  for (const agent of rec.agents) {
    const key = competitorKey(agent.driver, agent.model);
    if (entries[key]?.history.some((history) => history.runId === rec.id)) {
      continue;
    }
    const current = entry(ladder, agent);
    entries[key] = {
      ...current,
      history: [
        ...current.history,
        { runId: rec.id, at, rating: current.rating },
      ],
    };
  }

  return { schemaVersion: SCHEMA_VERSION, entries };
}

export function renderLadder(ladder: Ladder): string {
  const rows = Object.values(ladder.entries)
    .filter((item): item is LadderEntry => Boolean(item))
    .sort((left, right) => right.rating - left.rating);
  const header = ['agent', 'rating', 'races', 'wins', 'avg cost', 'avg time'];
  const data = rows.map((item) => [
    competitorKey(item.driver, item.model),
    String(item.rating),
    String(item.races),
    String(item.wins),
    item.avgCostUsd === null ? 'n/a' : `$${item.avgCostUsd.toFixed(2)}`,
    `${Math.round(item.avgDurationMs / 1000)}s`,
  ]);
  const widths = header.map((heading, index) =>
    Math.max(heading.length, ...data.map((row) => row[index]!.length)),
  );
  const line = (row: string[]) =>
    row
      .map((cell, index) => cell.padEnd(widths[index]!))
      .join('  ')
      .trimEnd();

  return [
    line(header),
    line(widths.map((width) => '-'.repeat(width))),
    ...data.map(line),
  ].join('\n');
}
