import { describe, expect, it } from 'vitest';
import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { computeBaseline, defaultTestPaths, restoreTestPaths, runCheck } from '../../../src/core/scorer/checks';
import { makeRepo } from '../../helpers/repo';

describe('runCheck', () => {
  it('reports green/red with output', async () => {
    expect((await runCheck('echo hi && exit 0', '/tmp')).green).toBe(true);
    const r = await runCheck('echo nope >&2; exit 2', '/tmp');
    expect(r.green).toBe(false);
    expect(r.exitCode).toBe(2);
    expect(r.output).toContain('nope');
  });
});

describe('defaultTestPaths', () => {
  it('finds test directories and stray test files, skipping vendored code', async () => {
    const repo = await makeRepo({
      'test/a.test.ts': 'a',
      'src/util.spec.ts': 'b',
      'src/plain.ts': 'c',
      'node_modules/pkg/index.test.js': 'd',
    });
    expect(await defaultTestPaths(repo.dir, repo.sha)).toEqual(['test', 'src/util.spec.ts']);
  });

  // Detection reads the base tree: an agent that deletes the suite must not also delete
  // the scorer's knowledge that there was one.
  it('sees test paths the agent deleted', async () => {
    const repo = await makeRepo({ 'test/a.test.ts': 'a', 'src/util.spec.ts': 'b' });
    rmSync(join(repo.dir, 'test'), { recursive: true });
    rmSync(join(repo.dir, 'src/util.spec.ts'));
    await repo.commit({}, 'drop the tests');
    expect(await defaultTestPaths(repo.dir, repo.sha)).toEqual(['test', 'src/util.spec.ts']);
  });
});

describe('restoreTestPaths', () => {
  it('puts modified and deleted test files back to base', async () => {
    const repo = await makeRepo({ 'src/a.ts': 'x', 'test/a.test.ts': 'original', 'test/b.test.ts': 'b' });
    writeFileSync(join(repo.dir, 'test/a.test.ts'), 'tampered');
    rmSync(join(repo.dir, 'test/b.test.ts'));
    const restored = await restoreTestPaths(repo.dir, repo.sha, ['test']);
    expect(restored).toEqual(['test']);
    expect(readFileSync(join(repo.dir, 'test/a.test.ts'), 'utf8')).toBe('original');
    expect(readFileSync(join(repo.dir, 'test/b.test.ts'), 'utf8')).toBe('b');
  });

  it('ignores paths that do not exist at base', async () => {
    const repo = await makeRepo({ 'src/a.ts': 'x' });
    expect(await restoreTestPaths(repo.dir, repo.sha, ['test', 'src'])).toEqual(['src']);
  });
});

describe('computeBaseline', () => {
  it('runs configured checks at base sha', async () => {
    const repo = await makeRepo({ 'a.txt': 'a' });
    const b = await computeBaseline({
      repoRoot: repo.dir,
      baseSha: repo.sha,
      runId: 'base-test',
      config: { test: 'test -f a.txt', lint: 'exit 1' },
    });
    expect(b).toEqual({ testsGreen: true, lintGreen: false, typecheckGreen: null });
  });

  it('runs setup in the baseline worktree before the checks', async () => {
    const repo = await makeRepo({ 'a.txt': 'a' });
    const b = await computeBaseline({
      repoRoot: repo.dir,
      baseSha: repo.sha,
      runId: 'base-setup',
      config: { setup: 'touch installed', test: 'test -f installed' },
    });
    expect(b).toEqual({ testsGreen: true, lintGreen: null, typecheckGreen: null });
  });

  it('fails every check when setup fails, and says why', async () => {
    const repo = await makeRepo({ 'a.txt': 'a' });
    const b = await computeBaseline({
      repoRoot: repo.dir,
      baseSha: repo.sha,
      runId: 'base-setup-red',
      config: { setup: 'exit 3', test: 'true', typecheck: 'true' },
    });
    expect(b).toEqual({ testsGreen: false, lintGreen: false, typecheckGreen: false, setupError: 'setup failed (exit 3)' });
  });
});
