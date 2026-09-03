import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { RunRecordSchema } from '../../src/contract/schema';
import { displayRating, renderLadder, updateLadder } from '../../src/core/ladder';

const rec = RunRecordSchema.parse(
  JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8')),
);

describe('ladder', () => {
  it('new agents start at 1000', () => {
    expect(displayRating(25, 25 / 3)).toBe(1000);
  });

  it('winner goes up, loser goes down, timeout excluded but recorded', () => {
    const ladder = updateLadder({ schemaVersion: 1, entries: {} }, rec);

    expect(ladder.entries.claude!.rating).toBeGreaterThan(
      ladder.entries.codex!.rating,
    );
    expect(ladder.entries.claude!.races).toBe(1);
    expect(ladder.entries.claude!.wins).toBe(1);
    expect(ladder.entries.codex!.wins).toBe(0);
    expect(ladder.entries.opencode!.races).toBe(0);
    expect(ladder.entries.opencode!.rating).toBe(1000);
    expect(ladder.entries.opencode!.history).toHaveLength(1);
    expect(ladder.entries.claude!.avgCostUsd).toBe(1.42);
    expect(ladder.entries.opencode!.avgCostUsd).toBeNull();
  });

  it('is idempotent per run id', () => {
    const once = updateLadder({ schemaVersion: 1, entries: {} }, rec);
    expect(updateLadder(once, rec)).toEqual(once);
  });

  it('renders a table', () => {
    const ladder = updateLadder({ schemaVersion: 1, entries: {} }, rec);
    expect(renderLadder(ladder)).toMatch(/claude\s+\d{3,4}\s+1\s+1/);
  });
});
