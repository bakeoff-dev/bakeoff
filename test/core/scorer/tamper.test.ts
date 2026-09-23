import { describe, expect, it } from 'vitest';
import { rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { countAsserts, isProtectedConfig, isTestFile, tamperFlags } from '../../../src/core/scorer/tamper';
import { makeRepo } from '../../helpers/repo';

const base = {
  'src/a.ts': 'export const a = 1;\n',
  'test/a.test.ts': "import { expect, it } from 'vitest';\nit('a', () => { expect(1).toBe(1); expect(2).toBe(2); });\n",
};
const plain = { worktree: '', baseSha: '', testPaths: ['test'], hiddenDest: null };

/** The agent commits as it goes and bakeoff commits the leftovers, so scoring sees HEAD. */
async function agentRepo(files: Record<string, string>, work: (dir: string) => void) {
  const repo = await makeRepo(files);
  work(repo.dir);
  await repo.commit({}, 'agent work');
  return repo;
}

describe('tamperFlags', () => {
  it('is empty for an honest change', async () => {
    const repo = await agentRepo(base, (d) => writeFileSync(join(d, 'src/a.ts'), 'export const a = 2;\n'));
    expect(await tamperFlags({ ...plain, worktree: repo.dir, baseSha: repo.sha })).toEqual([]);
  });

  it('is empty when a new test file is added', async () => {
    const repo = await agentRepo(base, (d) =>
      writeFileSync(join(d, 'test/b.test.ts'), "import { expect, it } from 'vitest';\nit('b', () => { expect(1).toBe(1); });\n"),
    );
    expect(await tamperFlags({ ...plain, worktree: repo.dir, baseSha: repo.sha })).toEqual([]);
  });

  // The scorer restores test paths and copies hidden tests into the worktree before the
  // test components run. Neither is the agent's doing, so neither may be scored as tamper.
  it('ignores the working tree', async () => {
    const repo = await makeRepo(base);
    rmSync(join(repo.dir, 'test/a.test.ts'));
    writeFileSync(join(repo.dir, 'vitest.config.ts'), 'export default {}');
    mkdirSync(join(repo.dir, 'tests/hidden'), { recursive: true });
    writeFileSync(join(repo.dir, 'tests/hidden/x.test.ts'), '');
    expect(await tamperFlags({ ...plain, worktree: repo.dir, baseSha: repo.sha, hiddenDest: 'tests/hidden' })).toEqual([]);
  });

  it('flags a deleted test', async () => {
    const repo = await agentRepo(base, (d) => rmSync(join(d, 'test/a.test.ts')));
    const f = await tamperFlags({ ...plain, worktree: repo.dir, baseSha: repo.sha });
    expect(f.map((x) => x.rule)).toContain('test_deleted');
    expect(f[0]!.file).toBe('test/a.test.ts');
  });

  it('flags a test renamed out of the test paths but not one renamed within them', async () => {
    const away = await makeRepo(base);
    await away.commit({ 'src/moved.ts': base['test/a.test.ts'] }, 'move');
    rmSync(join(away.dir, 'test/a.test.ts'));
    await away.commit({}, 'drop original');
    const f = await tamperFlags({ ...plain, worktree: away.dir, baseSha: away.sha });
    expect(f.map((x) => x.rule)).toContain('test_deleted');
    expect(f[0]!.detail).toContain('renamed');

    const within = await makeRepo(base);
    await within.commit({ 'test/renamed.test.ts': base['test/a.test.ts'] }, 'move');
    rmSync(join(within.dir, 'test/a.test.ts'));
    await within.commit({}, 'drop original');
    expect(await tamperFlags({ ...plain, worktree: within.dir, baseSha: within.sha })).toEqual([]);
  });

  it('flags .skip and weakened asserts', async () => {
    const repo = await agentRepo(base, (d) =>
      writeFileSync(join(d, 'test/a.test.ts'), "import { expect, it } from 'vitest';\nit.skip('a', () => { expect(1).toBe(1); });\n"),
    );
    const rules = (await tamperFlags({ ...plain, worktree: repo.dir, baseSha: repo.sha })).map((x) => x.rule);
    expect(rules).toContain('test_skipped');
    expect(rules).toContain('asserts_weakened');
  });

  it('flags config writes and hidden-path writes', async () => {
    const repo = await agentRepo(base, (d) => {
      writeFileSync(join(d, 'vitest.config.ts'), 'export default {}');
      mkdirSync(join(d, 'tests/hidden'), { recursive: true });
      writeFileSync(join(d, 'tests/hidden/x.test.ts'), '');
    });
    const rules = (await tamperFlags({ ...plain, worktree: repo.dir, baseSha: repo.sha, hiddenDest: 'tests/hidden' })).map((x) => x.rule);
    expect(rules).toContain('config_write');
    expect(rules).toContain('hidden_path_write');
  });

  it('flags a rewritten package.json test script but not an added dependency', async () => {
    const pkg = (test: string, extra = '') => `{"name":"x",${extra}"scripts":{"test":"${test}","build":"tsc"}}`;
    const repo = await agentRepo({ 'package.json': pkg('vitest run') }, (d) => writeFileSync(join(d, 'package.json'), pkg('exit 0')));
    const f = await tamperFlags({ ...plain, worktree: repo.dir, baseSha: repo.sha });
    expect(f.map((x) => x.rule)).toEqual(['config_write']);
    expect(f[0]!.detail).toContain('scripts.test');

    const honest = await agentRepo({ 'package.json': pkg('vitest run') }, (d) =>
      writeFileSync(join(d, 'package.json'), pkg('vitest run', '"dependencies":{"zod":"^3"},')),
    );
    expect(await tamperFlags({ ...plain, worktree: honest.dir, baseSha: honest.sha })).toEqual([]);
  });

  it('survives a package.json the agent broke', async () => {
    const repo = await agentRepo({ 'package.json': '{"scripts":{"test":"vitest run"}}' }, (d) =>
      writeFileSync(join(d, 'package.json'), 'not json at all'),
    );
    expect(await tamperFlags({ ...plain, worktree: repo.dir, baseSha: repo.sha })).toEqual([]);
  });
});

describe('helpers', () => {
  it('recognizes protected config', () => {
    for (const f of ['conftest.py', 'pytest.ini', 'pyproject.toml', 'vitest.config.mts', 'jest.config.js', '.github/workflows/ci.yml', 'bakeoff.yml', 'tsconfig.json', 'eslint.config.js', 'biome.json', 'bunfig.toml', 'setup.cfg', 'tox.ini'])
      expect(isProtectedConfig(f)).toBe(true);
    expect(isProtectedConfig('src/app.ts')).toBe(false);
    expect(isProtectedConfig('package.json')).toBe(false);
  });

  it('recognizes test files inside and outside the configured paths', () => {
    expect(isTestFile('test/a.test.ts', ['test'])).toBe(true);
    expect(isTestFile('test/fixture.json', ['test'])).toBe(true);
    expect(isTestFile('src/a.spec.tsx', [])).toBe(true);
    expect(isTestFile('pkg/thing_test.go', [])).toBe(true);
    expect(isTestFile('app/test_views.py', [])).toBe(true);
    expect(isTestFile('src/app.ts', ['test'])).toBe(false);
    expect(isTestFile('testing/app.ts', ['test'])).toBe(false);
  });

  it('counts asserts', () => {
    expect(countAsserts('expect(1).toBe(1); assert x == 1\nassert(y)\nt.Error("x")\nrequire.Equal(a,b)')).toBe(5);
  });
});
