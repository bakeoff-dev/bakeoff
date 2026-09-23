/**
 * Bundle the CLI for Node and stage the assets it reads at runtime.
 *
 * Externals are derived from `dependencies` rather than `--packages external`, which
 * externalises every non-relative specifier -- including the `@contract` path alias,
 * which is our own source and not a package. Node then fails to resolve it at startup,
 * which a source-tree smoke test never sees.
 *
 * Run: bun scripts/build-cli.ts
 */
import { cpSync, mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const OUT = 'dist/cli.js';
const pkg = JSON.parse(readFileSync('package.json', 'utf8')) as { dependencies?: Record<string, string> };
const externals = Object.keys(pkg.dependencies ?? {});

const args = [
  'build', 'src/cli/index.ts',
  '--target=node',
  '--outfile', OUT,
  ...externals.flatMap((name) => ['--external', name]),
];

const build = spawnSync('bun', args, { stdio: 'inherit' });
if (build.status !== 0) process.exit(build.status ?? 1);

mkdirSync('dist/fonts', { recursive: true });
cpSync('src/render/fonts', 'dist/fonts', { recursive: true });

// The two ways this bundle breaks only once it is installed, so fail the build instead.
const out = readFileSync(OUT, 'utf8');
const aliasLeak = /from\s*["']@contract["']|require\(["']@contract["']\)/.exec(out);
if (aliasLeak) {
  throw new Error('dist/cli.js imports "@contract", which Node cannot resolve; it must be bundled');
}
if (!out.includes('@resvg/resvg-js')) {
  throw new Error('dist/cli.js inlined @resvg/resvg-js; its native binary must stay external');
}
console.log(`built ${OUT} with ${externals.length} externals`);
