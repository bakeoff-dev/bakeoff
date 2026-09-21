import * as p from '@clack/prompts';
import { appendFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
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
# hidden_tests:
#   dest: tests/hidden
#   command: bun test tests/hidden
`;

export function initCommand(cwd = process.cwd()): void {
  const cfg = join(cwd, NAMES.configFile);
  if (existsSync(cfg)) {
    p.log.warn(`${NAMES.configFile} already exists`);
  } else {
    writeFileSync(cfg, TEMPLATE);
    p.log.success(`wrote ${NAMES.configFile}`);
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
