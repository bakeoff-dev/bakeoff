import { afterEach, describe, expect, it } from 'vitest';
import { colorEnabled, dim, displayWidth, fmtClock, fmtClockPadded, fmtCost, fmtTok, paint, spendBar, truncate } from '../../src/cli/render/style';

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

  it('distinguishes a tiny real cost from free', () => {
    // gpt-6-luna raced for $0.0019; "$0.00" would read as free
    expect(fmtCost(0.00187244)).toBe('<$0.01');
    expect(fmtCost(0.004)).toBe('<$0.01');
    expect(fmtCost(0.005)).toBe('$0.01');
    expect(fmtCost(0)).toBe('$0.00');
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

describe('displayWidth and truncate', () => {
  it('measures visible width, ignoring colour codes', () => {
    process.env.FORCE_COLOR = '3';
    expect(displayWidth('abc')).toBe(3);
    expect(displayWidth(paint('#F59E6B', 'abc'))).toBe(3);
    expect(displayWidth(dim('abc'))).toBe(3);
    expect(displayWidth('')).toBe(0);
    delete process.env.FORCE_COLOR;
  });

  it('counts the bar and bullet glyphs as one cell each', () => {
    process.env.NO_COLOR = '1';
    expect(displayWidth(spendBar(1.5, 3))).toBe(20);
    expect(displayWidth('●')).toBe(1);
    delete process.env.NO_COLOR;
  });

  it('truncates to a visible budget', () => {
    expect(truncate('abcdef', 3)).toBe('abc');
    expect(truncate('abc', 10)).toBe('abc');
    expect(truncate('abcdef', 0)).toBe('');
  });

  it('keeps colour codes while truncating, and resets at the cut', () => {
    process.env.FORCE_COLOR = '3';
    const painted = `${paint('#F59E6B', 'abcdef')}tail`;
    const cut = truncate(painted, 3);
    expect(displayWidth(cut)).toBe(3);
    expect(cut).toContain('\x1b[38;2;245;158;107m');
    // an interrupted colour must not bleed into the rest of the terminal
    expect(cut.endsWith('\x1b[0m')).toBe(true);
    delete process.env.FORCE_COLOR;
  });

  it('never splits an escape sequence', () => {
    process.env.FORCE_COLOR = '3';
    for (let n = 0; n <= 12; n += 1) {
      const cut = truncate(`${paint('#F59E6B', 'abcdef')}ghijkl`, n);
      expect(displayWidth(cut)).toBe(Math.min(n, 12));
      expect(/\x1b\[[0-9;]*$/.test(cut)).toBe(false);
    }
    delete process.env.FORCE_COLOR;
  });
});

describe('fmtTok counts every token the run paid for', () => {
  it('includes cache reads and cache writes, not just input and output', () => {
    // Recorded from run 20260923-mosj: Claude sends almost everything through the
    // cache, so input + output alone rendered "0k tok" for the entire race.
    const recorded = { input: 28, output: 6043, cacheRead: 468_158, cacheWrite: 26_566 };
    expect(fmtTok(recorded)).toBe('501k tok');
    expect(fmtTok(recorded)).not.toBe('0k tok');
  });

  it('still reads sensibly when nothing is cached', () => {
    expect(fmtTok({ input: 181_000, output: 9400, cacheRead: 0, cacheWrite: 0 })).toBe('190k tok');
    expect(fmtTok({ input: 0, output: 0, cacheRead: 0, cacheWrite: 0 })).toBe('0k tok');
    expect(fmtTok(null)).toBe('— tok');
  });

  it('does not round a real cache-heavy turn down to zero', () => {
    expect(fmtTok({ input: 2, output: 1, cacheRead: 12_117, cacheWrite: 19_967 })).toBe('32k tok');
  });
});
