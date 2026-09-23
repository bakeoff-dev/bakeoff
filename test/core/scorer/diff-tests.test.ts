import { describe, expect, it } from 'vitest';
import { diffDiscipline } from '../../../src/core/scorer/diff';
import { isDocFile, isTestFile } from '../../../src/core/scorer/tamper';

describe('isTestFile', () => {
  it('knows a test by name, whatever the language', () => {
    for (const f of ['list.test.ts', 'a.spec.tsx', 'pkg/thing_test.go', 'x/test_thing.py']) {
      expect(isTestFile(f, [])).toBe(true);
    }
  });

  it('knows a test by the run\'s test paths', () => {
    expect(isTestFile('tests/acceptance/list.ts', ['tests'])).toBe(true);
    expect(isTestFile('tests', ['tests'])).toBe(true);
    expect(isTestFile('src/list.ts', ['tests'])).toBe(false);
  });

  it('reads a test path the same with or without a trailing slash', () => {
    // the README's own example writes them as `test/`, and a second copy of this
    // rule that did not strip the slash scored test/helpers.ts as product code
    for (const paths of [['test'], ['test/'], ['test//']]) {
      expect(isTestFile('test/helpers.ts', paths)).toBe(true);
      expect(isTestFile('test/deep/nested/fixture.json', paths)).toBe(true);
      expect(isTestFile('test', paths)).toBe(true);
      expect(isTestFile('src/list.ts', paths)).toBe(false);
      // a sibling directory that merely starts with the same letters is not a test
      expect(isTestFile('testing/app.ts', paths)).toBe(false);
    }
  });

  it('does not mistake product code for a test', () => {
    for (const f of ['list.ts', 'src/testing.ts', 'contest.ts', 'latest.py']) {
      expect(isTestFile(f, [])).toBe(false);
    }
  });
});

describe('diff discipline on race 20260923-fptp', () => {
  /*
   * The race this rule exists because of. Issue #22 asked for a --tail flag.
   * Codex added an unrelated tail() to paginate.ts, 6 lines added and 1 removed.
   * Claude built the list command with 13 tests: 54 lines, of which 39 were the tests.
   * Charging Claude for its own tests handed the win to the agent that did not do the work.
   */
  const claudeAll = { driver: 'claude' as const, files: ['list.ts', 'list.test.ts'], lines: 54 };
  const codexAll = { driver: 'codex' as const, files: ['paginate.ts', 'paginate.test.ts'], lines: 7 };

  const claudeProduct = { driver: 'claude' as const, files: ['list.ts'], lines: 15 };
  const codexProduct = { driver: 'codex' as const, files: ['paginate.ts'], lines: 6 };

  it('used to punish the agent that wrote the tests', () => {
    const before = diffDiscipline([claudeAll, codexAll]);
    expect(before.get('codex')!.awarded!).toBeGreaterThan(before.get('claude')!.awarded!);
  });

  it('no longer does, once test lines are out of the count', () => {
    const after = diffDiscipline([claudeProduct, codexProduct]);
    const claude = after.get('claude')!.awarded!;
    const codex = after.get('codex')!.awarded!;
    // 15 product lines against 6 is a far smaller gap than 54 against 7
    expect(claude).toBeGreaterThan(0);
    expect(codex - claude).toBeLessThan(2);
  });

  it('still counts a genuinely sprawling product change against an agent', () => {
    const sprawl = diffDiscipline([
      { driver: 'claude' as const, files: ['a.ts'], lines: 10 },
      { driver: 'codex' as const, files: ['a.ts', 'b.ts', 'c.ts'], lines: 400 },
    ]);
    expect(sprawl.get('claude')!.awarded!).toBeGreaterThan(sprawl.get('codex')!.awarded!);
  });

  it('scores an agent that only wrote tests as having changed nothing', () => {
    // its product diff is empty, which is what "no changes" means for this component
    const only = diffDiscipline([{ driver: 'claude' as const, files: [], lines: 0 }]);
    expect(only.get('claude')).toEqual({ id: 'diff', max: 10, awarded: 0, detail: 'no changes' });
  });
});

describe('isDocFile', () => {
  it('knows prose by extension, anywhere in the tree', () => {
    for (const f of ['README.md', 'docs/guide.mdx', 'CHANGELOG.MD', 'doc/index.rst', 'a/b/notes.md']) {
      expect(isDocFile(f)).toBe(true);
    }
  });

  it('knows anything under a docs directory, whatever the extension', () => {
    for (const f of ['docs/ko/toArray.json', 'docs', 'packages/x/docs/api.ts', 'docs/zh_hans/index.html']) {
      expect(isDocFile(f)).toBe(true);
    }
  });

  it('does not mistake code for prose', () => {
    for (const f of ['src/toArray.ts', 'markdown.ts', 'src/docsite.ts', 'mdx.tsx']) {
      expect(isDocFile(f)).toBe(false);
    }
  });
});

describe('diff discipline on the es-toolkit#2068 pilot', () => {
  /*
   * The shape of the pilot that prompted this: a few lines of code plus the docs in
   * four locales, which is what es-toolkit's own upstream fix did (PR #1893). The
   * real race scored that agent 2.2/10; these line counts are illustrative, so the
   * assertion is the relationship rather than a number I did not measure.
   */
  const docs = ['docs/en/toArray.md', 'docs/ko/toArray.md', 'docs/ja/toArray.md', 'docs/zh_hans/toArray.md'];
  const thorough = { driver: 'claude' as const, files: ['src/toArray.ts', ...docs], lines: 96 };
  const minimal = { driver: 'codex' as const, files: ['src/toArray.ts'], lines: 8 };

  it('used to punish the agent that updated the docs', () => {
    const before = diffDiscipline([thorough, minimal]);
    const thoroughScore = before.get('claude')!.awarded!;
    const minimalScore = before.get('codex')!.awarded!;
    expect(minimalScore).toBeGreaterThan(thoroughScore);
    // and by a wide margin: the docs were most of the diff
    expect(minimalScore - thoroughScore).toBeGreaterThan(4);
  });

  it('no longer does, once doc lines and doc files are out of the count', () => {
    // the product change is the same 8 lines in the same one file
    const after = diffDiscipline([
      { driver: 'claude' as const, files: ['src/toArray.ts'], lines: 8 },
      minimal,
    ]);
    expect(after.get('claude')!.awarded!).toBe(after.get('codex')!.awarded!);
    expect(after.get('claude')!.awarded!).toBeGreaterThan(9);
  });

  it('still counts a sprawling product change, docs or no docs', () => {
    const sprawl = diffDiscipline([
      { driver: 'claude' as const, files: ['src/a.ts'], lines: 10 },
      { driver: 'codex' as const, files: ['src/a.ts', 'src/b.ts', 'src/c.ts'], lines: 400 },
    ]);
    expect(sprawl.get('claude')!.awarded!).toBeGreaterThan(sprawl.get('codex')!.awarded!);
  });
});
