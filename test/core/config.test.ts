import { describe, expect, it } from 'vitest';
import { parseConfig, parseDuration, configuredFlags } from '../../src/core/config';

describe('parseDuration', () => {
  it('parses m, s, h', () => {
    expect(parseDuration('20m')).toBe(1_200_000);
    expect(parseDuration('90s')).toBe(90_000);
    expect(parseDuration('1h')).toBe(3_600_000);
    expect(() => parseDuration('soon')).toThrow();
  });
});
describe('parseConfig', () => {
  it('applies defaults', () => {
    const c = parseConfig('test: bun test\n');
    expect(c.agents).toEqual(['claude']);
    expect(c.budget_usd).toBe(3);
    expect(c.timeout).toBe('20m');
    expect(c.ci_timeout).toBe('10m');
    expect(c.judge.enabled).toBe(false);
  });
  it('rejects unknown keys and empty configs', () => {
    expect(() => parseConfig('tests: x\n')).toThrow();
    expect(() => parseConfig('agents: [claude]\n')).toThrow(/at least one of/);
  });
  it('parses hidden tests', () => {
    const c = parseConfig('test: bun test\nhidden_tests:\n  dest: tests/hidden\n  command: bun test tests/hidden\n');
    expect(c.hidden_tests?.source).toBe('.bakeoff/hidden');
  });
  it('reports configured flags', () => {
    const c = parseConfig('test: bun test\ntypecheck: tsc\nci_timeout: 0s\n');
    expect(configuredFlags(c)).toEqual({ test: true, lint: false, typecheck: true, hiddenTests: false, ci: false, judge: false });
  });
});

describe('test_paths', () => {
  const base = 'test: bun test\n';

  it('accepts directories and files', () => {
    const c = parseConfig(`${base}test_paths: [test, src/foo.test.ts, tests/]\n`);
    expect(c.test_paths).toEqual(['test', 'src/foo.test.ts', 'tests/']);
  });

  it('rejects a glob, which git would read as a literal filename', () => {
    for (const glob of ['**/*.test.ts', 'src/*.spec.ts', 'test/?.ts', 'test/[ab].ts']) {
      expect(() => parseConfig(`${base}test_paths: ["${glob}"]\n`)).toThrow(/does not take globs/);
    }
  });

  it('names the offending entry so the fix is obvious', () => {
    expect(() => parseConfig(`${base}test_paths: [test, "**/*.test.ts"]\n`)).toThrow(/\*\*\/\*\.test\.ts/);
  });
});
