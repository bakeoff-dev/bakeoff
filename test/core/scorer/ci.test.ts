import { describe, expect, it } from 'vitest';
import type { Exec, ExecResult } from '../../../src/core/exec';
import { ciComponent } from '../../../src/core/scorer/ci';
import { fakeExec } from '../../helpers/exec';

const repo = { owner: 'a', name: 'b' };
const nap = async () => {};
const json = (checks: { name: string; state: string; bucket?: string }[]) => JSON.stringify(checks);

/** One response per poll, so a run can change its answer the way CI does. */
function queuedExec(responses: Partial<ExecResult>[]) {
  const calls: string[] = [];
  const run: Exec = async (cmd, args) => {
    calls.push([cmd, ...args].join(' '));
    const next = responses[Math.min(calls.length - 1, responses.length - 1)]!;
    return { code: 0, stdout: '', stderr: '', ...next };
  };
  return { run, calls };
}

describe('ciComponent', () => {
  it('awards 10 when all checks pass', async () => {
    const { run, calls } = fakeExec([[/gh pr checks 5/, { stdout: json([{ name: 'test', state: 'SUCCESS', bucket: 'pass' }]) }]]);
    const c = await ciComponent({ repo, prNumber: 5, timeoutMs: 1000, intervalMs: 1, run, sleep: nap });
    expect(c).toMatchObject({ id: 'ci', max: 10, awarded: 10, detail: '1/1 checks passed' });
    expect(calls[0]).toBe('gh pr checks 5 -R a/b --json name,state,bucket');
  });

  it('awards 0 on failure and names the first failing check', async () => {
    const { run } = fakeExec([
      [/gh pr checks/, { code: 1, stdout: json([{ name: 'lint', state: 'FAILURE', bucket: 'fail' }, { name: 'test', state: 'SUCCESS', bucket: 'pass' }]) }],
    ]);
    const c = await ciComponent({ repo, prNumber: 1, timeoutMs: 10, intervalMs: 1, run, sleep: nap });
    expect(c.awarded).toBe(0);
    expect(c.detail).toBe('1/2 checks failed (lint)');
  });

  it('is n/a when the repo has no checks', async () => {
    const { run } = fakeExec([[/gh pr checks/, { code: 1, stderr: "no checks reported on the 'x' branch" }]]);
    const c = await ciComponent({ repo, prNumber: 1, timeoutMs: 10, intervalMs: 1, run, sleep: nap });
    expect(c).toMatchObject({ awarded: null, max: 10 });
    expect(c.detail).toBe('no checks on this repo');
  });

  it('is n/a, not 0, when gh itself fails', async () => {
    const { run } = fakeExec([[/gh pr checks/, { code: 4, stderr: 'gh: not authenticated' }]]);
    const c = await ciComponent({ repo, prNumber: 1, timeoutMs: 10, intervalMs: 1, run, sleep: nap });
    expect(c.awarded).toBeNull();
    expect(c.detail).toContain('gh pr checks failed');
  });

  // gh exits 8 while checks are still running, so a non-zero exit is not on its own a verdict.
  it('polls until the pending checks finish', async () => {
    const { run, calls } = queuedExec([
      { code: 8, stdout: json([{ name: 't', state: 'PENDING', bucket: 'pending' }]) },
      { code: 8, stdout: json([{ name: 't', state: 'IN_PROGRESS', bucket: 'pending' }]) },
      { code: 0, stdout: json([{ name: 't', state: 'SUCCESS', bucket: 'pass' }]) },
    ]);
    let t = 0;
    const c = await ciComponent({ repo, prNumber: 1, timeoutMs: 10_000, intervalMs: 15, run, sleep: async (ms) => { t += ms; }, now: () => t });
    expect(c.awarded).toBe(10);
    expect(calls).toHaveLength(3);
    expect(t).toBe(30);
  });

  it('times out while pending', async () => {
    let t = 0;
    const { run } = fakeExec([[/gh pr checks/, { code: 8, stdout: json([{ name: 't', state: 'PENDING', bucket: 'pending' }]) }]]);
    const c = await ciComponent({ repo, prNumber: 1, timeoutMs: 30, intervalMs: 10, run, sleep: async (ms) => { t += ms; }, now: () => t });
    expect(c.awarded).toBe(0);
    expect(c.detail).toContain('timed out');
    expect(c.detail).toContain('1 pending');
  });

  it('is n/a when the timeout is zero', async () => {
    const { run, calls } = fakeExec([[/gh pr checks/, { stdout: json([{ name: 't', state: 'SUCCESS', bucket: 'pass' }]) }]]);
    const c = await ciComponent({ repo, prNumber: 1, timeoutMs: 0, run, sleep: nap });
    expect(c.awarded).toBeNull();
    expect(c.detail).toBe('n/a');
    expect(calls).toEqual([]);
  });
});

describe('ci before workflows register', () => {
  const repo = { owner: 'o', name: 'r' };
  const noChecks = { code: 0, stdout: '[]', stderr: '' };

  it('keeps waiting when the repo has workflow files', async () => {
    // GitHub registers a workflow seconds after the PR opens; until then gh honestly
    // reports nothing, and scoring that as n/a would lose the check entirely.
    let calls = 0;
    const run = async () => {
      calls += 1;
      return calls < 3
        ? noChecks
        : { code: 0, stdout: JSON.stringify([{ name: 'test', state: 'success', bucket: 'pass' }]), stderr: '' };
    };
    const c = await ciComponent({
      repo, prNumber: 1, timeoutMs: 60_000, intervalMs: 1, hasWorkflows: true, run, sleep: async () => {},
    });
    expect(c.awarded).toBe(10);
    expect(calls).toBe(3);
  });

  it('calls it n/a at once when the repo has no workflow files', async () => {
    let calls = 0;
    const run = async () => {
      calls += 1;
      return noChecks;
    };
    const c = await ciComponent({
      repo, prNumber: 1, timeoutMs: 60_000, intervalMs: 1, hasWorkflows: false, run, sleep: async () => {},
    });
    expect(c.awarded).toBeNull();
    expect(c.detail).toMatch(/no checks/);
    expect(calls).toBe(1);
  });

  it('gives up as n/a, not zero, if workflows never report', async () => {
    let t = 0;
    const c = await ciComponent({
      repo, prNumber: 1, timeoutMs: 100, intervalMs: 1, hasWorkflows: true,
      run: async () => noChecks,
      sleep: async () => { t += 60; },
      now: () => t,
    });
    expect(c.awarded).toBeNull();
    expect(c.detail).toMatch(/before the ci timeout/);
  });
});
