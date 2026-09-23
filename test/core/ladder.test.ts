import { SCHEMA_VERSION } from '@contract';
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
    const ladder = updateLadder({ schemaVersion: SCHEMA_VERSION, entries: {} }, rec);

    // keyed by competitor: the fixture races claude on opus-5 and codex on gpt-5.6-sol,
    // while opencode ran on the CLI default and so keys on the driver alone
    const claude = ladder.entries['claude:claude-opus-5']!;
    const codex = ladder.entries['codex:gpt-5.6-sol']!;
    const opencode = ladder.entries.opencode!;

    expect(claude.rating).toBeGreaterThan(codex.rating);
    expect(claude.model).toBe('claude-opus-5');
    expect(opencode.model).toBeNull();
    expect(claude.races).toBe(1);
    expect(claude.wins).toBe(1);
    expect(codex.wins).toBe(0);
    expect(opencode.races).toBe(0);
    expect(opencode.rating).toBe(1000);
    expect(opencode.history).toHaveLength(1);
    expect(claude.avgCostUsd).toBe(1.42);
    expect(opencode.avgCostUsd).toBeNull();
  });

  it('rates the same driver separately on different models', () => {
    const twoModels = {
      ...rec,
      agents: [
        { ...rec.agents[0]!, model: 'claude-opus-5', rank: 1 },
        { ...rec.agents[1]!, driver: 'claude' as const, model: 'claude-sonnet-5', rank: 2 },
      ],
    };
    const ladder = updateLadder({ schemaVersion: SCHEMA_VERSION, entries: {} }, twoModels);
    expect(Object.keys(ladder.entries).sort()).toEqual(['claude:claude-opus-5', 'claude:claude-sonnet-5']);
    expect(ladder.entries['claude:claude-opus-5']!.rating).toBeGreaterThan(
      ladder.entries['claude:claude-sonnet-5']!.rating,
    );
  });

  it('is idempotent per run id', () => {
    const once = updateLadder({ schemaVersion: SCHEMA_VERSION, entries: {} }, rec);
    expect(updateLadder(once, rec)).toEqual(once);
  });

  it('renders a table', () => {
    const ladder = updateLadder({ schemaVersion: SCHEMA_VERSION, entries: {} }, rec);
    expect(renderLadder(ladder)).toMatch(/claude:claude-opus-5\s+\d{3,4}\s+1\s+1/);
    // the default-model competitor still renders under its bare driver name
    expect(renderLadder(ladder)).toMatch(/opencode\s+\d{3,4}\s+0\s+0/);
  });
});
