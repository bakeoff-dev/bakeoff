import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runProcess } from '../../src/core/process';
import { BudgetMeter } from '../../src/core/budget';

const alive = (pid: number) => { try { process.kill(pid, 0); return true; } catch { return false; } };
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

describe('runProcess', () => {
  it('returns ok with exit code and captures lines', async () => {
    const lines: string[] = [];
    const r = await runProcess({ cmd: 'sh', args: ['-c', 'echo one; echo two >&2; exit 3'], cwd: tmpdir(), timeoutMs: 5000,
      onStdoutLine: (l) => lines.push(`out:${l}`), onStderrLine: (l) => lines.push(`err:${l}`) });
    expect(r.exitCode).toBe(3);
    expect(r.status).toBe('crashed');
    expect(lines.sort()).toEqual(['err:two', 'out:one']);
  });
  it('kills the whole process group on timeout', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bakeoff-proc-'));
    const pidfile = join(dir, 'pid');
    const r = await runProcess({ cmd: 'sh', args: ['-c', `sleep 30 & echo $! > ${pidfile}; wait`], cwd: dir, timeoutMs: 500 });
    expect(r.status).toBe('timeout');
    await wait(200);
    const child = Number(readFileSync(pidfile, 'utf8').trim());
    expect(alive(child)).toBe(false);
  });
  it('passes stdin and appends a log file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'bakeoff-proc-'));
    const logPath = join(dir, 'x.log');
    const r = await runProcess({ cmd: 'cat', args: [], cwd: dir, stdin: 'hello\n', timeoutMs: 5000, logPath });
    expect(r.status).toBe('ok');
    expect(existsSync(logPath)).toBe(true);
    expect(readFileSync(logPath, 'utf8')).toContain('hello');
  });
  it('trips the budget meter and reports budget_exceeded', async () => {
    const meter = new BudgetMeter(1.0, () => ({ input: 1_000_000, output: 1_000_000, cacheRead: 0, cacheWrite: 0 }));
    const r = await runProcess({
      cmd: 'sh', args: ['-c', 'for i in 1 2 3 4 5; do echo tick; sleep 0.2; done'], cwd: tmpdir(), timeoutMs: 10000, meter,
      onStdoutLine: () => meter.addUsage({ input: 1, output: 0, cacheRead: 0, cacheWrite: 0 }, 'm'),
    });
    expect(r.status).toBe('budget_exceeded');
    expect(r.durationMs).toBeLessThan(2000);
  });
  it('honors an abort signal', async () => {
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);
    const r = await runProcess({ cmd: 'sleep', args: ['10'], cwd: tmpdir(), timeoutMs: 10000, signal: ac.signal });
    expect(r.status).toBe('aborted');
  });
});
