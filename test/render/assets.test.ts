import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { assetPath } from '../../src/render/assets';
import { fontPaths, fonts } from '../../src/render/fonts';

describe('build assets', () => {
  it('finds the fonts from a source checkout', () => {
    for (const p of fontPaths()) {
      expect(existsSync(p)).toBe(true);
      expect(p.endsWith('.ttf')).toBe(true);
    }
  });

  it('loads both weights', () => {
    const loaded = fonts();
    expect(loaded.map((f) => f.weight)).toEqual([400, 700]);
    for (const f of loaded) expect(f.data.byteLength).toBeGreaterThan(1000);
  });

  it('says what to run when an asset is missing, rather than failing deep in satori', () => {
    expect(() => assetPath('nope', 'missing.ttf')).toThrow(/npm run build/);
  });
});
