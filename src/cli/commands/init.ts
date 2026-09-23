import * as p from '@clack/prompts';
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { NAMES } from '../../core/names';

const TEMPLATE = `# ${NAMES.brand} config. See https://github.com/${NAMES.org}/${NAMES.bin}#config
test: bun test
# lint: bun run lint
# typecheck: bunx tsc --noEmit
agents: [claude]
budget_usd: 3
timeout: 20m
ci_timeout: 10m
# Write one hidden test per issue, in ${NAMES.stateDir}/hidden, that fails before the fix
# and passes after. Without it a race can only show that nothing broke.
# hidden_tests:
#   source: ${NAMES.stateDir}/hidden
#   dest: tests/hidden
#   command: bun test tests/hidden
`;

const HIDDEN_README = `Put one test here per issue you race: a test that fails on the base
commit and passes once the issue is fixed.

Bakeoff copies these into each agent's worktree after the agent has finished, so no agent
can read them or write code against them. They are the only check that measures whether the
issue was actually solved -- the visible suite only shows that nothing else broke.

Uncomment the hidden_tests block in ${NAMES.configFile} to turn them on.
`;

export function initCommand(cwd = process.cwd()): void {
  const cfg = join(cwd, NAMES.configFile);
  if (existsSync(cfg)) {
    p.log.warn(`${NAMES.configFile} already exists`);
  } else {
    writeFileSync(cfg, TEMPLATE);
    p.log.success(`wrote ${NAMES.configFile}`);
  }
  const hidden = join(cwd, NAMES.stateDir, 'hidden');
  const readme = join(hidden, 'README.md');
  if (existsSync(readme)) {
    p.log.warn(`${NAMES.stateDir}/hidden already exists`);
  } else {
    mkdirSync(hidden, { recursive: true });
    writeFileSync(readme, HIDDEN_README);
    p.log.success(`created ${NAMES.stateDir}/hidden for one acceptance test per issue`);
  }

  const gi = join(cwd, '.gitignore');
  const want = [`${NAMES.stateDir}/hidden/`, `${NAMES.stateDir}/logs/`];
  const have = existsSync(gi) ? readFileSync(gi, 'utf8') : '';
  const missing = want.filter((w) => !have.split('\n').includes(w));
  if (missing.length) {
    appendFileSync(gi, `${have.endsWith('\n') || have === '' ? '' : '\n'}${missing.join('\n')}\n`);
    p.log.success(`added ${missing.join(', ')} to .gitignore`);
  }
}
