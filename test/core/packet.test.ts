import { describe, expect, it } from 'vitest';
import { buildPacket } from '../../src/core/packet';

const issue = { info: { number: 7, title: 'Fix it', url: 'https://github.com/a/b/issues/7' }, body: 'It breaks.', comments: [{ author: 'zoe', body: 'repro attached' }] };

describe('buildPacket', () => {
  it('is deterministic and includes every section', () => {
    const a = buildPacket({ issue, guidance: { agentsMd: 'Use bun.', claudeMd: null }, config: { test: 'bun test', typecheck: 'tsc --noEmit' } });
    const b = buildPacket({ issue, guidance: { agentsMd: 'Use bun.', claudeMd: null }, config: { test: 'bun test', typecheck: 'tsc --noEmit' } });
    expect(a.text).toBe(b.text);
    expect(a.hash).toBe(b.hash);
    expect(a.hash).toMatch(/^[0-9a-f]{64}$/);
    expect(a.text).toContain('# Task\nFix it');
    expect(a.text).toContain('## Issue #7 (https://github.com/a/b/issues/7)\nIt breaks.');
    expect(a.text).toContain('zoe: repro attached');
    expect(a.text).toContain('Use bun.');
    expect(a.text).toContain('Run: `bun test`');
    expect(a.text).toContain('Typecheck: `tsc --noEmit`');
    expect(a.text).toContain('Do NOT push');
    expect(a.text).not.toContain('bakeoff/');
  });
  it('omits empty sections', () => {
    const p = buildPacket({ issue: { ...issue, comments: [] }, guidance: { agentsMd: null, claudeMd: null }, config: { test: 'bun test' } });
    expect(p.text).not.toContain('## Comments');
    expect(p.text).not.toContain('## Repository guidance');
  });
});
