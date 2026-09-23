import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Baseline } from '@contract';
import { preflightWarnings } from '../../src/cli/commands/run';
import type { Config } from '../../src/core/config';

const config = (over: Partial<Config> = {}): Config => ({
  test: 'true', agents: ['claude'], budget_usd: 1, timeout: '1m', ci_timeout: '0s',
  judge: { enabled: false, model: 'x' }, ...over,
});
const baseline = (over: Partial<Baseline> = {}): Baseline => ({
  testsGreen: true, lintGreen: null, typecheckGreen: null, setupError: null, ...over,
});

describe('preflight warnings', () => {
  const root = mkdtempSync(join(tmpdir(), 'bakeoff-pre-'));

  it('says nothing when there is nothing to say', () => {
    expect(preflightWarnings(config(), baseline(), root)).toEqual([]);
  });

  it('warns when setup failed', () => {
    const w = preflightWarnings(config(), baseline({ setupError: 'setup failed (exit 1)' }), root);
    expect(w.join(' ')).toMatch(/setup failed \(exit 1\)/);
  });

  it('warns when the baseline tests are already red', () => {
    const w = preflightWarnings(config(), baseline({ testsGreen: false }), root);
    expect(w.join(' ')).toMatch(/baseline tests are already failing/);
  });

  it('does not warn when the baseline never ran tests', () => {
    expect(preflightWarnings(config(), baseline({ testsGreen: null }), root)).toEqual([]);
  });

  it('warns when hidden tests are configured with nothing behind them', () => {
    const cfg = config({ hidden_tests: { source: join(root, 'missing'), dest: 'd', command: 'c' } });
    expect(preflightWarnings(cfg, baseline(), root).join(' ')).toMatch(/empty or missing/);

    const empty = join(root, 'empty');
    mkdirSync(empty, { recursive: true });
    const cfg2 = config({ hidden_tests: { source: empty, dest: 'd', command: 'c' } });
    expect(preflightWarnings(cfg2, baseline(), root).join(' ')).toMatch(/empty or missing/);
  });

  it('stays quiet when the hidden tests are actually there', () => {
    const dir = join(root, 'hidden');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'h.test.ts'), 'x');
    const cfg = config({ hidden_tests: { source: dir, dest: 'd', command: 'c' } });
    expect(preflightWarnings(cfg, baseline(), root)).toEqual([]);
  });
});
