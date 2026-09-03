import { describe, expect, it } from 'vitest';
import { mkdtempSync, readFileSync } from 'node:fs';
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
    appendEvent(root, fixture.id, { type: 'agent.started', at: 'a', driver: 'claude', branch: 'b' });
    appendEvent(root, fixture.id, { type: 'agent.started', at: 'a', driver: 'codex', branch: 'c' });
    expect(readEvents(root, fixture.id)).toHaveLength(2);
    expect(readLadder(root)).toEqual({ schemaVersion: 1, entries: {} });
    writeLadder(root, { schemaVersion: 1, entries: { claude: { driver: 'claude', mu: 25, sigma: 8.33, rating: 1000, races: 0, wins: 0, avgCostUsd: null, avgDurationMs: 0, history: [] } } });
    expect(readLadder(root).entries.claude?.rating).toBe(1000);
    expect(paths(root).hiddenDir).toBe(join(root, '.bakeoff', 'hidden'));
  });
});
