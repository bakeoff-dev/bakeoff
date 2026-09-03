import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { IssueData } from './issue';

export interface Guidance { agentsMd: string | null; claudeMd: string | null }
export interface PacketInput {
  issue: IssueData;
  guidance: Guidance;
  config: { test?: string; lint?: string; typecheck?: string };
}

export function readGuidance(repoRoot: string): Guidance {
  const read = (f: string) => (existsSync(join(repoRoot, f)) ? readFileSync(join(repoRoot, f), 'utf8') : null);
  return { agentsMd: read('AGENTS.md'), claudeMd: read('CLAUDE.md') };
}

export function buildPacket(input: PacketInput): { text: string; hash: string } {
  const { issue, guidance, config } = input;
  const parts: string[] = [];
  parts.push(`# Task\n${issue.info.title}\n`);
  parts.push(`## Issue #${issue.info.number} (${issue.info.url})\n${issue.body.trim()}\n`);
  if (issue.comments.length > 0) {
    parts.push(`## Comments\n${issue.comments.map((c) => `${c.author}: ${c.body.trim()}`).join('\n\n')}\n`);
  }
  const guidanceText = [guidance.agentsMd, guidance.claudeMd].filter((g): g is string => !!g && g.trim().length > 0);
  if (guidanceText.length > 0) parts.push(`## Repository guidance\n${guidanceText.map((g) => g.trim()).join('\n\n')}\n`);
  const verify: string[] = [];
  if (config.test) verify.push(`Run: \`${config.test}\``);
  if (config.typecheck) verify.push(`Typecheck: \`${config.typecheck}\``);
  if (config.lint) verify.push(`Lint: \`${config.lint}\``);
  parts.push(`## How to verify\n${verify.join('\n')}\n`);
  parts.push(
    [
      '## Rules',
      '- Work only in this directory. It is a git worktree on its own branch.',
      '- Commit as you go with clear messages. Do NOT push, do NOT open a pull request.',
      '- Do not modify or delete existing tests, test configuration, or CI files. Add new tests if useful.',
      '- When finished, stop. A pull request will be opened for you.',
      '',
    ].join('\n'),
  );
  const text = parts.join('\n');
  const hash = createHash('sha256').update(text).digest('hex');
  return { text, hash };
}
