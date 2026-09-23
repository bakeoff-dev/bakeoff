import type { ScoreComponent } from '@contract';
import { runCheck } from './checks';

export interface CheckComponentsInput {
  worktree: string;
  config: { lint?: string; typecheck?: string };
}

/**
 * Typecheck and lint share 15 points: 7.5 each when both are configured, all 15 to the
 * one that is configured when only one is, and 7.5 each as n/a when neither is.
 */
export async function checkComponents(o: CheckComponentsInput): Promise<[ScoreComponent, ScoreComponent]> {
  const both = !!o.config.typecheck && !!o.config.lint;
  const none = !o.config.typecheck && !o.config.lint;
  const maxFor = (mine?: string) => (none || both ? 7.5 : mine ? 15 : 0);
  const one = async (id: 'typecheck' | 'lint', cmd?: string): Promise<ScoreComponent> => {
    const max = maxFor(cmd);
    if (!cmd) return { id, max, awarded: null, detail: 'n/a' };
    const r = await runCheck(cmd, o.worktree);
    return { id, max, awarded: r.green ? max : 0, detail: r.green ? 'clean' : `exit ${r.exitCode}` };
  };
  return [await one('typecheck', o.config.typecheck), await one('lint', o.config.lint)];
}
