import { applyEvent, initialState, type RaceEvent, type RaceState } from '@contract';
import {
  DRIVER_HEX, DRIVER_NAME, STATUS_HEX, STATUS_WORD,
  dim, displayWidth, fmtClockPadded, fmtCost, fmtTok, paint, spendBar, truncate,
} from './style';
import { NAMES } from '../../core/names';
import { oneLine } from '../../core/text';

const HEADER_WIDTH = 72;
const ACTION_INDENT = ' '.repeat(28);
const BAR_WIDTH = 20;
const BAR_MIN = 6;
/** Everything on an agent lane except the bar itself. */
const LANE_CHROME = 62;

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
    const issue = state.issue
      ? oneLine(`${state.repo?.owner}/${state.repo?.name} #${state.issue.number}  ${state.issue.title}`)
      : '';
    lines.push(`  ${paint('#F4F4F7', NAMES.bin)}  ${issue}`);
    const running = state.agents.filter((a) => a.status === 'running').length;
    const left = `  ${running} of ${state.agents.length} running`;
    const right = `${fmtClockPadded(Date.now() - startedAt)} elapsed`;
    const gap = Math.max(1, Math.min(width(), HEADER_WIDTH) - left.length - right.length);
    lines.push(left + ' '.repeat(gap) + right, '');

    const budget = state.caps?.budgetUsd ?? 1;
    // Shrink the bar before resorting to truncation, so a narrow terminal loses
    // bar resolution rather than the numbers to its right.
    const barWidth = Math.max(BAR_MIN, Math.min(BAR_WIDTH, width() - 1 - LANE_CHROME));
    for (const a of state.agents) {
      const name = oneLine(DRIVER_NAME[a.driver]).padEnd(12);
      const status = paint(STATUS_HEX[a.status], STATUS_WORD[a.status].padEnd(9));
      const files = `${a.filesTouched} file${a.filesTouched === 1 ? '' : 's'}`;
      const pr = a.prNumber ? `   PR #${a.prNumber}` : '';
      const bar = spendBar(a.costUsd, budget, barWidth, DRIVER_HEX[a.driver]);
      lines.push(
        `  ${paint(DRIVER_HEX[a.driver], '●')} ${name}  ${status} ${fmtCost(a.costUsd).padStart(6)} ${bar} ` +
          `${fmtCost(budget)}   ${fmtTok(a.tokens).padStart(8)}   ${files}${pr}`,
      );
      // Sanitised again here: the frame's height must not depend on a driver behaving.
      const action = oneLine(a.lastAction || '').slice(0, Math.max(10, width() - 30));
      lines.push(action ? `${ACTION_INDENT}${dim(action)}` : '', '');
    }
    // Nothing may wrap: a wrapped line occupies rows the cursor-up below cannot account for.
    return lines.map((l) => truncate(l, Math.max(1, width() - 1)));
  };

  /** Physical rows a frame occupies, which is what the cursor actually moves through. */
  const rowsFor = (lines: string[]): number =>
    lines.reduce((n, l) => n + Math.max(1, Math.ceil(displayWidth(l) / width())), 0);

  const clear = (): void => {
    if (drawn) out.write(`\x1b[${drawn}A\x1b[J`);
    drawn = 0;
  };

  const redraw = (): void => {
    if (!live) return;
    const lines = frame();
    clear();
    out.write(`${lines.join('\n')}\n`);
    drawn = rowsFor(lines);
  };

  // A resize re-wraps rows already on screen, so the recorded count no longer describes
  // them. Forget it and draw fresh below rather than clearing the wrong rows.
  const onResize = (): void => {
    drawn = 0;
  };
  if (live && typeof out.on === 'function') out.on('resize', onResize);

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
      if (live && typeof out.off === 'function') out.off('resize', onResize);
      if (live) clear();
    },
  };
}
