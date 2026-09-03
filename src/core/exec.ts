import { spawn } from 'node:child_process';

export interface ExecResult { code: number; stdout: string; stderr: string }
export interface ExecOpts { cwd?: string; env?: Record<string, string>; stdin?: string }
export type Exec = (cmd: string, args: string[], opts?: ExecOpts) => Promise<ExecResult>;

/**
 * Spawn-and-capture. Uses `node:child_process` rather than `Bun.spawn` because vitest
 * runs the suite under Node, where the `Bun` global does not exist; Bun implements this
 * module natively, so one code path serves both. A binary that cannot be spawned resolves
 * as code 127 with the reason on stderr instead of throwing, so `doctor` can report a
 * missing CLI as a failed check rather than crashing.
 */
export const exec: Exec = (cmd, args, opts = {}) =>
  new Promise((resolve) => {
    const child = spawn(cmd, args, {
      cwd: opts.cwd,
      env: { ...process.env, ...(opts.env ?? {}) },
      stdio: [opts.stdin !== undefined ? 'pipe' : 'ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (c: Buffer) => { stdout += c.toString(); });
    child.stderr?.on('data', (c: Buffer) => { stderr += c.toString(); });
    child.on('error', (err) => resolve({ code: 127, stdout, stderr: stderr + err.message }));
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
    if (opts.stdin !== undefined && child.stdin) child.stdin.end(opts.stdin);
  });

export async function must(cmd: string, args: string[], opts: ExecOpts = {}, run: Exec = exec): Promise<string> {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.code}): ${r.stderr.trim() || r.stdout.trim()}`);
  return r.stdout.trim();
}
