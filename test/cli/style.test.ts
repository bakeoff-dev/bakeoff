import { afterEach, describe, expect, it } from 'vitest';
import { colorEnabled, fmtClock, fmtClockPadded, fmtCost, fmtTok, paint, spendBar } from '../../src/cli/render/style';

describe('style', () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it('formats clocks, tokens, cost', () => {
    expect(fmtClock(412_000)).toBe('6:52');
    expect(fmtClock(93_000)).toBe('1:33');
    expect(fmtClockPadded(134_000)).toBe('02:14');
    expect(fmtTok({ input: 181_000, output: 9400, cacheRead: 0, cacheWrite: 0 })).toBe('190k tok');
    expect(fmtTok(null)).toBe('— tok');
    expect(fmtCost(1.2)).toBe('$1.20');
    expect(fmtCost(null)).toBe('n/a');
  });

  it('never renders an unavailable cost as zero', () => {
    // null means "unavailable", and must not be coerced to 0
    expect(fmtCost(null)).not.toBe('$0.00');
    expect(fmtCost(0)).toBe('$0.00');
  });

  it('draws a 20-cell spend bar', () => {
    process.env.NO_COLOR = '1';
    expect(spendBar(1.2, 3)).toBe('▰▰▰▰▰▰▰▰▱▱▱▱▱▱▱▱▱▱▱▱');
    expect(spendBar(null, 3)).toBe('▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱▱');
    expect(spendBar(9, 3)).toBe('▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰▰');
    expect(spendBar(1.2, 3)).toHaveLength(20);
  });

  it('strips color under NO_COLOR and emits truecolor otherwise', () => {
    process.env.NO_COLOR = '1';
    expect(colorEnabled()).toBe(false);
    expect(paint('#F59E6B', 'x')).toBe('x');
    delete process.env.NO_COLOR;
    process.env.FORCE_COLOR = '3';
    expect(paint('#F59E6B', 'x')).toBe('\x1b[38;2;245;158;107mx\x1b[39m');
  });

  it('falls back to 256 colors when the terminal is not truecolor', () => {
    delete process.env.NO_COLOR;
    delete process.env.COLORTERM;
    process.env.FORCE_COLOR = '1';
    expect(paint('#F59E6B', 'x')).toMatch(/^\x1b\[38;5;\d+mx\x1b\[39m$/);
  });

  it('carries no emoji in any status or driver label', () => {
    // no emoji anywhere in the terminal
    const emoji = /\p{Extended_Pictographic}/u;
    const strings = [fmtCost(null), fmtTok(null), spendBar(1, 2)];
    for (const s of strings) expect(emoji.test(s)).toBe(false);
  });
});
