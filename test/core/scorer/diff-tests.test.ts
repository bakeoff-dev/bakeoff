import { describe, expect, it } from 'vitest';
import { diffDiscipline, isTestFile } from '../../../src/core/scorer/diff';

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
