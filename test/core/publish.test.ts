import { describe, expect, it } from 'vitest';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { commitLeftovers, createPr, ensureLabels, prNumberFromUrl, pushBranch } from '../../src/core/publish';
import { fakeExec } from '../helpers/exec';
import { makeRepo } from '../helpers/repo';
import { must } from '../../src/core/exec';

describe('publish', () => {
  it('commits leftovers only when dirty', async () => {
    const repo = await makeRepo({ 'a.txt': 'a' });
    expect(await commitLeftovers(repo.dir, 'bakeoff: final state')).toBe(false);
    writeFileSync(join(repo.dir, 'b.txt'), 'b');
    expect(await commitLeftovers(repo.dir, 'bakeoff: final state')).toBe(true);
    expect(await must('git', ['log', '-1', '--pretty=%s'], { cwd: repo.dir })).toBe('bakeoff: final state');
  });

  it('commits with the bakeoff identity so it never depends on the host git config', async () => {
    const repo = await makeRepo({ 'a.txt': 'a' });
    writeFileSync(join(repo.dir, 'b.txt'), 'b');
    await commitLeftovers(repo.dir, 'bakeoff: final state');
    expect(await must('git', ['log', '-1', '--pretty=%an'], { cwd: repo.dir })).toBe('bakeoff');
  });

  it('pushes, ensures labels, creates a PR via gh', async () => {
    const { run, calls } = fakeExec([
      [/^git push -u origin b/, {}],
      [/^gh label create/, {}],
      [/^gh pr create/, { stdout: 'https://github.com/a/b/pull/42\n' }],
    ]);
    await pushBranch('/w', 'b', run);
    await ensureLabels({ owner: 'a', name: 'b' }, [{ name: 'bakeoff', color: 'F59E0B' }], run);
    const pr = await createPr(
      { worktree: '/w', repo: { owner: 'a', name: 'b' }, branch: 'b', base: 'main', title: 'T', body: 'B', labels: ['bakeoff'] },
      run,
    );
    expect(pr).toEqual({ url: 'https://github.com/a/b/pull/42', number: 42 });
    expect(calls.find((c) => c.startsWith('gh pr create'))).toContain('--label bakeoff');
    expect(calls.find((c) => c.startsWith('gh label create'))).toContain('--force');
  });

  it('ignores noise around the url gh prints', async () => {
    const { run } = fakeExec([
      [/^gh pr create/, { stdout: 'Warning: 3 uncommitted changes\nhttps://github.com/a/b/pull/7\n' }],
    ]);
    const pr = await createPr(
      { worktree: '/w', repo: { owner: 'a', name: 'b' }, branch: 'b', base: 'main', title: 'T', body: 'B', labels: [] },
      run,
    );
    expect(pr.number).toBe(7);
  });

  it('throws when gh prints no url', async () => {
    const { run } = fakeExec([[/^gh pr create/, { stdout: 'nothing here\n' }]]);
    await expect(
      createPr({ worktree: '/w', repo: { owner: 'a', name: 'b' }, branch: 'b', base: 'main', title: 'T', body: 'B', labels: [] }, run),
    ).rejects.toThrow(/no PR url/);
  });

  it('parses PR numbers', () => {
    expect(prNumberFromUrl('https://github.com/a/b/pull/7')).toBe(7);
    expect(() => prNumberFromUrl('nope')).toThrow();
  });
});
