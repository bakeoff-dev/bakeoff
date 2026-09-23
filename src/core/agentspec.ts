import { DriverIdSchema, type DriverId } from '@contract';
import { normalizeModel } from './drivers/types';

/** One competitor in a race: which CLI, and which model it should run. */
export interface AgentSpec {
  driver: DriverId;
  /** null means "let the CLI pick" -- we pass no model flag at all. */
  model: string | null;
}

/** Spelling of "use the CLI default" that a user can write explicitly. */
const AUTO = 'auto';

const driverList = (): string => DriverIdSchema.options.join(', ');

/**
 * Parse `driver` or `driver:model`. Only the first colon separates, so a
 * provider-qualified model such as `anthropic/claude-opus-5` survives intact.
 */
export function parseAgentSpec(spec: string): AgentSpec {
  const text = spec.trim();
  if (text.length === 0) throw new Error(`Empty agent spec (expected e.g. "claude" or "claude:claude-opus-5")`);

  const colon = text.indexOf(':');
  const rawDriver = (colon === -1 ? text : text.slice(0, colon)).trim();
  const rawModel = colon === -1 ? null : text.slice(colon + 1).trim();

  const parsed = DriverIdSchema.safeParse(rawDriver);
  if (!parsed.success) throw new Error(`Unknown agent "${rawDriver}" (known: ${driverList()})`);

  if (rawModel === null) return { driver: parsed.data, model: null };
  if (rawModel.length === 0) {
    throw new Error(`Missing model after ":" in "${text}" (use "${rawDriver}" or "${rawDriver}:auto" for the default)`);
  }
  // Normalised the same way drivers normalise what they report, so `Claude-Opus-5` and
  // `claude-opus-5` are one ladder row rather than two.
  return { driver: parsed.data, model: rawModel.toLowerCase() === AUTO ? null : normalizeModel(rawModel) };
}

/**
 * Parse a whole roster, from `--agents` (comma-separated) or `bakeoff.yml` (a list).
 *
 * A driver may appear only once: branches, worktrees and the reducer's lanes are all
 * keyed by driver id in v1, so two models of the same CLI would collide on all three.
 */
export function parseAgentSpecs(input: string | readonly string[]): AgentSpec[] {
  const parts = (typeof input === 'string' ? input.split(',') : input).map((s) => s.trim()).filter((s) => s.length > 0);
  if (parts.length === 0) throw new Error('No agents given (expected e.g. "claude" or "claude:claude-opus-5,codex")');

  const specs = parts.map(parseAgentSpec);
  const seen = new Set<DriverId>();
  for (const s of specs) {
    if (seen.has(s.driver)) {
      throw new Error(`Agent "${s.driver}" listed more than once; each agent may race only once per run`);
    }
    seen.add(s.driver);
  }
  return specs;
}

export function formatAgentSpec(spec: AgentSpec): string {
  return spec.model === null ? spec.driver : `${spec.driver}:${spec.model}`;
}
