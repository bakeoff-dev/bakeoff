import { rmSync } from 'node:fs';
import type { Baseline } from '@contract';
import { exec, must, type Exec } from '../exec';
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
const VENDORED = /(^|\/)(node_modules|dist|build|vendor|target)\//;

/**
 * A test file by name alone. Go and Python keep their tests beside the code, so a rule that
 * only knew `.test.`/`.spec.` left those suites unrestored and unprotected. The tamper
 * detector and path detection share this one pattern so they cannot drift apart.
 */
export const TEST_FILE_NAME = /\.(test|spec)\.([cm]?[jt]sx?|py|go|rb)$|_test\.(go|py)$|(^|\/)test_[^/]*\.py$/;

export function testPathsFrom(files: string[]): string[] {
  const tracked = files.filter((f) => !VENDORED.test(f));
  const dirs = TEST_DIRS.filter((d) => tracked.some((f) => f.startsWith(`${d}/`)));
  const loose = tracked.filter((f) => TEST_FILE_NAME.test(f) && !dirs.some((d) => f.startsWith(`${d}/`)));
  return [...dirs, ...loose.sort()];
}

/**
 * Test paths as they were at base, read from the tree rather than the worktree: an agent
 * that deletes the suite would otherwise leave nothing to restore and nothing to protect.
 */
export async function defaultTestPaths(worktree: string, baseSha: string, run: Exec = exec): Promise<string[]> {
  const out = await must('git', ['ls-tree', '-r', '--name-only', '-z', baseSha], { cwd: worktree }, run);
  return testPathsFrom(out.split('\0').filter(Boolean));
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
  /** `setup` is the optional install step; the rest are the scored commands. */
  config: { test?: string; lint?: string; typecheck?: string; setup?: string };
}

/**
 * Baseline plus, when the install step failed, the reason. The extra key is absent on the
 * happy path and dropped by `BaselineSchema` on read, so the run record keeps its shape.
 */
export type BaselineResult = Baseline & { setupError?: string };

/** Runs setup and then the configured checks on a throwaway worktree at base sha. */
export async function computeBaseline(o: BaselineInput, run: Exec = exec): Promise<BaselineResult> {
  const dir = worktreeDir(o.runId, 'baseline');
  const branch = `bakeoff-baseline-${o.runId}`;
  await createWorktree({ repoRoot: o.repoRoot, baseSha: o.baseSha, branch, dir }, run);
  try {
    if (o.config.setup) {
      const setup = await runCheck(o.config.setup, dir);
      // Without its dependencies the repo cannot be judged green or unknown, only red.
      if (!setup.green) {
        return { testsGreen: false, lintGreen: false, typecheckGreen: false, setupError: `setup failed (exit ${setup.exitCode})` };
      }
    }
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
