import { exec, must, type Exec } from './exec';
import { NAMES } from './names';

export interface PublishRepo { owner: string; name: string }
export interface PrInput {
  worktree: string; repo: PublishRepo; branch: string; base: string;
  title: string; body: string; labels: string[];
}

const slug = (r: PublishRepo): string => `${r.owner}/${r.name}`;

/**
 * Commit whatever the agent left unstaged. Returns false when the tree is already
 * clean, which is the normal case for an agent that commits its own work.
 * Identity is pinned so the commit never picks up the host's git config.
 */
export async function commitLeftovers(worktree: string, message: string, run: Exec = exec): Promise<boolean> {
  const status = await must('git', ['status', '--porcelain'], { cwd: worktree }, run);
  if (status.length === 0) return false;
  await must('git', ['add', '-A'], { cwd: worktree }, run);
  await must(
    'git',
    ['-c', `user.name=${NAMES.botName}`, '-c', `user.email=${NAMES.botEmail}`, 'commit', '-q', '-m', message],
    { cwd: worktree },
    run,
  );
  return true;
}

export async function pushBranch(worktree: string, branch: string, run: Exec = exec): Promise<void> {
  await must('git', ['push', '-u', 'origin', branch, '--quiet'], { cwd: worktree }, run);
}

/** `--force` makes this idempotent: a label that already exists is updated, not an error. */
export async function ensureLabels(
  repo: PublishRepo,
  labels: { name: string; color: string }[],
  run: Exec = exec,
): Promise<void> {
  for (const l of labels) {
    await run('gh', ['label', 'create', l.name, '-R', slug(repo), '--color', l.color, '--force']);
  }
}

export function prNumberFromUrl(url: string): number {
  const m = /\/pull\/(\d+)/.exec(url);
  if (!m) throw new Error(`Cannot find PR number in "${url}"`);
  return Number(m[1]);
}

export async function createPr(o: PrInput, run: Exec = exec): Promise<{ url: string; number: number }> {
  const args = [
    'pr', 'create',
    '-R', slug(o.repo),
    '--head', o.branch,
    '--base', o.base,
    '--title', o.title,
    '--body', o.body,
  ];
  for (const l of o.labels) args.push('--label', l);
  // gh prints warnings before the url, so pick the line that looks like one.
  const out = await must('gh', args, { cwd: o.worktree }, run);
  const url = out.split('\n').find((l) => l.includes('/pull/'))?.trim();
  if (!url) throw new Error('gh pr create returned no PR url');
  return { url, number: prNumberFromUrl(url) };
}
