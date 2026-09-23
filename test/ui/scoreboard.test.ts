import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { NO_ACCEPTANCE_TEST, RunRecordSchema, type RunRecord } from '@contract';
import { warnings } from '../../ui/src/screens/Scoreboard';

const base = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));
const rec = (over: Partial<RunRecord>): RunRecord => ({ ...base, ...over });

describe('warnings', () => {
  it('says nothing when the race could check its own work', () => {
    expect(warnings(rec({ noAcceptanceTest: false }))).toEqual([]);
  });

  it('says the scores prove nothing about the issue when no test checked it', () => {
    expect(warnings(rec({ noAcceptanceTest: true }))).toEqual([NO_ACCEPTANCE_TEST]);
  });

  it('keeps warning that a red baseline makes visible-test points unreliable', () => {
    const red = rec({ baseline: { ...base.baseline, testsGreen: false } });
    expect(warnings(red)).toHaveLength(1);
    expect(warnings(red)[0]).toContain(base.repo.baseSha.slice(0, 7));
  });

  it('shows both if a record ever carries both', () => {
    const both = rec({ baseline: { ...base.baseline, testsGreen: false }, noAcceptanceTest: true });
    expect(warnings(both)).toHaveLength(2);
    expect(warnings(both)[1]).toBe(NO_ACCEPTANCE_TEST);
  });
});
