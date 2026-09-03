import { z } from 'zod';
import type { IssueInfo } from '@contract';
import { exec, must, type Exec } from './exec';

export interface IssueRef { owner: string; name: string; number: number }
export interface IssueData { info: IssueInfo; body: string; comments: { author: string; body: string }[] }

export function parseIssueRef(ref: string, fallback?: { owner: string; name: string }): IssueRef {
  let m = /^([\w.-]+)\/([\w.-]+)#(\d+)$/.exec(ref);
  if (m) return { owner: m[1]!, name: m[2]!, number: Number(m[3]) };
  m = /^https?:\/\/github\.com\/([\w.-]+)\/([\w.-]+)\/issues\/(\d+)/.exec(ref);
  if (m) return { owner: m[1]!, name: m[2]!, number: Number(m[3]) };
  m = /^#?(\d+)$/.exec(ref);
  if (m) {
    if (!fallback) throw new Error(`"${ref}" needs an owner/repo prefix outside a repository`);
    return { ...fallback, number: Number(m[1]) };
  }
  throw new Error(`Cannot parse issue reference "${ref}" (expected owner/repo#123, #123, or a URL)`);
}

const IssueJson = z.object({
  number: z.number(),
  title: z.string(),
  body: z.string().nullable().default(''),
  url: z.string(),
  comments: z.array(z.object({ author: z.object({ login: z.string() }).nullable(), body: z.string() })).default([]),
});

export async function fetchIssue(ref: IssueRef, run: Exec = exec): Promise<IssueData> {
  const raw = await must(
    'gh',
    ['issue', 'view', String(ref.number), '-R', `${ref.owner}/${ref.name}`, '--json', 'number,title,body,url,comments'],
    {},
    run,
  );
  const j = IssueJson.parse(JSON.parse(raw));
  return {
    info: { number: j.number, title: j.title, url: j.url },
    body: j.body ?? '',
    comments: j.comments.map((c) => ({ author: c.author?.login ?? 'unknown', body: c.body })),
  };
}

export async function listOpenIssues(
  repo: { owner: string; name: string },
  run: Exec = exec,
): Promise<{ number: number; title: string }[]> {
  const raw = await must(
    'gh',
    ['issue', 'list', '-R', `${repo.owner}/${repo.name}`, '--state', 'open', '--limit', '30', '--json', 'number,title'],
    {},
    run,
  );
  return z.array(z.object({ number: z.number(), title: z.string() })).parse(JSON.parse(raw));
}
