import { mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { exec, must, type Exec } from './exec';
import { NAMES } from './names';

export function worktreeDir(runId: string, driver: string): string {
  return join(tmpdir(), NAMES.tmpDirName, runId, driver);
}

export async function createWorktree(
  o: { repoRoot: string; baseSha: string; branch: string; dir: string },
  run: Exec = exec,
): Promise<void> {
  mkdirSync(dirname(o.dir), { recursive: true });
  await must('git', ['worktree', 'add', '-q', '--no-checkout', '-b', o.branch, o.dir, o.baseSha], { cwd: o.repoRoot }, run);
  await must('git', ['sparse-checkout', 'set', '--no-cone', '/*', `!/${NAMES.stateDir}/`], { cwd: o.dir }, run);
  await must('git', ['checkout', '-q', o.branch], { cwd: o.dir }, run);
  rmSync(join(o.dir, NAMES.stateDir), { recursive: true, force: true });
}

export async function removeWorktree(
  o: { repoRoot: string; dir: string; branch?: string; deleteBranch?: boolean },
  run: Exec = exec,
): Promise<void> {
  await run('git', ['worktree', 'remove', '--force', o.dir], { cwd: o.repoRoot });
  rmSync(o.dir, { recursive: true, force: true });
  await run('git', ['worktree', 'prune'], { cwd: o.repoRoot });
  if (o.deleteBranch && o.branch) await run('git', ['branch', '-D', o.branch], { cwd: o.repoRoot });
}
