import type { Exec } from './exec';
import { NAMES } from './names';

export const FILES_POLL_MS = 3000;

/**
 * Distinct paths changed in a worktree, from git itself rather than from whatever tool
 * events a driver happens to report: an agent that writes through shell heredocs fires
 * no Edit or Write event at all. Our own state dir is not the agent's work.
 *
 * `--no-optional-locks` keeps the poll from taking `index.lock`, which would make the
 * agent's own `git add` or `git commit` fail if the two ran at the same moment.
 */
export async function countChangedPaths(dir: string, run: Exec): Promise<number | null> {
  const r = await run('git', ['--no-optional-locks', 'status', '--porcelain', '--untracked-files=all'], { cwd: dir });
  if (r.code !== 0) return null;
  const changed = new Set<string>();
  for (const line of r.stdout.split('\n')) {
    if (line.length < 4) continue;
    const entry = line.slice(3);
    const arrow = entry.indexOf(' -> ');
    const path = (arrow >= 0 ? entry.slice(arrow + 4) : entry).replace(/^"|"$/g, '');
    if (path === NAMES.stateDir || path.startsWith(`${NAMES.stateDir}/`)) continue;
    changed.add(path);
  }
  return changed.size;
}

/** Poll `countChangedPaths` every `everyMs` until the returned stop function is called. */
export function watchChangedPaths(dir: string, run: Exec, everyMs: number, onCount: (n: number) => void): () => void {
  let stopped = false;
  let busy = false;
  const timer = setInterval(() => {
    if (busy) return;
    busy = true;
    countChangedPaths(dir, run)
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
