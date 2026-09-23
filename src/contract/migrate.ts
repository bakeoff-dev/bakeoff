import { z } from 'zod';
import {
  AgentResultSchema, LadderEntrySchema, LadderSchema, RunRecordSchema, SCHEMA_VERSION,
  competitorKey, type Ladder, type RunRecord,
} from './schema';

/**
 * Version 1 shapes, kept only so stored state survives the upgrade.
 *
 * `.bakeoff/runs` and `ladder.json` are committed to the user's repository, so a
 * schema bump would otherwise make every past race unreadable and reset the ladder.
 * These are frozen copies: never widen them to accept newer fields.
 */
const AgentResultV1Schema = AgentResultSchema.omit({ model: true });
const RunRecordV1Schema = RunRecordSchema.omit({ schemaVersion: true, agents: true }).extend({
  schemaVersion: z.literal(1),
  agents: z.array(AgentResultV1Schema),
});
const LadderEntryV1Schema = LadderEntrySchema.omit({ model: true });
const LadderV1Schema = z.object({
  schemaVersion: z.literal(1),
  entries: z.record(z.string(), LadderEntryV1Schema.optional()),
});

const versionOf = (raw: unknown): unknown =>
  raw && typeof raw === 'object' ? (raw as Record<string, unknown>).schemaVersion : undefined;

function unknownVersion(what: string, raw: unknown): Error {
  return new Error(
    `Unsupported ${what} schema version ${String(versionOf(raw))}; this build reads 1 and ${SCHEMA_VERSION}`,
  );
}

/** Parse a run record from disk, migrating version 1 forward. */
export function readRunJson(raw: unknown): RunRecord {
  const version = versionOf(raw);
  if (version === SCHEMA_VERSION) return RunRecordSchema.parse(raw);
  if (version === 1) {
    const v1 = RunRecordV1Schema.parse(raw);
    // v1 never recorded which model ran, and null is exactly that statement.
    return { ...v1, schemaVersion: SCHEMA_VERSION, agents: v1.agents.map((a) => ({ ...a, model: null })) };
  }
  if (version === undefined) return RunRecordSchema.parse(raw);
  throw unknownVersion('run record', raw);
}

/** Parse a ladder from disk, migrating version 1 forward. */
export function readLadderJson(raw: unknown): Ladder {
  const version = versionOf(raw);
  if (version === SCHEMA_VERSION) return LadderSchema.parse(raw);
  if (version === 1) {
    const v1 = LadderV1Schema.parse(raw);
    const entries: Ladder['entries'] = {};
    for (const entry of Object.values(v1.entries)) {
      if (!entry) continue;
      // v1 rated per driver, which is what a null model keys on -- ratings carry over intact.
      entries[competitorKey(entry.driver, null)] = { ...entry, model: null };
    }
    return { schemaVersion: SCHEMA_VERSION, entries };
  }
  if (version === undefined) return LadderSchema.parse(raw);
  throw unknownVersion('ladder', raw);
}
