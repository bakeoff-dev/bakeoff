import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SCHEMA_VERSION } from '../../src/contract/schema';
import { readLadderJson, readRunJson } from '../../src/contract/migrate';

const v1Run = JSON.parse(readFileSync('test/fixtures/v1/run.json', 'utf8'));
const v1Ladder = JSON.parse(readFileSync('test/fixtures/v1/ladder.json', 'utf8'));

describe('reading a version-1 run record', () => {
  it('migrates it instead of rejecting it', () => {
    const rec = readRunJson(v1Run);
    expect(rec.schemaVersion).toBe(SCHEMA_VERSION);
    expect(rec.agents.length).toBe(v1Run.agents.length);
  });

  it('records a null model: version 1 could not say which model ran', () => {
    const rec = readRunJson(v1Run);
    for (const a of rec.agents) expect(a.model).toBeNull();
  });

  it('fills requestedModel with null, which was added without a version bump', () => {
    const rec = readRunJson(v1Run);
    for (const a of rec.agents) expect(a.requestedModel).toBeNull();
  });

  it('fills requestedModel on a version-2 record written before the field existed', () => {
    const current = JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8'));
    const stripped = {
      ...current,
      agents: current.agents.map(({ requestedModel, ...rest }: Record<string, unknown>) => rest),
    };
    const rec = readRunJson(stripped);
    expect(rec.schemaVersion).toBe(SCHEMA_VERSION);
    for (const a of rec.agents) expect(a.requestedModel).toBeNull();
    // the model that ran is untouched; only the new field defaults
    expect(rec.agents[0]?.model).toBe('claude-opus-5');
  });

  it('changes nothing else', () => {
    const rec = readRunJson(v1Run);
    expect(rec.id).toBe(v1Run.id);
    expect(rec.winner).toBe(v1Run.winner);
    expect(rec.packetHash).toBe(v1Run.packetHash);
    const stripped = rec.agents.map(
      ({ model, requestedModel, testFilesTouched, testLinesChanged, docFilesTouched, docLinesChanged, ...rest }) =>
        rest,
    );
    expect(stripped).toEqual(v1Run.agents);
  });

  it('still reads a current record unchanged', () => {
    const current = JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8'));
    expect(readRunJson(current)).toEqual(current);
  });

  it('fills the fields added since version 2 without a bump', () => {
    const v1 = readRunJson(v1Run);
    expect(v1.noAcceptanceTest).toBe(false);
    for (const a of v1.agents) {
      expect(a.testFilesTouched).toEqual([]);
      expect(a.testLinesChanged).toBe(0);
      expect(a.docFilesTouched).toEqual([]);
      expect(a.docLinesChanged).toBe(0);
    }
  });

  it('rejects something that is neither', () => {
    expect(() => readRunJson({ schemaVersion: 99 })).toThrow(/schema version/i);
    expect(() => readRunJson({ nope: true })).toThrow();
  });
});

describe('reading a version-1 ladder', () => {
  it('migrates entries and keys them by competitor', () => {
    const ladder = readLadderJson(v1Ladder);
    expect(ladder.schemaVersion).toBe(SCHEMA_VERSION);
    // a null model keys on the driver alone, so v1 keys survive as-is
    expect(Object.keys(ladder.entries).sort()).toEqual(['claude', 'codex']);
    expect(ladder.entries.claude?.model).toBeNull();
    expect(ladder.entries.claude?.rating).toBe(1092);
    expect(ladder.entries.claude?.history).toEqual(v1Ladder.entries.claude.history);
  });

  it('preserves every rating so a migration does not reset the ladder', () => {
    const ladder = readLadderJson(v1Ladder);
    for (const [key, entry] of Object.entries(ladder.entries)) {
      expect(entry?.rating).toBe(v1Ladder.entries[key].rating);
      expect(entry?.races).toBe(v1Ladder.entries[key].races);
      expect(entry?.wins).toBe(v1Ladder.entries[key].wins);
    }
  });

  it('still reads a current ladder unchanged', () => {
    const current = {
      schemaVersion: SCHEMA_VERSION,
      entries: {
        'claude:claude-opus-5': {
          driver: 'claude', model: 'claude-opus-5', mu: 25, sigma: 8, rating: 1000,
          races: 1, wins: 1, avgCostUsd: 0.5, avgDurationMs: 1000, history: [],
        },
      },
    };
    expect(readLadderJson(current)).toEqual(current);
  });

  it('rejects an unknown version', () => {
    expect(() => readLadderJson({ schemaVersion: 99, entries: {} })).toThrow(/schema version/i);
  });
});
