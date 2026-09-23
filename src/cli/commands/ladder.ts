import * as p from '@clack/prompts';
import type { Ladder, LadderEntry } from '@contract';
import { NAMES } from '../../core/names';
import { detectRepo } from '../../core/repo';
import { readLadder } from '../../core/store';
import { DRIVER_HEX, DRIVER_NAME, displayWidth, dim, fmtClock, fmtCost, paint } from '../render/style';

const HEAD = ['agent', 'model', 'rating', 'races', 'wins', 'avg cost', 'avg time'] as const;

/** A row per competitor, best first. A null model raced on whatever the provider picked. */
export function ladderTable(ladder: Ladder): string {
  const rows = Object.values(ladder.entries)
    .filter((e): e is LadderEntry => Boolean(e))
    .sort((x, y) => y.rating - x.rating);
  if (rows.length === 0) return `  No races yet. Run ${NAMES.bin} run to start the ladder.`;

  const cells = rows.map((e) => [
    DRIVER_NAME[e.driver],
    e.model ?? 'auto',
    String(e.rating),
    String(e.races),
    String(e.wins),
    fmtCost(e.avgCostUsd),
    fmtClock(e.avgDurationMs),
  ]);
  const widths = HEAD.map((h, i) => Math.max(displayWidth(h), ...cells.map((r) => displayWidth(r[i] ?? ''))));
  const line = (r: readonly string[]) =>
    r.map((c, i) => c + ' '.repeat(Math.max(0, (widths[i] ?? 0) - displayWidth(c)))).join('  ').trimEnd();

  return [
    `  ${dim(line(HEAD))}`,
    ...cells.map((r, i) => {
      const body = line(r);
      // The leader carries its agent colour, as the race table does.
      return `  ${i === 0 ? paint(DRIVER_HEX[rows[i]!.driver], body) : body}`;
    }),
  ].join('\n');
}

export async function ladderCommand(): Promise<void> {
  const repo = await detectRepo(process.cwd());
  const ladder = readLadder(repo.root);
  p.intro(`${NAMES.brand} ladder  ${repo.owner}/${repo.name}`);
  console.log('');
  console.log(ladderTable(ladder));
  console.log('');
}
