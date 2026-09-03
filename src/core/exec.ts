export interface ExecResult { code: number; stdout: string; stderr: string }
export interface ExecOpts { cwd?: string; env?: Record<string, string>; stdin?: string }
export type Exec = (cmd: string, args: string[], opts?: ExecOpts) => Promise<ExecResult>;

export const exec: Exec = async (cmd, args, opts = {}) => {
  const proc = Bun.spawn([cmd, ...args], {
    cwd: opts.cwd,
    env: { ...process.env, ...(opts.env ?? {}) },
    stdin: opts.stdin !== undefined ? new TextEncoder().encode(opts.stdin) : 'ignore',
    stdout: 'pipe',
    stderr: 'pipe',
  });
  const [stdout, stderr, code] = await Promise.all([
    new Response(proc.stdout).text(),
    new Response(proc.stderr).text(),
    proc.exited,
  ]);
  return { code, stdout, stderr };
};

export async function must(cmd: string, args: string[], opts: ExecOpts = {}, run: Exec = exec): Promise<string> {
  const r = await run(cmd, args, opts);
  if (r.code !== 0) throw new Error(`${cmd} ${args.join(' ')} failed (${r.code}): ${r.stderr.trim() || r.stdout.trim()}`);
  return r.stdout.trim();
}
