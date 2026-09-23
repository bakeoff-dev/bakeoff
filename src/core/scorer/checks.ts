import { existsSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import type { Baseline } from '@contract';
import { exec, type Exec } from '../exec';
import { runProcess } from '../process';
import { createWorktree, removeWorktree, worktreeDir } from '../worktree';

export interface CheckResult { green: boolean; output: string; exitCode: number | null }

const OUTPUT_LINES = 200;

/** Runs a configured command through `sh -c` so `bun test && tsc` style strings work. */
export async function runCheck(cmd: string, cwd: string, timeoutMs = 10 * 60_000): Promise<CheckResult> {
  const lines: string[] = [];
  const push = (l: string) => { lines.push(l); if (lines.length > OUTPUT_LINES * 2) lines.splice(0, lines.length - OUTPUT_LINES); };
  const r = await runProcess({
    cmd: 'sh',
    args: ['-c', cmd],
    cwd,
    timeoutMs,
    onStdoutLine: push,
    onStderrLine: push,
  });
  return { green: r.status === 'ok', output: lines.slice(-OUTPUT_LINES).join('\n'), exitCode: r.exitCode };
}

const TEST_DIRS = ['test', 'tests', '__tests__', 'spec'];
const TEST_FILE = /\.(test|spec)\.(ts|tsx|js|jsx|mjs|cjs|py|go|rb)$/;
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'vendor', 'target']);

/**
 * Walks the worktree for test files. Deliberately `node:fs` rather than `Bun.Glob`:
 * the suite runs under Node via vitest, where the `Bun` global does not exist.
 */
function walkTestFiles(worktree: string, rel: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(rel ? join(worktree, rel) : worktree, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    if (e.name.startsWith('.') || SKIP_DIRS.has(e.name)) continue;
    const p = rel ? `${rel}/${e.name}` : e.name;
    if (e.isDirectory()) walkTestFiles(worktree, p, out);
    else if (e.isFile() && TEST_FILE.test(e.name)) out.push(p);
  }
}

export function defaultTestPaths(worktree: string): string[] {
  const dirs = TEST_DIRS.filter((d) => existsSync(join(worktree, d)));
  const files: string[] = [];
  walkTestFiles(worktree, '', files);
  const loose = files.filter((f) => !dirs.some((d) => f.startsWith(`${d}/`)));
  return [...dirs, ...loose.sort()];
}

/** `git checkout <base> -- <path>` per path, skipping paths that did not exist at base. */
export async function restoreTestPaths(worktree: string, baseSha: string, paths: string[], run: Exec = exec): Promise<string[]> {
  const restored: string[] = [];
  for (const p of paths) {
    const exists = await run('git', ['cat-file', '-e', `${baseSha}:${p}`], { cwd: worktree });
    if (exists.code !== 0) continue;
    const r = await run('git', ['checkout', baseSha, '--', p], { cwd: worktree });
    if (r.code === 0) restored.push(p);
  }
  return restored;
}

export interface BaselineInput {
  repoRoot: string;
  baseSha: string;
  runId: string;
  config: { test?: string; lint?: string; typecheck?: string };
}

/** Runs the configured checks on a throwaway worktree at base sha. */
export async function computeBaseline(o: BaselineInput, run: Exec = exec): Promise<Baseline> {
  const dir = worktreeDir(o.runId, 'baseline');
  const branch = `bakeoff-baseline-${o.runId}`;
  await createWorktree({ repoRoot: o.repoRoot, baseSha: o.baseSha, branch, dir }, run);
  try {
    const go = async (cmd?: string) => (cmd ? (await runCheck(cmd, dir)).green : null);
    return {
      testsGreen: await go(o.config.test),
      lintGreen: await go(o.config.lint),
      typecheckGreen: await go(o.config.typecheck),
    };
  } finally {
    await removeWorktree({ repoRoot: o.repoRoot, dir, branch, deleteBranch: true }, run);
    rmSync(dir, { recursive: true, force: true });
  }
}
