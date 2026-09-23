/**
 * Sentences the CLI and the UI must say identically. They qualify what a score means,
 * so two wordings would be two different claims about the same run.
 */

/**
 * Said wherever a score is shown for a race that could not check the issue itself.
 * Without it the numbers read as a verdict on the work rather than on the repo.
 */
export const NO_ACCEPTANCE_TEST =
  'No test checks this issue. Scores show nothing broke, not that the issue was solved.';
