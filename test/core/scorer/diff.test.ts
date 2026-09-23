import { describe, expect, it } from 'vitest';
import { writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { diffDiscipline, diffStats } from '../../../src/core/scorer/diff';
import { makeRepo } from '../../helpers/repo';

describe('diffStats', () => {
  it('counts every commit on the branch against base', async () => {
    const repo = await makeRepo({ 'a.ts': 'one\ntwo\n', 'b.ts': 'x\n' });
    await repo.commit({ 'a.ts': 'one\ntwo\nthree\n', 'c.ts': 'new\nfile\n' }, 'work');
    rmSync(join(repo.dir, 'b.ts'));
    await repo.commit({}, 'drop b');
    const s = await diffStats(repo.dir, repo.sha);
    expect(s.files.sort()).toEqual(['a.ts', 'b.ts', 'c.ts']);
    expect(s.added).toBe(3);
    expect(s.removed).toBe(1);
  });

  // Bakeoff commits leftovers before scoring, so HEAD is the agent's work. Anything still
  // loose in the worktree -- restored test files, copied hidden tests -- is the scorer's own.
  it('ignores the working tree', async () => {
    const repo = await makeRepo({ 'a.ts': 'one\n' });
    writeFileSync(join(repo.dir, 'a.ts'), 'one\ntwo\n');
    writeFileSync(join(repo.dir, 'scratch.ts'), 'untracked\n');
    expect(await diffStats(repo.dir, repo.sha)).toEqual({ files: [], added: 0, removed: 0, testFiles: [], testLines: 0, docFiles: [], docLines: 0 });
  });

  it('reports nothing for a branch with no commits', async () => {
    const repo = await makeRepo({ 'a.ts': 'one\n' });
    expect(await diffStats(repo.dir, repo.sha)).toEqual({ files: [], added: 0, removed: 0, testFiles: [], testLines: 0, docFiles: [], docLines: 0 });
  });
});

describe('diffDiscipline', () => {
  it('matches the fixture numbers', () => {
    const m = diffDiscipline([
      { driver: 'claude', files: ['src/paginate.ts', 'test/paginate.test.ts'], lines: 22 },
      { driver: 'codex', files: ['src/paginate.ts', 'test/paginate.test.ts', 'vitest.config.ts'], lines: 20 },
    ]);
    expect(m.get('claude')!.awarded).toBe(9.7);
    expect(m.get('codex')!.awarded).toBe(8.7);
    expect(m.get('claude')!.detail).toBe('22 lines, 2 files, 2 in consensus');
  });

  it('gives 0 for zero lines or zero files, 10 for a lone finisher', () => {
    expect(diffDiscipline([{ driver: 'claude', files: [], lines: 0 }]).get('claude')!.awarded).toBe(0);
    expect(diffDiscipline([{ driver: 'claude', files: ['a'], lines: 3 }]).get('claude')!.awarded).toBe(10);
    const m = diffDiscipline([
      { driver: 'claude', files: ['a'], lines: 3 },
      { driver: 'codex', files: [], lines: 0 },
    ]);
    expect(m.get('codex')!.awarded).toBe(0);
    expect(m.get('codex')!.detail).toBe('no changes');
  });

  it('gives 0 when files were touched but no lines changed', () => {
    expect(diffDiscipline([{ driver: 'claude', files: ['a'], lines: 0 }]).get('claude')!.awarded).toBe(0);
  });

  it('penalizes sprawl', () => {
    const m = diffDiscipline([
      { driver: 'claude', files: ['a'], lines: 10 },
      { driver: 'codex', files: ['a', 'b', 'c', 'd'], lines: 200 },
      { driver: 'opencode', files: ['a'], lines: 12 },
    ]);
    expect(m.get('codex')!.awarded).toBeLessThan(m.get('claude')!.awarded!);
  });

  it('is capped at the 10-point max', () => {
    const m = diffDiscipline([
      { driver: 'claude', files: ['a'], lines: 1 },
      { driver: 'codex', files: ['a'], lines: 500 },
    ]);
    expect(m.get('claude')!).toMatchObject({ id: 'diff', max: 10, awarded: 10 });
  });
});
