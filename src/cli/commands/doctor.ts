import * as p from '@clack/prompts';
import type { DriverId } from '@contract';
import { exec, type Exec } from '../../core/exec';
import { allDrivers, getDriver } from '../../core/drivers/registry';
import { NAMES, TESTED_VERSIONS } from '../../core/names';

export interface DoctorLine { name: string; ok: boolean; detail: string }

// TESTED_VERSIONS only covers the drivers that ship; `gemini` is a schema slot with no driver.
const TESTED: Partial<Record<DriverId, string>> = TESTED_VERSIONS;

/**
 * Numeric parts of a version string, ignoring a trailing `-<hash>` suffix (Cursor's
 * date-style versions, e.g. `2026.09.23-86fc751`). Returns null when any dotted
 * segment before the suffix is not a plain non-negative integer -- an unparseable
 * version should never be guessed at.
 */
function numericParts(version: string): number[] | null {
  const datePart = version.split('-')[0] ?? version;
  const segments = datePart.split('.');
  const parts: number[] = [];
  for (const seg of segments) {
    if (!/^\d+$/.test(seg)) return null;
    parts.push(Number(seg));
  }
  return parts.length > 0 ? parts : null;
}

/**
 * Compares two version strings numerically, dotted segment by dotted segment.
 * Handles both plain dotted versions (2.1.280 vs 2.1.263) and Cursor's date-style
 * versions (2026.09.23-86fc751), where the hash suffix is ignored. Returns null when
 * either side cannot be parsed, so an unfamiliar format never triggers a false note.
 */
export function compareVersions(a: string, b: string): number | null {
  const pa = numericParts(a);
  const pb = numericParts(b);
  if (pa === null || pb === null) return null;
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (diff !== 0) return diff;
  }
  return 0;
}

export async function doctorReport(ids: DriverId[], run: Exec = exec): Promise<DoctorLine[]> {
  const lines: DoctorLine[] = [];
  const git = await run('git', ['--version']);
  lines.push({ name: 'git', ok: git.code === 0, detail: git.stdout.trim() });
  const gh = await run('gh', ['auth', 'status']);
  lines.push({
    name: 'gh auth',
    ok: gh.code === 0,
    detail: gh.code === 0 ? 'logged in' : gh.stderr.trim().split('\n')[0] ?? 'not logged in',
  });
  // Each probe is a real round trip to a provider; run them at once rather than in turn.
  const probes = await Promise.all(
    ids.map(async (id) => {
      const d = getDriver(id);
      return { d, id, r: await d.doctor() };
    }),
  );
  for (const { d, id, r } of probes) {
    const tested = TESTED[id];
    const notes = [...r.notes];
    const cmp = r.version && tested ? compareVersions(r.version, tested) : null;
    if (cmp !== null && cmp < 0) notes.push(`older than tested ${tested}; update it`);
    lines.push({
      name: d.displayName,
      ok: r.found && r.authOk,
      detail: [r.found ? `v${r.version ?? '?'}` : 'not found', ...notes].join('; '),
    });
  }
  return lines;
}

export async function doctorCommand(ids: DriverId[]): Promise<boolean> {
  p.intro(`${NAMES.brand} doctor`);
  let lines: DoctorLine[];
  try {
    lines = await doctorReport(ids);
  } catch (e) {
    p.log.error((e as Error).message);
    p.outro('Fix the items above before racing.');
    return false;
  }
  for (const l of lines) (l.ok ? p.log.success : p.log.error)(`${l.name}: ${l.detail}`);
  const ok = lines.every((l) => l.ok);
  p.outro(ok ? 'All good.' : 'Fix the items above before racing.');
  return ok;
}

/** Everything the registry knows about, so a new driver needs no flag default updated. */
export function registeredDriverIds(): DriverId[] {
  return allDrivers().map((d) => d.id);
}
