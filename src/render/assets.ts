import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/**
 * Where a build asset can be, in the order we trust.
 *
 * Bundled, this module is `dist/cli.js`, so `here` is `dist/` and assets sit beside it.
 * From source, `here` is `src/render/`, where the fonts live but `ui.html` does not --
 * that one is a build output either way. Checking both means the same code works from a
 * checkout and from an installed tarball, which is the only place packaging bugs show up.
 */
const ROOTS = [here, join(here, '..', '..', 'dist')];

export function assetPath(...segments: string[]): string {
  for (const root of ROOTS) {
    const candidate = join(root, ...segments);
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(`Missing build asset ${join(...segments)}; run \`npm run build\``);
}

/** The single-file UI, written by `build:ui`. */
export const uiHtmlPath = (): string => assetPath('ui.html');
