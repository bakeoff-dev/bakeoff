import type { AgentResult, Ladder, LadderEntry, RunRecord } from '@contract';
import { competitorKey } from '@contract';
import { NAMES } from '../../core/names';
import { oneLine } from '../../core/text';
import {
  DRIVER_HEX, DRIVER_NAME, SOFT_RED, STATUS_WORD, dim, displayWidth, fmtClock, fmtCost, paint,
} from './style';

/**
 * How an agent is named in a result: the model it ran, "auto" when it ran on whatever
 * the provider picked, and "auto: <model>" when we did not ask but the CLI told us.
 * Mirrors `modelLabel` in ui/src/theme.ts; the UI cannot import across that boundary.
 */
export function modelLabel(model: string | null, requested: string | null): string {
  if (model === null) return requested ?? 'auto';
  return requested === null ? `auto: ${model}` : model;
}

/** Tests read out of the visible-tests detail, e.g. "5/5 passed, baseline red" -> "5/5". */
function testsCell(a: AgentResult): string {
  const detail = a.score?.components.find((c) => c.id === 'visible_tests')?.detail ?? '';
  return /^(\d+\/\d+)/.exec(detail)?.[1] ?? '';
}

const pad = (s: string, w: number): string => s + ' '.repeat(Math.max(0, w - displayWidth(s)));
const padStart = (s: string, w: number): string => ' '.repeat(Math.max(0, w - displayWidth(s))) + s;

interface Row {
  rank: string; name: string; model: string; total: string; cost: string; time: string;
  tests: string; diff: string; files: string; pr: string; flag: string;
  driver: AgentResult['driver']; winner: boolean;
}

function rowFor(a: AgentResult): Row {
  const finished = a.status === 'ok' && a.score !== null;
  const flag = a.score?.tamperFlags[0];
  return {
    rank: a.rank === null ? '' : String(a.rank),
    name: DRIVER_NAME[a.driver],
    model: modelLabel(a.model, a.requestedModel),
    // An agent that never finished has no score to show; its status says why instead.
    total: finished ? String(a.score!.total) : STATUS_WORD[a.status],
    cost: fmtCost(a.costUsd),
    time: fmtClock(a.durationMs),
    tests: finished ? testsCell(a) : '',
    diff: finished ? `+${a.linesAdded} -${a.linesRemoved}` : '',
    files: finished ? `${a.filesTouched.length} file${a.filesTouched.length === 1 ? '' : 's'}` : '',
    pr: a.prNumber === null ? '' : `PR #${a.prNumber}`,
    flag: flag ? oneLine(`${flag.rule.replace(/_/g, ' ')}: ${flag.file}`) : '',
    driver: a.driver,
    winner: a.rank === 1,
  };
}

const ladderSummary = (ladder: Ladder): string =>
  Object.values(ladder.entries)
    .filter((e): e is LadderEntry => Boolean(e))
    .sort((x, y) => y.rating - x.rating)
    .map((e) => `${DRIVER_NAME[e.driver]} ${e.rating}`)
    .join('  ');

export interface FinalTableInput {
  record: RunRecord;
  ladder?: Ladder | null;
  /** Written once the HTML export exists; omitted until then. */
  scoreboardPath?: string | null;
}

/**
 * The result of a race, printed once and never redrawn. Plain text under NO_COLOR or a
 * pipe: colour is the only thing that changes, never the columns.
 */
export function finalTable(input: FinalTableInput): string {
  const { record: rec } = input;
  const rows = [...rec.agents]
    .sort((x, y) => (x.rank ?? Infinity) - (y.rank ?? Infinity))
    .map(rowFor);

  const w = {
    rank: Math.max(...rows.map((r) => displayWidth(r.rank)), 1),
    name: Math.max(...rows.map((r) => displayWidth(r.name))),
    model: Math.max(...rows.map((r) => displayWidth(r.model))),
    total: Math.max(...rows.map((r) => displayWidth(r.total))),
    cost: Math.max(...rows.map((r) => displayWidth(r.cost))),
    time: Math.max(...rows.map((r) => displayWidth(r.time))),
    tests: Math.max(...rows.map((r) => displayWidth(r.tests))),
    diff: Math.max(...rows.map((r) => displayWidth(r.diff))),
    files: Math.max(...rows.map((r) => displayWidth(r.files))),
    pr: Math.max(...rows.map((r) => displayWidth(r.pr))),
  };

  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${NAMES.bin}  ${rec.repo.owner}/${rec.repo.name} #${rec.issue.number}  ${oneLine(rec.issue.title)}`);
  lines.push('');

  for (const r of rows) {
    const cells = [
      padStart(r.rank, w.rank),
      '  ',
      pad(r.name, w.name),
      ' ',
      dim(pad(r.model, w.model)),
      '  ',
      padStart(r.total, w.total),
      '  ',
      padStart(r.cost, w.cost),
      '  ',
      padStart(r.time, w.time),
      '  ',
      padStart(r.tests, w.tests),
      '  ',
      pad(r.diff, w.diff),
      '  ',
      pad(r.files, w.files),
      '  ',
      pad(r.pr, w.pr),
    ].join('');
    const body = r.winner ? paint(DRIVER_HEX[r.driver], cells) : cells;
    lines.push(`  ${body}${r.flag ? `  ${paint(SOFT_RED, r.flag)}` : ''}`.trimEnd());
  }

  lines.push('');
  if (input.scoreboardPath) lines.push(`  Scoreboard  ${input.scoreboardPath}`);
  const ladder = input.ladder ? ladderSummary(input.ladder) : '';
  if (ladder) lines.push(`  Ladder      ${ladder}`);
  lines.push(`  Run record  ${NAMES.stateDir}/runs/${rec.id}.json`);
  lines.push('');
  return lines.join('\n');
}

export { competitorKey };
