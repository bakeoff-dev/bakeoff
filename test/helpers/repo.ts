import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { must } from '../../src/core/exec';

export async function makeRepo(files: Record<string, string>) {
  const dir = mkdtempSync(join(tmpdir(), 'bakeoff-repo-'));
  await must('git', ['init', '-q', '-b', 'main'], { cwd: dir });
  await must('git', ['config', 'user.email', 'test@bakeoff.dev'], { cwd: dir });
  await must('git', ['config', 'user.name', 'Bakeoff Test'], { cwd: dir });
  const commit = async (f: Record<string, string>, msg: string) => {
    for (const [p, c] of Object.entries(f)) {
      mkdirSync(dirname(join(dir, p)), { recursive: true });
      writeFileSync(join(dir, p), c);
    }
    await must('git', ['add', '-A'], { cwd: dir });
    await must('git', ['commit', '-q', '-m', msg], { cwd: dir });
    return must('git', ['rev-parse', 'HEAD'], { cwd: dir });
  };
  const sha = await commit(files, 'init');
  return { dir, sha, commit };
}
