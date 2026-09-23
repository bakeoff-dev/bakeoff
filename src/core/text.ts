/** CSI escape sequences, stripped whole so a lone ESC does not leave `[31m` behind. */
const ANSI = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const BREAKS = /[\r\n\t\v\f]+/g;
const CONTROL = /[\p{Cc}\p{Cf}]/gu;

/**
 * Collapse untrusted agent text to a single printable line.
 *
 * Drivers copy tool arguments straight out of agent output, so an action can carry
 * anything the agent typed -- a heredoc commit message puts a real newline in the
 * middle of it. Rendered as-is, one logical line occupies two terminal rows, and the
 * live view's cursor-up no longer matches the height it drew.
 */
export function oneLine(s: string): string {
  return s.replace(ANSI, '').replace(BREAKS, ' ').replace(CONTROL, '').trim();
}
