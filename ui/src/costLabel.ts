/** Below this fill the label is wider than the bar, and right-aligning it would push it off the track. */
export const COST_LABEL_MIN_FILL_PCT = 12;

/**
 * Where the live cost label sits over the budget track: right-aligned to the fill's end
 * once the fill can hold it, otherwise anchored at the track's start.
 */
export function costLabelPos(fillPct: number): { left: string; transform: string } {
  return fillPct < COST_LABEL_MIN_FILL_PCT
    ? { left: '0%', transform: 'none' }
    : { left: `${fillPct}%`, transform: 'translateX(-100%)' };
}
