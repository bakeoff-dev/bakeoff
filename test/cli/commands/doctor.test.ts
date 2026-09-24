import { describe, expect, it } from 'vitest';
import { compareVersions } from '../../../src/cli/commands/doctor';

describe('compareVersions', () => {
  it('reports equal dotted versions as 0', () => {
    expect(compareVersions('2.1.280', '2.1.280')).toBe(0);
  });

  it('reports a newer dotted version as positive', () => {
    expect(compareVersions('2.1.280', '2.1.263')).toBeGreaterThan(0);
    expect(compareVersions('0.156.1', '0.156.0')).toBeGreaterThan(0);
  });

  it('reports an older dotted version as negative', () => {
    expect(compareVersions('2.1.263', '2.1.280')).toBeLessThan(0);
    expect(compareVersions('0.156.0', '0.156.1')).toBeLessThan(0);
  });

  it('compares Cursor date-style versions numerically and ignores the hash suffix', () => {
    expect(compareVersions('2026.09.23-86fc751', '2026.09.18-9a7762b')).toBeGreaterThan(0);
    expect(compareVersions('2026.09.18-9a7762b', '2026.09.23-86fc751')).toBeLessThan(0);
    expect(compareVersions('2026.09.18-aaaaaaa', '2026.09.18-zzzzzzz')).toBe(0);
  });

  it('returns null for unparseable versions instead of guessing', () => {
    expect(compareVersions('unknown', '2.1.280')).toBeNull();
    expect(compareVersions('2.1.280', 'unknown')).toBeNull();
    expect(compareVersions('v2.1.280', '2.1.280')).toBeNull();
  });
});
