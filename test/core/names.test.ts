import { describe, expect, it } from 'vitest';
import { NAMES, branchName, runLabel } from '../../src/core/names';

describe('names', () => {
  it('derives branch and label from run id', () => {
    expect(branchName(7, 'claude', '20260902-k7q2')).toBe('bakeoff/7-claude-20260902-k7q2');
    expect(runLabel('20260902-k7q2')).toBe('bakeoff-run:20260902-k7q2');
    expect(NAMES.configFile).toBe('bakeoff.yml');
    expect(NAMES.stateDir).toBe('.bakeoff');
    expect(NAMES.port).toBe(4141);
  });
});
