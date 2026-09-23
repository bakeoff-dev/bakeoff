import { describe, expect, it } from 'vitest';
import { checkComponents } from '../../../src/core/scorer/lint';

describe('checkComponents', () => {
  it('splits 7.5/7.5 when both configured', async () => {
    const [tc, lint] = await checkComponents({ worktree: '/tmp', config: { typecheck: 'true', lint: 'false' } });
    expect(tc).toMatchObject({ id: 'typecheck', max: 7.5, awarded: 7.5, detail: 'clean' });
    expect(lint).toMatchObject({ id: 'lint', max: 7.5, awarded: 0 });
    expect(lint.detail).toContain('exit 1');
  });

  it('gives the configured one 15 and the other max 0 n/a', async () => {
    const [tc, lint] = await checkComponents({ worktree: '/tmp', config: { typecheck: 'true' } });
    expect(tc).toMatchObject({ id: 'typecheck', max: 15, awarded: 15 });
    expect(lint).toMatchObject({ id: 'lint', max: 0, awarded: null, detail: 'n/a' });
  });

  it('is n/a for both when neither configured', async () => {
    const [tc, lint] = await checkComponents({ worktree: '/tmp', config: {} });
    expect(tc).toMatchObject({ id: 'typecheck', max: 7.5, awarded: null });
    expect(lint).toMatchObject({ id: 'lint', max: 7.5, awarded: null });
  });
});
