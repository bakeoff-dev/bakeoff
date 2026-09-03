import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { createWorktree, removeWorktree, worktreeDir } from '../../src/core/worktree';
import { must } from '../../src/core/exec';
import { makeRepo } from '../helpers/repo';

describe('worktree', () => {
  it('creates a branch worktree without .bakeoff and removes it', async () => {
    const repo = await makeRepo({ 'a.txt': 'a', '.bakeoff/runs/x.json': '{}', '.bakeoff/hidden/t.test.ts': 'secret' });
    const dir = worktreeDir('20260902-test', 'claude');
    expect(dir).toContain(join('bakeoff', '20260902-test', 'claude'));
    await createWorktree({ repoRoot: repo.dir, baseSha: repo.sha, branch: 'bakeoff/1-claude-20260902-test', dir });
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('a');
    expect(existsSync(join(dir, '.bakeoff'))).toBe(false);
    expect(await must('git', ['rev-parse', '--abbrev-ref', 'HEAD'], { cwd: dir })).toBe('bakeoff/1-claude-20260902-test');
    // nothing under .bakeoff/ is checked out: every index entry there is skip-worktree ("S"), none is "H"
    const tagged = (await must('git', ['ls-files', '-t', '--', '.bakeoff'], { cwd: dir })).split('\n').filter(Boolean);
    expect(tagged.length).toBeGreaterThan(0);
    expect(tagged.every((l) => l.startsWith('S '))).toBe(true);
    // ...and the hidden tests are unreachable by path from inside the worktree
    expect(existsSync(join(dir, '.bakeoff', 'hidden', 't.test.ts'))).toBe(false);
    // an agent-style commit must not touch .bakeoff/
    writeFileSync(join(dir, 'a.txt'), 'changed');
    await must('git', ['add', '-A'], { cwd: dir });
    await must('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-q', '-m', 'agent change'], { cwd: dir });
    expect(await must('git', ['diff', '--name-only', repo.sha, 'HEAD'], { cwd: dir })).toBe('a.txt');
    await removeWorktree({ repoRoot: repo.dir, dir, branch: 'bakeoff/1-claude-20260902-test', deleteBranch: true });
    expect(existsSync(dir)).toBe(false);
    expect((await must('git', ['branch', '--list', 'bakeoff/*'], { cwd: repo.dir }))).toBe('');
  });
});
