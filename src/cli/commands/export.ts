import * as p from '@clack/prompts';
import { NAMES } from '../../core/names';
import { detectRepo } from '../../core/repo';
import { listRunIds } from '../../core/store';
import { exportScoreboard } from '../scoreboard';

export async function exportCommand(runId?: string): Promise<void> {
  p.intro(`${NAMES.brand} export`);
  const repo = await detectRepo(process.cwd());
  const id = runId ?? listRunIds(repo.root).at(-1);
  if (!id) {
    p.log.error(`No runs found in ${NAMES.stateDir}/runs`);
    p.cancel('Nothing to export.');
    process.exit(1);
  }
  try {
    const out = exportScoreboard(repo.root, id);
    p.log.success(out);
    p.outro('Open it in a browser; it needs no server.');
  } catch (e) {
    p.log.error((e as Error).message);
    p.cancel('Could not write the scoreboard.');
    process.exit(1);
  }
}
