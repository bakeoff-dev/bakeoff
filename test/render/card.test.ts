import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RunRecordSchema } from '../../src/contract/schema';
import { cost, renderCardPng, renderCardSvg } from '../../src/render/card';

const rec = RunRecordSchema.parse(
  JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')),
);

describe('card cost', () => {
  it('reads a real sub-cent cost as nearly free, not free, matching the UI and terminal', () => {
    expect(cost(0.004)).toBe('<$0.01');
    expect(cost(0)).toBe('$0.00');
    expect(cost(null)).toBe('n/a');
    expect(cost(1.42)).toBe('$1.42');
  });
});

describe('card', () => {
  it('renders an svg with the podium and a png of the right size', async () => {
    const svg = await renderCardSvg(rec);
    expect(svg).toContain('Claude Code');
    expect(svg).toContain('74.7');
    expect(svg).toContain('edited config vitest.config.ts');
    expect(svg).not.toMatch(/[\u{1F300}-\u{1FAFF}]/u);

    const png = await renderCardPng(rec);
    expect(png.length).toBeGreaterThan(10_000);
    expect(png.subarray(0, 8)).toEqual(
      new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    );
  });
});
