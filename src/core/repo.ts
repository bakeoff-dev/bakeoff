import { z } from 'zod';
import type { RepoInfo } from '@contract';
import { exec, must, type Exec } from './exec';

const View = z.object({ nameWithOwner: z.string(), defaultBranchRef: z.object({ name: z.string() }) });

export async function detectRepo(cwd: string, run: Exec = exec): Promise<RepoInfo & { root: string }> {
  const root = await must('git', ['rev-parse', '--show-toplevel'], { cwd }, run);
  const view = View.parse(
    JSON.parse(await must('gh', ['repo', 'view', '--json', 'nameWithOwner,defaultBranchRef'], { cwd: root }, run)),
  );
  const [owner, name] = view.nameWithOwner.split('/') as [string, string];
  const defaultBranch = view.defaultBranchRef.name;
  await must('git', ['fetch', 'origin', defaultBranch, '--quiet'], { cwd: root }, run);
  const baseSha = await must('git', ['rev-parse', `origin/${defaultBranch}`], { cwd: root }, run);
  return { owner, name, defaultBranch, baseSha, root };
}
