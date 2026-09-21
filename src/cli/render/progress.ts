import { applyEvent, initialState, type RaceEvent, type RaceState } from '@contract';
import {
  DRIVER_HEX, DRIVER_NAME, STATUS_HEX, STATUS_WORD,
  dim, fmtClockPadded, fmtCost, fmtTok, paint, spendBar,
} from './style';
import { NAMES } from '../../core/names';

const HEADER_WIDTH = 72;
const ACTION_INDENT = ' '.repeat(28);

export interface ProgressRenderer {
  onEvent(e: RaceEvent): void;
  stop(): void;
}

/** In-place live view per design/TERMINAL.md. Non-TTY: prints nothing (the final table still prints). */
export function progressRenderer(out: NodeJS.WriteStream = process.stdout): ProgressRenderer {
  let state: RaceState = initialState;
  let drawn = 0;
  const live = !!out.isTTY;
  const startedAt = Date.now();
  const width = (): number => out.columns ?? 100;

  const frame = (): string[] => {
    const lines: string[] = [];
    const issue = state.issue ? `${state.repo?.owner}/${state.repo?.name} #${state.issue.number}  ${state.issue.title}` : '';
    lines.push(`  ${paint('#F4F4F7', NAMES.bin)}  ${issue}`);
    const running = state.agents.filter((a) => a.status === 'running').length;
    const left = `  ${running} of ${state.agents.length} running`;
    const right = `${fmtClockPadded(Date.now() - startedAt)} elapsed`;
    const gap = Math.max(1, Math.min(width(), HEADER_WIDTH) - left.length - right.length);
    lines.push(left + ' '.repeat(gap) + right, '');

    const budget = state.caps?.budgetUsd ?? 1;
    for (const a of state.agents) {
      const name = DRIVER_NAME[a.driver].padEnd(12);
      const status = paint(STATUS_HEX[a.status], STATUS_WORD[a.status].padEnd(9));
      const files = `${a.filesTouched} file${a.filesTouched === 1 ? '' : 's'}`;
      const pr = a.prNumber ? `   PR #${a.prNumber}` : '';
      const bar = spendBar(a.costUsd, budget, 20, DRIVER_HEX[a.driver]);
      lines.push(
        `  ${paint(DRIVER_HEX[a.driver], '●')} ${name}  ${status} ${fmtCost(a.costUsd).padStart(6)} ${bar} ` +
          `${fmtCost(budget)}   ${fmtTok(a.tokens).padStart(8)}   ${files}${pr}`,
      );
      const action = (a.lastAction || '').slice(0, Math.max(10, width() - 30));
      lines.push(action ? `${ACTION_INDENT}${dim(action)}` : '', '');
    }
    return lines;
  };

  const redraw = (): void => {
    if (!live) return;
    const lines = frame();
    if (drawn) out.write(`\x1b[${drawn}A\x1b[J`);
    out.write(`${lines.join('\n')}\n`);
    drawn = lines.length;
  };

  const timer = live ? setInterval(redraw, 1000) : null;
  // The clock keeps ticking without events; don't hold the process open for it.
  timer?.unref?.();

  return {
    onEvent(e: RaceEvent) {
      state = applyEvent(state, e);
      redraw();
    },
    stop() {
      if (timer) clearInterval(timer);
      if (live && drawn) {
        out.write(`\x1b[${drawn}A\x1b[J`);
        drawn = 0;
      }
    },
  };
}
