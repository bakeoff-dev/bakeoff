import { SCHEMA_VERSION } from '@contract';
import { describe, expect, it } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { newRunId, paths, writeRun, readRun, appendEvent, readEvents, listRunIds, readLadder, writeLadder } from '../../src/core/store';
import { RunRecordSchema } from '../../src/contract/schema';

const fixture = RunRecordSchema.parse(JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')));

describe('store', () => {
  it('makes sortable run ids', () => {
    expect(newRunId(new Date('2026-09-02T10:00:00Z'), () => 'k7q2')).toBe('20260902-k7q2');
    expect(newRunId()).toMatch(/^\d{8}-[a-z0-9]{4}$/);
  });
  it('round-trips runs, events, ladder', () => {
    const root = mkdtempSync(join(tmpdir(), 'bakeoff-store-'));
    writeRun(root, fixture);
    expect(readRun(root, fixture.id)).toEqual(fixture);
    expect(listRunIds(root)).toEqual([fixture.id]);
    appendEvent(root, fixture.id, { type: 'agent.started', at: 'a', driver: 'claude', branch: 'b', model: null, requestedModel: null });
    appendEvent(root, fixture.id, { type: 'agent.started', at: 'a', driver: 'codex', branch: 'c', model: null, requestedModel: null });
    expect(readEvents(root, fixture.id)).toHaveLength(2);
    expect(readLadder(root)).toEqual({ schemaVersion: SCHEMA_VERSION, entries: {} });
    writeLadder(root, { schemaVersion: SCHEMA_VERSION, entries: { claude: { driver: 'claude', model: null, mu: 25, sigma: 8.33, rating: 1000, races: 0, wins: 0, avgCostUsd: null, avgDurationMs: 0, history: [] } } });
    expect(readLadder(root).entries.claude?.rating).toBe(1000);
    expect(paths(root).hiddenDir).toBe(join(root, '.bakeoff', 'hidden'));
  });

  it('reads a version-1 run.json and ladder.json off disk, migrating both', () => {
    const root = mkdtempSync(join(tmpdir(), 'bakeoff-v1-'));
    const p = paths(root);
    mkdirSync(p.runsDir, { recursive: true });
    const v1Run = JSON.parse(readFileSync('test/fixtures/v1/run.json', 'utf8'));
    writeFileSync(p.runJson(v1Run.id), JSON.stringify(v1Run, null, 2));
    writeFileSync(p.ladder, readFileSync('test/fixtures/v1/ladder.json', 'utf8'));

    const rec = readRun(root, v1Run.id);
    expect(rec.schemaVersion).toBe(SCHEMA_VERSION);
    for (const a of rec.agents) expect(a.model).toBeNull();

    const ladder = readLadder(root);
    expect(ladder.schemaVersion).toBe(SCHEMA_VERSION);
    // ratings survive the bump, so a migration does not wipe the standings
    expect(ladder.entries.claude?.rating).toBe(1092);
    expect(ladder.entries.claude?.model).toBeNull();
  });
});
