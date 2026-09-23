import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import * as p from '@clack/prompts';
import { NAMES } from '../../core/names';
import { detectRepo } from '../../core/repo';
import { listRunIds, paths, readRun } from '../../core/store';
import { renderCardPng } from '../../../src/render/card';

/**
 * Render a run's share card to `.bakeoff/runs/<id>.png`.
 *
 * Returns the path so `run` can mention it. Fonts resolve relative to `src/render/`,
 * which is right when running from source; the packaging PR has to teach it the dist
 * layout as well.
 */
export async function writeCard(repoRoot: string, runId: string): Promise<string> {
  const rec = readRun(repoRoot, runId);
  const png = await renderCardPng(rec);
  const out = paths(repoRoot).png(runId);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, png);
  return out;
}

export async function shareCommand(runId?: string): Promise<void> {
  p.intro(`${NAMES.brand} share`);
  const repo = await detectRepo(process.cwd());
  const id = runId ?? listRunIds(repo.root).at(-1);
  if (!id) {
    p.log.error(`No runs found in ${NAMES.stateDir}/runs`);
    p.cancel('Nothing to share.');
    process.exit(1);
  }
  try {
    const out = await writeCard(repo.root, id);
    p.log.success(out);
    p.outro(`Card for run ${id}.`);
  } catch (e) {
    p.log.error((e as Error).message);
    p.cancel('Could not render the card.');
    process.exit(1);
  }
}
