import { describe, expect, it } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { hiddenTestsComponent, parseTestCounts, visibleTestsComponent } from '../../../src/core/scorer/tests';
import { makeRepo } from '../../helpers/repo';

describe('parseTestCounts', () => {
  it('reads common runners', () => {
    expect(parseTestCounts('Tests  9 passed (9)')).toEqual({ passed: 9, total: 9 });
    expect(parseTestCounts('Tests  2 failed | 7 passed (9)')).toEqual({ passed: 7, total: 9 });
    expect(parseTestCounts(' 9 pass\n 0 fail')).toEqual({ passed: 9, total: 9 });
    expect(parseTestCounts('===== 8 passed, 1 failed in 0.3s =====')).toEqual({ passed: 8, total: 9 });
    expect(parseTestCounts('ok  \tgithub.com/x/y\t0.02s\nFAIL\tgithub.com/x/z\t0.10s')).toEqual({ passed: 1, total: 2 });
    expect(parseTestCounts('no idea')).toBeNull();
  });
});

describe('visibleTestsComponent', () => {
  it('awards full points on green after restoring tests, 30 when hidden configured', async () => {
    const repo = await makeRepo({ 'test/a.sh': 'exit 0' });
    writeFileSync(join(repo.dir, 'test/a.sh'), 'exit 1'); // agent "tampered"; restore must undo it
    const c = await visibleTestsComponent({
      worktree: repo.dir,
      baseSha: repo.sha,
      config: { test: 'sh test/a.sh' },
      testPaths: ['test'],
      hiddenConfigured: true,
      baselineGreen: true,
    });
    expect(c).toMatchObject({ id: 'visible_tests', max: 30, awarded: 30 });
  });

  it('awards 0 on red and notes a red baseline', async () => {
    const repo = await makeRepo({ x: '' });
    const c = await visibleTestsComponent({
      worktree: repo.dir,
      baseSha: repo.sha,
      config: { test: 'exit 1' },
      testPaths: [],
      hiddenConfigured: false,
      baselineGreen: false,
    });
    expect(c).toMatchObject({ id: 'visible_tests', max: 50, awarded: 0 });
    expect(c.detail).toContain('baseline red');
  });

  it('is n/a when no test command is configured', async () => {
    const repo = await makeRepo({ x: '' });
    const c = await visibleTestsComponent({
      worktree: repo.dir,
      baseSha: repo.sha,
      config: {},
      testPaths: [],
      hiddenConfigured: false,
      baselineGreen: null,
    });
    expect(c).toMatchObject({ id: 'visible_tests', max: 50, awarded: null, detail: 'n/a' });
  });
});

describe('hiddenTestsComponent', () => {
  it('copies hidden tests in and runs them', async () => {
    const repo = await makeRepo({ x: '' });
    const hiddenDir = join(repo.dir, '.bakeoff', 'hidden');
    mkdirSync(hiddenDir, { recursive: true });
    writeFileSync(join(hiddenDir, 'h.sh'), 'test -f x');
    const c = await hiddenTestsComponent({
      worktree: repo.dir,
      hiddenDir,
      hidden: { source: '.bakeoff/hidden', dest: 'tests/hidden', command: 'sh tests/hidden/h.sh' },
    });
    expect(c).toMatchObject({ id: 'hidden_tests', max: 20, awarded: 20 });
  });

  it('awards 0 when the hidden tests fail', async () => {
    const repo = await makeRepo({ x: '' });
    const hiddenDir = join(repo.dir, '.bakeoff', 'hidden');
    mkdirSync(hiddenDir, { recursive: true });
    writeFileSync(join(hiddenDir, 'h.sh'), 'test -f nope');
    const c = await hiddenTestsComponent({
      worktree: repo.dir,
      hiddenDir,
      hidden: { source: '.bakeoff/hidden', dest: 'tests/hidden', command: 'sh tests/hidden/h.sh' },
    });
    expect(c).toMatchObject({ id: 'hidden_tests', max: 20, awarded: 0 });
  });

  it('is n/a when the hidden dir is empty', async () => {
    const repo = await makeRepo({ x: '' });
    const c = await hiddenTestsComponent({
      worktree: repo.dir,
      hiddenDir: join(repo.dir, 'nope'),
      hidden: { source: 's', dest: 'd', command: 'true' },
    });
    expect(c.awarded).toBeNull();
    expect(c.detail).toBe('no hidden tests found');
  });
});
