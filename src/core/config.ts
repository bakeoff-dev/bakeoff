import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { z } from 'zod';
import type { Configured } from '@contract';
import { parseAgentSpecs } from './agentspec';
import { NAMES } from './names';

export function parseDuration(s: string): number {
  const m = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/.exec(s.trim());
  if (!m) throw new Error(`Invalid duration "${s}" (use e.g. 90s, 20m, 1h)`);
  const n = Number(m[1]);
  const unit = { ms: 1, s: 1000, m: 60_000, h: 3_600_000 }[m[2] as 'ms' | 's' | 'm' | 'h'];
  return Math.round(n * unit);
}

export const ConfigSchema = z
  .object({
    /** Install step, run in the baseline and in every agent worktree before it launches. */
    setup: z.string().optional(),
    test: z.string().optional(),
    lint: z.string().optional(),
    typecheck: z.string().optional(),
    test_paths: z.array(z.string()).optional(),
    // Each entry is `driver` or `driver:model`; validated by parseAgentSpecs in superRefine.
    agents: z.array(z.string()).min(1).default(['claude']),
    budget_usd: z.number().positive().default(3),
    timeout: z.string().default('20m'),
    max_turns: z.number().int().positive().optional(),
    ci_timeout: z.string().default('10m'),
    hidden_tests: z
      .object({
        source: z.string().default(`${NAMES.stateDir}/hidden`),
        dest: z.string(),
        command: z.string(),
      })
      .strict()
      .optional(),
    judge: z
      .object({
        enabled: z.boolean().default(false),
        model: z.string().default('claude-sonnet-5'),
      })
      .strict()
      .default({}),
  })
  .strict()
  .superRefine((c, ctx) => {
    if (!c.test && !c.lint && !c.typecheck) {
      ctx.addIssue({ code: 'custom', message: `${NAMES.configFile} needs at least one of: test, lint, typecheck` });
    }
    // `git cat-file -e <sha>:<path>` treats a glob as a literal name, so a pattern here
    // matches nothing and the paths it meant to cover go unrestored and unprotected --
    // silently. Auto-detection already covers test/, *.test.*, *_test.go and test_*.py.
    for (const [i, path] of (c.test_paths ?? []).entries()) {
      if (/[*?[\]]/.test(path)) {
        ctx.addIssue({
          code: 'custom',
          path: ['test_paths', i],
          message:
            `test_paths does not take globs: "${path}". List directories or files, ` +
            'or leave test_paths out and let Bakeoff detect them.',
        });
      }
    }
    try {
      parseAgentSpecs(c.agents);
    } catch (e) {
      ctx.addIssue({ code: 'custom', path: ['agents'], message: (e as Error).message });
    }
    for (const k of ['timeout', 'ci_timeout'] as const) {
      try {
        parseDuration(c[k]);
      } catch (e) {
        ctx.addIssue({ code: 'custom', path: [k], message: (e as Error).message });
      }
    }
  });
export type Config = z.infer<typeof ConfigSchema>;

export function parseConfig(text: string): Config {
  return ConfigSchema.parse(parseYaml(text) ?? {});
}

export function loadConfig(repoRoot: string): Config {
  const p = join(repoRoot, NAMES.configFile);
  if (!existsSync(p)) throw new Error(`No ${NAMES.configFile} in ${repoRoot}. Run \`${NAMES.bin} init\`.`);
  return parseConfig(readFileSync(p, 'utf8'));
}

export function configuredFlags(c: Config): Configured {
  return {
    test: !!c.test,
    lint: !!c.lint,
    typecheck: !!c.typecheck,
    hiddenTests: !!c.hidden_tests,
    ci: parseDuration(c.ci_timeout) > 0,
    judge: c.judge.enabled,
  };
}
