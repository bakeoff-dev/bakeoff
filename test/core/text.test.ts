import { describe, expect, it } from 'vitest';
import { oneLine } from '../../src/core/text';

const ESC = '\u001b';

describe('oneLine', () => {
  it('collapses newline, carriage return and tab runs to a single space', () => {
    expect(oneLine('a\nb')).toBe('a b');
    expect(oneLine('a\r\nb')).toBe('a b');
    expect(oneLine('a\n\n\nb')).toBe('a b');
    expect(oneLine('a\tb')).toBe('a b');
    expect(oneLine('a\r\n\tb')).toBe('a b');
  });

  it('strips other control and format characters', () => {
    expect(oneLine('a\u0007b')).toBe('ab');
    expect(oneLine('a\u0000b')).toBe('ab');
    expect(oneLine('a\u200bb')).toBe('ab');
  });

  it('strips whole escape sequences, not just the escape byte', () => {
    expect(oneLine(`${ESC}[31mred${ESC}[0m`)).toBe('red');
    expect(oneLine(`a${ESC}[6A${ESC}[Jb`)).toBe('ab');
  });

  it('trims and leaves ordinary text alone', () => {
    expect(oneLine('  hello world  ')).toBe('hello world');
    expect(oneLine('Bash /opt/homebrew/bin/bun test')).toBe('Bash /opt/homebrew/bin/bun test');
    expect(oneLine('')).toBe('');
  });

  it('flattens the heredoc commit that broke the live view', () => {
    const recorded = 'Bash git add list.ts && git commit -q -m "$(cat <<\'EOF\'\r\nAdd list command with';
    const out = oneLine(recorded);
    expect(out).not.toMatch(/[\r\n]/);
    expect(out).toContain('Add list command with');
  });
});
