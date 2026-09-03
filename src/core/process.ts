import { spawn } from 'node:child_process';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { createInterface } from 'node:readline';
import type { BudgetMeter } from './budget';

export interface RunProcessInput {
  cmd: string; args: string[]; cwd: string; env?: Record<string, string>;
  stdin?: string; timeoutMs: number; signal?: AbortSignal; meter?: BudgetMeter;
  onStdoutLine?: (line: string) => void; onStderrLine?: (line: string) => void;
  logPath?: string;
}
export type ProcessStatus = 'ok' | 'timeout' | 'budget_exceeded' | 'aborted' | 'crashed';
export interface RunProcessResult { exitCode: number | null; status: ProcessStatus; durationMs: number }

const KILL_GRACE_MS = 10_000;

export function runProcess(input: RunProcessInput): Promise<RunProcessResult> {
  return new Promise((resolve) => {
    const started = Date.now();
    let reason: Exclude<ProcessStatus, 'ok' | 'crashed'> | null = null;
    let killTimer: ReturnType<typeof setTimeout> | null = null;
    if (input.logPath) mkdirSync(dirname(input.logPath), { recursive: true });
    const log = (prefix: string, line: string) => {
      if (input.logPath) appendFileSync(input.logPath, `${prefix}${line}\n`);
    };

    const child = spawn(input.cmd, input.args, {
      cwd: input.cwd,
      env: { ...process.env, ...(input.env ?? {}) },
      detached: true,
      stdio: [input.stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    const pgid = child.pid;
    const killGroup = (sig: NodeJS.Signals) => {
      if (pgid) {
        try {
          process.kill(-pgid, sig);
        } catch {
          /* already gone */
        }
      }
    };
    const stop = (why: Exclude<ProcessStatus, 'ok' | 'crashed'>) => {
      if (reason) return;
      reason = why;
      log('[bakeoff] ', `${why}: SIGTERM sent to process group`);
      killGroup('SIGTERM');
      killTimer = setTimeout(() => killGroup('SIGKILL'), KILL_GRACE_MS);
    };

    const timeout = setTimeout(() => stop('timeout'), input.timeoutMs);
    const onAbort = () => stop('aborted');
    input.signal?.addEventListener('abort', onAbort, { once: true });

    const wire = (stream: NodeJS.ReadableStream | null, prefix: string, cb?: (l: string) => void) => {
      if (!stream) return;
      createInterface({ input: stream }).on('line', (line) => {
        log(prefix, line);
        cb?.(line);
        if (input.meter?.exceeded) stop('budget_exceeded');
      });
    };
    wire(child.stdout, '', input.onStdoutLine);
    wire(child.stderr, '[stderr] ', input.onStderrLine);

    if (input.stdin !== undefined && child.stdin) child.stdin.end(input.stdin);

    child.on('error', (err) => {
      log('[bakeoff] ', `spawn error: ${err.message}`);
    });
    child.on('close', (code) => {
      clearTimeout(timeout);
      if (killTimer) clearTimeout(killTimer);
      input.signal?.removeEventListener('abort', onAbort);
      const durationMs = Date.now() - started;
      const status: ProcessStatus = reason ?? (code === 0 ? 'ok' : 'crashed');
      resolve({ exitCode: code, status, durationMs });
    });
  });
}
