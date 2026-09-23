export const NAMES = {
  brand: 'Bakeoff',
  bin: 'bakeoff',
  pkg: 'bakeoff-cli',
  org: 'bakeoff-dev',
  configFile: 'bakeoff.yml',
  stateDir: '.bakeoff',
  branchPrefix: 'bakeoff',
  label: 'bakeoff',
  runLabelPrefix: 'bakeoff-run:',
  tmpDirName: 'bakeoff',
  botName: 'bakeoff',
  botEmail: 'bakeoff@users.noreply.github.com',
  port: 4141,
} as const;

export const TESTED_VERSIONS = {
  claude: '2.1.263',
  codex: '0.156.0',
  gemini: '0.60.0',
  cursor: '2026.09.02-c22c1a3',
} as const;

export function branchName(issue: number, driver: string, runId: string): string {
  return `${NAMES.branchPrefix}/${issue}-${driver}-${runId}`;
}

/** Lives in the contract so the UI can say it too; re-exported here for the CLI. */
export { NO_ACCEPTANCE_TEST } from '../contract';

/** The throwaway branch the baseline worktree sits on. */
export function baselineBranch(runId: string): string {
  return `${NAMES.branchPrefix}-baseline-${runId}`;
}

export function runLabel(runId: string): string {
  return `${NAMES.runLabelPrefix}${runId}`;
}
