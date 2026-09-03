import { describe, expect, it } from 'vitest';
import { allDrivers, getDriver, registerDriver } from '../../../src/core/drivers/registry';
import { helpHasFlags } from '../../../src/core/drivers/types';
import type { Driver } from '../../../src/core/drivers/types';

describe('registry', () => {
  it('throws on unknown id and lists registered drivers', () => {
    expect(() => getDriver('nope' as never)).toThrow(/Unknown driver/);
    const fake: Driver = { id: 'claude', displayName: 'Fake', color: '#fff', doctor: async () => ({ found: true, version: '0', authOk: true, notes: [] }), launch: async () => { throw new Error('x'); } };
    registerDriver(fake);
    expect(getDriver('claude').displayName).toBe('Fake');
    expect(allDrivers().map((d) => d.id)).toContain('claude');
  });
});
describe('helpHasFlags', () => {
  it('reports missing flags', () => {
    expect(helpHasFlags('--print  --output-format <f>', ['--print', '--output-format', '--max-turns'])).toEqual(['--max-turns']);
  });
});
