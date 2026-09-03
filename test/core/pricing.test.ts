import { describe, expect, it } from 'vitest';
import { priceFor } from '../../src/core/pricing';

describe('priceFor', () => {
  it('matches known models by prefix, case-insensitively', () => {
    expect(priceFor('claude-sonnet-4-5-20250929')).not.toBeNull();
    expect(priceFor('GPT-5')).not.toBeNull();
    expect(priceFor('gpt-5-codex')).not.toBeNull();
  });
  it('returns null for unknown models', () => {
    expect(priceFor('llama-local')).toBeNull();
    expect(priceFor('')).toBeNull();
  });
  it('prefers the longest prefix', () => {
    const a = priceFor('gpt-5-mini');
    const b = priceFor('gpt-5');
    expect(a).not.toEqual(b);
  });
});
