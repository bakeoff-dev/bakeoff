import { describe, expect, it } from 'vitest';
import { detectRepo } from '../../src/core/repo';
import { fakeExec } from '../helpers/exec';

describe('detectRepo', () => {
  it('reads owner, name, default branch, base sha, root', async () => {
    const { run, calls } = fakeExec([
      [/^git rev-parse --show-toplevel/, { stdout: '/tmp/x\n' }],
      [/^gh repo view --json/, { stdout: JSON.stringify({ nameWithOwner: 'bakeoff-dev/scratch', defaultBranchRef: { name: 'main' } }) }],
      [/^git fetch origin main/, {}],
      [/^git rev-parse origin\/main/, { stdout: 'abc123\n' }],
    ]);
    const r = await detectRepo('/tmp/x/sub', run);
    expect(r).toEqual({ owner: 'bakeoff-dev', name: 'scratch', defaultBranch: 'main', baseSha: 'abc123', root: '/tmp/x' });
    expect(calls.some((c) => c.startsWith('git fetch origin main'))).toBe(true);
  });
});
