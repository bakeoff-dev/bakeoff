import { z } from 'zod';
import {
  AgentResultSchema, BaselineSchema, LadderEntrySchema, LadderSchema, RaceEventSchema, RunRecordSchema, SCHEMA_VERSION,
  competitorKey, type Ladder, type RaceEvent, type RunRecord,
} from './schema';

/**
 * Version 1 shapes, kept only so stored state survives the upgrade.
 *
 * `.bakeoff/runs` and `ladder.json` are committed to the user's repository, so a
 * schema bump would otherwise make every past race unreadable and reset the ladder.
 * These are frozen copies: never widen them to accept newer fields.
 */
const AgentResultV1Schema = AgentResultSchema.omit({
  model: true, requestedModel: true, testFilesTouched: true, testLinesChanged: true,
});
const RunRecordV1Schema = RunRecordSchema.omit({
  schemaVersion: true, agents: true, baseline: true, noAcceptanceTest: true,
}).extend({
  schemaVersion: z.literal(1),
  agents: z.array(AgentResultV1Schema),
  baseline: BaselineSchema.omit({ setupError: true }),
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

/**
 * `requestedModel` was added to version 2 without a bump, because it is additive and
 * null is the honest reading of a record written before it existed: we cannot know
 * afterwards whether the model on it was pinned or picked.
 */
function fillAdditive(raw: unknown): unknown {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (o === null) return raw;
  // A record written before we could tell is not evidence that we could: default to
  // false rather than warning about races that may well have had an acceptance test.
  const noAcceptanceTest = o.noAcceptanceTest === undefined ? false : o.noAcceptanceTest;
  const baseline =
    o.baseline && typeof o.baseline === 'object'
      ? { setupError: null, ...(o.baseline as Record<string, unknown>) }
      : o.baseline;
  if (!Array.isArray(o.agents)) return { ...o, baseline, noAcceptanceTest };
  return {
    ...o,
    baseline,
    noAcceptanceTest,
    agents: o.agents.map((a) => {
      const agent = a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
      return {
        requestedModel: null,
        testFilesTouched: [],
        testLinesChanged: 0,
        ...agent,
      };
    }),
  };
}

/** Parse a run record from disk, migrating version 1 forward. */
export function readRunJson(raw: unknown): RunRecord {
  const version = versionOf(raw);
  if (version === SCHEMA_VERSION) return RunRecordSchema.parse(fillAdditive(raw));
  if (version === 1) {
    const v1 = RunRecordV1Schema.parse(raw);
    // v1 never recorded which model ran, and null is exactly that statement.
    return {
      ...v1,
      schemaVersion: SCHEMA_VERSION,
      baseline: { ...v1.baseline, setupError: null },
      noAcceptanceTest: false,
      agents: v1.agents.map((a) => ({
        ...a, model: null, requestedModel: null, testFilesTouched: [], testLinesChanged: 0,
      })),
    };
  }
  if (version === undefined) return RunRecordSchema.parse(fillAdditive(raw));
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

/**
 * Parse one event off an events.jsonl line, migrating version-1 shapes forward.
 *
 * Event logs are append-only and committed alongside the runs, so old lines keep the
 * shape they were written with: `agent.started` predates models, and `race.finished`
 * embeds a whole record that needs the same migration a run.json does.
 */
export function readRaceEvent(raw: unknown): RaceEvent {
  const o = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : null;
  if (o !== null) {
    // v1 could not say which model ran, and null is exactly that statement.
    if (o.type === 'agent.started' && o.model === undefined) {
      return RaceEventSchema.parse({ ...o, model: null });
    }
    if (o.type === 'race.finished') {
      return RaceEventSchema.parse({ ...o, record: readRunJson(o.record) });
    }
    // race.started carries a baseline of its own, which predates `setupError`.
    if (o.type === 'race.started' && o.baseline && typeof o.baseline === 'object') {
      return RaceEventSchema.parse({
        ...o,
        baseline: { setupError: null, ...(o.baseline as Record<string, unknown>) },
      });
    }
  }
  return RaceEventSchema.parse(raw);
}
