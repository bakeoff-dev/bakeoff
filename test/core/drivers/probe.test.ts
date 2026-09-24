import { chmodSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { jsonLine, probeDoctor, str } from '../../../src/core/drivers/shared';

const dir = mkdtempSync(join(tmpdir(), 'probe-test-'));
afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A fake CLI: answers --version and --help, and prints `stdout`/`stderr` for the probe. */
function fakeBin(name: string, stdout: string, stderr = ''): string {
  const bin = join(dir, name);
  const out = join(dir, `${name}.out`);
  const err = join(dir, `${name}.err`);
  writeFileSync(out, stdout);
  writeFileSync(err, stderr);
  writeFileSync(
    bin,
    [
      '#!/bin/sh',
      'case "$1" in',
      '  --version) echo "0.60.0"; exit 0;;',
      '  --help) echo "--output-format"; exit 0;;',
      'esac',
      'cat >/dev/null',
      `cat '${out}'`,
      `cat '${err}' >&2`,
      'exit 1',
      '',
    ].join('\n'),
  );
  chmodSync(bin, 0o755);
  return bin;
}

const probe = (bin: string) =>
  probeDoctor({
    bin,
    installHint: 'install it',
    requiredFlags: ['--output-format'],
    probeArgs: ['--output-format', 'stream-json'],
    probeStdin: 'say ok',
    probeOk: (stdout) =>
      stdout.split('\n').some((l) => str(jsonLine(l)?.type) === 'result' && str(jsonLine(l)?.status) === 'success'),
    timeoutMs: 10_000,
  });

describe('probeDoctor auth notes', () => {
  it('reports a 402 billing refusal as billing, not as a login problem', async () => {
    const line = JSON.stringify({
      type: 'result',
      status: 'error',
      error: {
        type: 'Error',
        message: '[API Error: {"error": {"code": 402, "message": "Your prepayment credits are depleted."}}]',
      },
    });
    const d = await probe(fakeBin('gemini-billing', `${line}\n`));
    expect(d.authOk).toBe(false);
    const note = d.notes.join('\n');
    expect(note).toMatch(/billing or quota/);
    expect(note).toMatch(/prepayment credits are depleted/);
    expect(note).not.toMatch(/log in/);
    // the quoted line is trimmed, not dumped whole
    expect(d.notes.every((n) => n.length < 220)).toBe(true);
  });

  it('reads stderr too: a quota message there is billing, not login', async () => {
    const d = await probe(fakeBin('gemini-quota', '', 'Error: Quota exceeded for this project (429)\n'));
    expect(d.authOk).toBe(false);
    expect(d.notes.join('\n')).toMatch(/billing or quota.*Quota exceeded/);
  });

  it('still tells a logged-out user to log in', async () => {
    const d = await probe(fakeBin('gemini-logged-out', '', 'Please set an Auth method in your settings.json\n'));
    expect(d.authOk).toBe(false);
    expect(d.notes.join('\n')).toMatch(/once interactively to log in/);
    expect(d.notes.join('\n')).not.toMatch(/billing/);
  });
});
