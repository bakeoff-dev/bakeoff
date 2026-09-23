import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import type { ScoreComponent } from '@contract';
import type { Config } from '../config';
import { restoreTestPaths, runCheck } from './checks';

export interface TestCounts { passed: number; total: number }

/** Best-effort per-test counts for the receipts row only. Never used for points. */
export function parseTestCounts(out: string): TestCounts | null {
  let m = /Tests\s+(?:(\d+) failed \|\s*)?(\d+) passed \((\d+)\)/.exec(out); // vitest / jest
  if (m) return { passed: Number(m[2]), total: Number(m[3]) };
  m = /(\d+) pass\s*\n\s*(\d+) fail/.exec(out); // bun test
  if (m) return { passed: Number(m[1]), total: Number(m[1]) + Number(m[2]) };
  m = /=+ (?:(\d+) passed)?(?:, )?(?:(\d+) failed)?.* in [\d.]+s =+/.exec(out); // pytest
  if (m && (m[1] || m[2])) return { passed: Number(m[1] ?? 0), total: Number(m[1] ?? 0) + Number(m[2] ?? 0) };
  const ok = (out.match(/^ok\s+\S+/gm) ?? []).length; // go test: one line per package
  const failed = (out.match(/^FAIL\s+\S+/gm) ?? []).length;
  if (ok + failed > 0) return { passed: ok, total: ok + failed };
  return null;
}

function countDetail(counts: TestCounts | null, green: boolean, exitCode: number | null): string {
  if (counts) return `${counts.passed}/${counts.total} passed`;
  return green ? 'green' : `exit ${exitCode}`;
}

export interface VisibleTestsInput {
  worktree: string;
  baseSha: string;
  config: { test?: string };
  testPaths: string[];
  hiddenConfigured: boolean;
  baselineGreen: boolean | null;
}

export async function visibleTestsComponent(o: VisibleTestsInput): Promise<ScoreComponent> {
  const max = o.hiddenConfigured ? 30 : 50;
  if (!o.config.test) return { id: 'visible_tests', max, awarded: null, detail: 'n/a' };
  await restoreTestPaths(o.worktree, o.baseSha, o.testPaths);
  const r = await runCheck(o.config.test, o.worktree);
  const parts = [countDetail(parseTestCounts(r.output), r.green, r.exitCode)];
  if (o.baselineGreen === false) parts.push('baseline red');
  return { id: 'visible_tests', max, awarded: r.green ? max : 0, detail: parts.join(', ') };
}

export interface HiddenTestsInput {
  worktree: string;
  hiddenDir: string;
  hidden: NonNullable<Config['hidden_tests']>;
}

export async function hiddenTestsComponent(o: HiddenTestsInput): Promise<ScoreComponent> {
  const max = 20;
  if (!existsSync(o.hiddenDir) || readdirSync(o.hiddenDir).length === 0) {
    return { id: 'hidden_tests', max, awarded: null, detail: 'no hidden tests found' };
  }
  const dest = join(o.worktree, o.hidden.dest);
  mkdirSync(dest, { recursive: true });
  cpSync(o.hiddenDir, dest, { recursive: true });
  const r = await runCheck(o.hidden.command, o.worktree);
  return { id: 'hidden_tests', max, awarded: r.green ? max : 0, detail: countDetail(parseTestCounts(r.output), r.green, r.exitCode) };
}
