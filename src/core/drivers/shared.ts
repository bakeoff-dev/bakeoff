import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TokenUsage } from '@contract';
import { exec } from '../exec';
import { runProcess } from '../process';
import { helpHasFlags, type DriverDoctor } from './types';

export const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0);
export const str = (v: unknown): string => (typeof v === 'string' ? v : '');
export const obj = (v: unknown): Record<string, unknown> =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

/** Parse one stream line. Anything that is not a JSON object is noise, not an event. */
export function jsonLine(line: string): Record<string, unknown> | null {
  const text = line.trim();
  if (text.length === 0 || !text.startsWith('{')) return null;
  try {
    const parsed: unknown = JSON.parse(text);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const ZERO_TOKENS: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };
export const ACTION_MAX = 100;

export function actionLabel(name: string, target: string): string {
  return `${name} ${target}`.trim().slice(0, ACTION_MAX);
}

export interface ProbeSpec {
  bin: string;
  installHint: string;
  requiredFlags: string[];
  /** `<bin> --help` by default; some CLIs put the real flags on a subcommand. */
  helpArgs?: string[];
  versionArgs?: string[];
  probeArgs: string[];
  probeEnv?: Record<string, string>;
  probeStdin?: string;
  /** Read the probe's stdout: did it reach the provider? A budget stop counts as yes. */
  probeOk: (stdout: string, code: number | null) => boolean;
  timeoutMs?: number;
}

const PROBE_TIMEOUT_MS = 90_000;
const BILLING_RE = /\b(402|429)\b|credits|quota|billing|insufficient|rate[ _-]?limit/i;
const NOTE_LINE_MAX = 120;

/**
 * The first probe output line that reads as a billing or quota refusal, trimmed for a
 * doctor note. A JSON line is reduced to its error message first, so the note quotes
 * what the provider said rather than the envelope around it.
 */
export function billingLine(output: string): string | null {
  for (const raw of output.split('\n')) {
    if (!BILLING_RE.test(raw)) continue;
    const o = jsonLine(raw);
    const text = (o ? str(obj(o.error).message) || str(o.message) || raw : raw).trim();
    return text.length > NOTE_LINE_MAX ? `${text.slice(0, NOTE_LINE_MAX - 3)}...` : text;
  }
  return null;
}

/**
 * Shared doctor: is the CLI installed, does it still have the flags we drive it with,
 * and does a real one-line request reach the provider?
 *
 * A probe that stops on a budget cap counts as authenticated -- being billed can only
 * happen after the handshake succeeded, so a spend limit is not a login problem.
 */
export async function probeDoctor(spec: ProbeSpec): Promise<DriverDoctor> {
  const v = await exec(spec.bin, spec.versionArgs ?? ['--version']);
  if (v.code !== 0) return { found: false, version: null, authOk: false, notes: [spec.installHint] };
  const version = (v.stdout.trim().split('\n')[0] ?? '').split(/\s+/).filter(Boolean).pop() ?? null;

  const help = await exec(spec.bin, spec.helpArgs ?? ['--help']);
  const missing = helpHasFlags(help.stdout + help.stderr, spec.requiredFlags);
  const notes = missing.length ? [`missing flags: ${missing.join(' ')}`] : [];

  const out: string[] = [];
  const err: string[] = [];
  const dir = mkdtempSync(join(tmpdir(), 'bakeoff-probe-'));
  let probe;
  try {
    probe = await runProcess({
      cmd: spec.bin,
      args: spec.probeArgs,
      cwd: dir,
      env: spec.probeEnv,
      timeoutMs: spec.timeoutMs ?? PROBE_TIMEOUT_MS,
      stdin: spec.probeStdin ?? '',
      onStdoutLine: (l) => out.push(l),
      onStderrLine: (l) => err.push(l),
    });
  } finally {
    // The probe writes session state into its cwd; leaving one per doctor run adds up.
    rmSync(dir, { recursive: true, force: true });
  }
  const authOk = probe.status === 'ok' && spec.probeOk(out.join('\n'), probe.exitCode);
  if (!authOk) {
    // A refusal for money is not a login problem; telling the user to log in sends them the wrong way.
    const billing = billingLine([...out, ...err].join('\n'));
    notes.push(
      probe.status === 'timeout'
        ? 'auth probe timed out'
        : billing
          ? `auth probe refused for billing or quota reasons: ${billing}`
          : `auth probe failed: run \`${spec.bin}\` once interactively to log in`,
    );
  }
  return { found: true, version, authOk: authOk && missing.length === 0, notes };
}
