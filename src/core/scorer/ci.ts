import { z } from 'zod';
import type { ScoreComponent } from '@contract';
import { exec, type Exec } from '../exec';

const ChecksSchema = z.array(z.object({ name: z.string(), state: z.string(), bucket: z.string().optional() }));
const FAILED = /fail|error|cancel|timed_out/i;
const PENDING = /pending|queued|in_progress|expected|waiting/i;
const MAX = 10;
const DEFAULT_INTERVAL_MS = 15_000;

type Check = z.infer<typeof ChecksSchema>[number];

const na = (detail: string): ScoreComponent => ({ id: 'ci', max: MAX, awarded: null, detail });
const firstLine = (s: string) => s.trim().split('\n')[0] ?? '';
const verdict = (c: Check) => c.bucket ?? c.state;

function parseChecks(stdout: string): Check[] | null {
  if (!stdout.trim()) return null;
  try {
    const parsed = ChecksSchema.safeParse(JSON.parse(stdout));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export interface CiInput {
  repo: { owner: string; name: string };
  prNumber: number;
  timeoutMs: number;
  /**
   * Does the base commit have anything under `.github/workflows/`? Workflows register
   * seconds after a PR opens, so until they do `gh` honestly reports no checks. With
   * workflow files present that means "not yet"; without them it means "never".
   */
  hasWorkflows?: boolean;
  intervalMs?: number;
  run?: Exec;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

/**
 * Polls `gh pr checks` until every check has settled. All passing is 10, any failure is 0,
 * and anything we could not find out -- no checks configured, gh unavailable, scoring
 * disabled -- is n/a rather than a zero the agent did not earn.
 */
export async function ciComponent(o: CiInput): Promise<ScoreComponent> {
  if (o.timeoutMs <= 0) return na('n/a');
  const run = o.run ?? exec;
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const now = o.now ?? Date.now;
  const interval = o.intervalMs ?? DEFAULT_INTERVAL_MS;
  const start = now();

  for (;;) {
    const r = await run('gh', ['pr', 'checks', String(o.prNumber), '-R', `${o.repo.owner}/${o.repo.name}`, '--json', 'name,state,bucket']);
    const list = parseChecks(r.stdout);

    // gh exits 8 while checks run and 1 when one fails, so a non-zero exit is not itself
    // a verdict; only a response we cannot read is.
    const noChecks = !list
      ? /no checks/i.test(`${r.stderr}\n${r.stdout}`)
      : list.length === 0;

    if (noChecks) {
      if (!o.hasWorkflows) return na('no checks on this repo');
      // Workflows exist but have not registered yet; keep waiting rather than scoring n/a.
      if (now() - start >= o.timeoutMs) return na('no checks reported before the ci timeout');
      await sleep(interval);
      continue;
    }
    if (!list) return na(`gh pr checks failed: ${firstLine(r.stderr || r.stdout) || `exit ${r.code}`}`);

    const failed = list.filter((c) => FAILED.test(verdict(c)));
    if (failed.length) {
      return { id: 'ci', max: MAX, awarded: 0, detail: `${failed.length}/${list.length} checks failed (${failed[0]!.name})` };
    }
    const pending = list.filter((c) => PENDING.test(verdict(c)));
    if (!pending.length) {
      return { id: 'ci', max: MAX, awarded: 10, detail: `${list.length}/${list.length} checks passed` };
    }
    if (now() - start >= o.timeoutMs) {
      return { id: 'ci', max: MAX, awarded: 0, detail: `timed out with ${pending.length} pending` };
    }
    await sleep(interval);
  }
}
