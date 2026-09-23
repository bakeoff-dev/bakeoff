import type { DriverId, ScoreComponent } from '@contract';
import { exec, must, type Exec } from '../exec';

export interface DiffStats { files: string[]; added: number; removed: number }

/**
 * What the agent committed, `base..HEAD`. Bakeoff commits any leftovers before scoring, so
 * HEAD is the whole of the agent's work; the working tree at this point also holds the
 * scorer's own restored test files and copied hidden tests, which must not be counted.
 */
export async function diffStats(worktree: string, baseSha: string, run: Exec = exec): Promise<DiffStats> {
  const files = new Set<string>();
  let added = 0;
  let removed = 0;
  const numstat = await must('git', ['diff', '--numstat', `${baseSha}..HEAD`], { cwd: worktree }, run);
  for (const line of numstat.split('\n').filter(Boolean)) {
    const [a, r, f] = line.split('\t');
    if (!f) continue;
    files.add(f);
    added += a === '-' ? 0 : Number(a);
    removed += r === '-' ? 0 : Number(r);
  }
  return { files: [...files], added, removed };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
};

export interface Finisher { driver: DriverId; files: string[]; lines: number }

/**
 * Size is 6 points scaled by the median diff size, scope is 4 points for staying inside
 * the consensus file set. A finisher that changed nothing scores 0, never a share of the
 * points for restraint.
 */
export function diffDiscipline(finishers: Finisher[]): Map<DriverId, ScoreComponent> {
  const out = new Map<DriverId, ScoreComponent>();
  const real = finishers.filter((f) => f.lines > 0 && f.files.length > 0);
  const med = real.length ? median(real.map((f) => f.lines)) : 0;
  const threshold = real.length >= 2 ? Math.max(2, Math.ceil(real.length / 2)) : 1;
  const counts = new Map<string, number>();
  for (const f of real) for (const file of new Set(f.files)) counts.set(file, (counts.get(file) ?? 0) + 1);
  const consensus = new Set([...counts].filter(([, n]) => n >= threshold).map(([f]) => f));

  for (const f of finishers) {
    if (f.lines === 0 || f.files.length === 0) {
      out.set(f.driver, { id: 'diff', max: 10, awarded: 0, detail: 'no changes' });
      continue;
    }
    const inConsensus = f.files.filter((x) => consensus.has(x)).length;
    const size = 6 * Math.min(1, med / f.lines);
    const scope = real.length === 1 ? 4 : 4 * (inConsensus / f.files.length);
    const shown = real.length === 1 ? f.files.length : inConsensus;
    out.set(f.driver, {
      id: 'diff',
      max: 10,
      awarded: round1(size + scope),
      detail: `${f.lines} lines, ${f.files.length} files, ${shown} in consensus`,
    });
  }
  return out;
}
