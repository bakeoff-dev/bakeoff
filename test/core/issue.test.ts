import { describe, expect, it } from 'vitest';
import { parseIssueRef, fetchIssue, listOpenIssues } from '../../src/core/issue';
import { fakeExec } from '../helpers/exec';

describe('parseIssueRef', () => {
  it('handles owner/repo#n, #n, n, and urls', () => {
    const fb = { owner: 'o', name: 'r' };
    expect(parseIssueRef('a/b#12')).toEqual({ owner: 'a', name: 'b', number: 12 });
    expect(parseIssueRef('#12', fb)).toEqual({ owner: 'o', name: 'r', number: 12 });
    expect(parseIssueRef('12', fb)).toEqual({ owner: 'o', name: 'r', number: 12 });
    expect(parseIssueRef('https://github.com/a/b/issues/3')).toEqual({ owner: 'a', name: 'b', number: 3 });
    expect(() => parseIssueRef('12')).toThrow(/owner\/repo/);
  });
});
describe('fetchIssue', () => {
  it('maps gh json', async () => {
    const { run } = fakeExec([[/^gh issue view 7 -R a\/b --json/, { stdout: JSON.stringify({
      number: 7, title: 'T', body: 'B', url: 'https://github.com/a/b/issues/7',
      comments: [{ author: { login: 'zoe' }, body: 'hi' }] }) }]]);
    const r = await fetchIssue({ owner: 'a', name: 'b', number: 7 }, run);
    expect(r.info).toEqual({ number: 7, title: 'T', url: 'https://github.com/a/b/issues/7' });
    expect(r.comments).toEqual([{ author: 'zoe', body: 'hi' }]);
  });
});
describe('listOpenIssues', () => {
  it('lists number + title', async () => {
    const { run } = fakeExec([[/^gh issue list -R a\/b/, { stdout: JSON.stringify([{ number: 1, title: 'x' }]) }]]);
    expect(await listOpenIssues({ owner: 'a', name: 'b' }, run)).toEqual([{ number: 1, title: 'x' }]);
  });
});
