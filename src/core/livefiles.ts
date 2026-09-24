import type { Exec } from './exec';
import { NAMES } from './names';

export const FILES_POLL_MS = 3000;

export interface ChangedPathsInput {
  dir: string;
  /** The race's base commit. Agents commit as they go, so HEAD is the wrong baseline. */
  baseSha: string;
  /** Untracked paths that were there before the agent started, e.g. `setup:` output. */
  preexisting?: ReadonlySet<string>;
}

// `--no-optional-locks` keeps a poll from taking `index.lock`, which would make the
// agent's own `git add` or `git commit` fail if the two ran at the same moment.
const git = (args: string[]): string[] => ['--no-optional-locks', ...args];
const split = (stdout: string): string[] => stdout.split('\0').filter((p) => p.length > 0);
const ours = (p: string): boolean => p === NAMES.stateDir || p.startsWith(`${NAMES.stateDir}/`);

/** Untracked, non-ignored paths in a worktree. */
export async function listUntracked(dir: string, run: Exec): Promise<string[] | null> {
  const r = await run('git', git(['ls-files', '-z', '--others', '--exclude-standard']), { cwd: dir });
  return r.code === 0 ? split(r.stdout) : null;
}

/**
 * Distinct paths an agent has changed since the race's base commit, from git itself
 * rather than from whatever tool events a driver reports: an agent that writes through
 * shell heredocs fires no Edit or Write event at all. Tracked changes come from a diff
 * against the base, so committed and uncommitted work both count; untracked files are
 * added on top. Our own state dir and anything that predates the agent are excluded.
 */
export async function countChangedPaths(i: ChangedPathsInput, run: Exec): Promise<number | null> {
  const [diff, untracked] = await Promise.all([
    run('git', git(['diff', '-z', '--name-only', i.baseSha]), { cwd: i.dir }),
    listUntracked(i.dir, run),
  ]);
  if (diff.code !== 0 || untracked === null) return null;
  const changed = new Set<string>();
  for (const p of split(diff.stdout)) if (!ours(p)) changed.add(p);
  for (const p of untracked) if (!ours(p) && !i.preexisting?.has(p)) changed.add(p);
  return changed.size;
}

/** Poll `countChangedPaths` every `everyMs` until the returned stop function is called. */
export function watchChangedPaths(
  i: ChangedPathsInput, run: Exec, everyMs: number, onCount: (n: number) => void,
): () => void {
  let stopped = false;
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    countChangedPaths(i, run)
      .then((n) => {
        if (!stopped && n !== null) onCount(n);
      })
      .catch(() => undefined)
      .finally(() => {
        busy = false;
      });
  }, everyMs);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}
