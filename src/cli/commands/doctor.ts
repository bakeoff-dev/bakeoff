import * as p from '@clack/prompts';
import type { DriverId } from '@contract';
import { exec, type Exec } from '../../core/exec';
import { allDrivers, getDriver } from '../../core/drivers/registry';
import { NAMES, TESTED_VERSIONS } from '../../core/names';

export interface DoctorLine { name: string; ok: boolean; detail: string }

// TESTED_VERSIONS only covers the drivers that ship; `gemini` is a schema slot with no driver.
const TESTED: Partial<Record<DriverId, string>> = TESTED_VERSIONS;

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
    if (r.version && tested && r.version !== tested) notes.push(`tested with ${tested}`);
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
