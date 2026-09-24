import { describe, expect, it, vi } from 'vitest';
import type { RunProcessInput, RunProcessResult } from '../../../src/core/process';

const probe = { stdout: '', stderr: '', exitCode: 1 as number | null };
vi.mock('../../../src/core/exec', () => ({
  exec: (_cmd: string, args: string[]) =>
    Promise.resolve({ code: 0, stdout: args[0] === '--version' ? '2.1.280 (Claude Code)' : '', stderr: '' }),
}));
vi.mock('../../../src/core/process', () => ({
  runProcess: (input: RunProcessInput): Promise<RunProcessResult> => {
    for (const l of probe.stdout.split('\n').filter(Boolean)) input.onStdoutLine?.(l);
    for (const l of probe.stderr.split('\n').filter(Boolean)) input.onStderrLine?.(l);
    return Promise.resolve({ exitCode: probe.exitCode, status: probe.exitCode === 0 ? 'ok' : 'crashed', durationMs: 1 });
  },
}));

const { claudeDriver } = await import('../../../src/core/drivers/claude');

const doctor = async (stdout: string, stderr = '') => {
  Object.assign(probe, { stdout, stderr, exitCode: 1 });
  const d = await claudeDriver.doctor();
  return { ...d, note: d.notes.join('\n') };
};

describe('claude doctor auth note', () => {
  it('reports a billing refusal as billing, not as a login problem', async () => {
    const line = JSON.stringify({
      type: 'result', subtype: 'success', is_error: true, duration_ms: 812,
      result: 'Credit balance is too low to access the Anthropic API.',
    });
    const d = await doctor(line);
    expect(d.authOk).toBe(false);
    expect(d.note).toMatch(/billing or quota reasons: Credit balance is too low/);
    expect(d.note).not.toMatch(/log in/);
  });

  it('reads stderr for a rate limit', async () => {
    const d = await doctor('', 'API Error: 429 rate_limit_error: This request would exceed your rate limit\n');
    expect(d.authOk).toBe(false);
    expect(d.note).toMatch(/billing or quota reasons: API Error: 429/);
  });

  it('still tells a logged-out user to log in, even when a number in the envelope is 429', async () => {
    const line = JSON.stringify({
      type: 'result', subtype: 'success', is_error: true, duration_ms: 429,
      result: 'Invalid API key · Please run /login',
    });
    const d = await doctor(line);
    expect(d.authOk).toBe(false);
    expect(d.note).toMatch(/run `claude` once interactively to log in/);
    expect(d.note).not.toMatch(/billing/);
  });
});
