import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { RunRecordSchema } from '../../src/contract/schema';

describe('contract fixture', () => {
  it('run.json validates against RunRecordSchema', () => {
    const raw = JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8'));
    const rec = RunRecordSchema.parse(raw);
    expect(rec.schemaVersion).toBe(1);
    expect(rec.agents).toHaveLength(3);
    expect(rec.winner).toBe('claude');
    const codex = rec.agents.find((a) => a.driver === 'codex')!;
    expect(codex.score?.tamperFlags[0]?.rule).toBe('config_write');
    const oc = rec.agents.find((a) => a.driver === 'opencode')!;
    expect(oc.status).toBe('timeout');
    expect(oc.score).toBeNull();
  });
  it('rejects a record with an unknown status', () => {
    const raw = JSON.parse(readFileSync('src/contract/fixtures/run.json', 'utf8'));
    raw.agents[0].status = 'weird';
    expect(() => RunRecordSchema.parse(raw)).toThrow();
  });
});
