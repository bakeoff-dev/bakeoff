import { describe, expect, it, vi } from 'vitest';
import type { RunProcessInput, RunProcessResult } from '../../../src/core/process';

const calls: RunProcessInput[] = [];
vi.mock('../../../src/core/process', () => ({
  runProcess: (input: RunProcessInput): Promise<RunProcessResult> => {
    calls.push(input);
    return Promise.resolve({ exitCode: 0, status: 'ok', durationMs: 1 });
  },
}));

const { geminiDriver } = await import('../../../src/core/drivers/gemini');
const { defaultMeter } = await import('../../../src/core/pricing');

const launch = async (model: string | null) => {
  calls.length = 0;
  await geminiDriver.launch({
    packet: 'do the thing', packetPath: '/p', worktree: '/w', branch: 'b', model,
    caps: { budgetUsd: 1, timeoutMs: 1000, maxTurns: null },
    meter: defaultMeter(1), onEvent: () => {}, signal: new AbortController().signal, logPath: '/l',
  });
  return calls[0]!;
};

describe('gemini launch', () => {
  it('carries the workspace-trust env, without which a fresh worktree exits 55', async () => {
    const call = await launch(null);
    expect(call.env?.GEMINI_CLI_TRUST_WORKSPACE).toBe('true');
  });

  it('carries it whether or not a model was requested', async () => {
    expect((await launch('gemini-3.5-flash')).env?.GEMINI_CLI_TRUST_WORKSPACE).toBe('true');
  });

  it('runs in the worktree and sends the packet on stdin', async () => {
    const call = await launch(null);
    expect(call.cwd).toBe('/w');
    // 0.60.0 reads the prompt from stdin, so a large packet never has to fit in argv
    expect(call.stdin).toBe('do the thing');
    expect(call.args).not.toContain('--prompt');
  });

  it('passes the model flag through', async () => {
    const call = await launch('gemini-3.5-flash');
    expect(call.args[call.args.indexOf('--model') + 1]).toBe('gemini-3.5-flash');
  });
});
