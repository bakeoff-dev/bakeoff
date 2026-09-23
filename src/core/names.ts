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

/** The throwaway branch the baseline worktree sits on. */
/**
 * Said wherever a score is shown for a race that could not check the issue itself.
 * Without it the numbers read as a verdict on the work rather than on the repo.
 */
export const NO_ACCEPTANCE_TEST =
  'No test checks this issue. Scores show nothing broke, not that the issue was solved.';

export function baselineBranch(runId: string): string {
  return `${NAMES.branchPrefix}-baseline-${runId}`;
}

export function runLabel(runId: string): string {
  return `${NAMES.runLabelPrefix}${runId}`;
}
