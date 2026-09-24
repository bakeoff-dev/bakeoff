import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCursorLine } from '../../../src/core/drivers/cursor';
import type { AgentEvent } from '../../../src/core/drivers/types';

// Tool-call lines copied from a real cursor-agent 2026.09.18 race log, worktree path made generic.
const lines = readFileSync(join(__dirname, '../../fixtures/drivers/cursor/tool-calls.jsonl'), 'utf8')
  .trimEnd()
  .split('\n');

const kindOf = (line: string): string => {
  const o = JSON.parse(line) as { subtype: string; tool_call: Record<string, unknown> };
  return `${Object.keys(o.tool_call).find((k) => k.endsWith('ToolCall')) ?? ''}:${o.subtype}`;
};
const byKind = new Map(lines.map((l) => [kindOf(l), l]));
const eventsOf = (key: string): AgentEvent[] => parseCursorLine(byKind.get(key)!, null).events;
const actionOf = (key: string): string => {
  const a = eventsOf(key).find((e) => e.kind === 'action');
  return a?.kind === 'action' ? a.text : '';
};

describe('cursor tool_call actions', () => {
  it('labels every kind seen in a real run, started and completed alike', () => {
    expect(actionOf('editToolCall:started')).toBe('Edit /tmp/wt/paginate.ts');
    expect(actionOf('editToolCall:completed')).toBe('Edit /tmp/wt/paginate.ts');
    expect(actionOf('readToolCall:started')).toBe('Read /tmp/wt/paginate.ts');
    expect(actionOf('readToolCall:completed')).toBe('Read /tmp/wt/paginate.test.ts');
    expect(actionOf('grepToolCall:started')).toBe('Grep paginate|chunk');
    expect(actionOf('grepToolCall:completed')).toBe('Grep paginate|chunk');
    expect(actionOf('globToolCall:started')).toBe('Glob **/*');
    expect(actionOf('globToolCall:completed')).toBe('Glob **/*');
    expect(actionOf('shellToolCall:started')).toBe('Bash cd /tmp/wt && bun test');
    expect(actionOf('shellToolCall:completed')).toBe('Bash cd /tmp/wt && bun test');
  });

  it('never falls back to a bare "tool" for a known kind', () => {
    for (const l of lines) {
      const a = parseCursorLine(l, null).events.find((e) => e.kind === 'action');
      expect(a?.kind === 'action' && a.text).not.toBe('tool');
    }
  });

  it('reports the edited file, and only for edits', () => {
    expect(eventsOf('editToolCall:completed')).toContainEqual({ kind: 'file', path: '/tmp/wt/paginate.ts' });
    for (const key of ['readToolCall:completed', 'grepToolCall:completed', 'globToolCall:completed', 'shellToolCall:completed']) {
      expect(eventsOf(key).some((e) => e.kind === 'file')).toBe(false);
    }
  });

  it('names an unknown kind after itself', () => {
    const line = JSON.stringify({ type: 'tool_call', subtype: 'started', tool_call: { deleteToolCall: { args: { path: '/tmp/wt/x.ts' } } } });
    const a = parseCursorLine(line, null).events.find((e) => e.kind === 'action');
    expect(a?.kind === 'action' && a.text).toBe('delete /tmp/wt/x.ts');
  });
});
