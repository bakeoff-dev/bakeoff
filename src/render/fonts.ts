import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

export const fontPaths = [
  join(here, 'fonts', 'Geist-Regular.ttf'),
  join(here, 'fonts', 'Geist-Bold.ttf'),
] as const;

export const fonts = () => [
  {
    name: 'Geist',
    data: readFileSync(fontPaths[0]),
    weight: 400 as const,
    style: 'normal' as const,
  },
  {
    name: 'Geist',
    data: readFileSync(fontPaths[1]),
    weight: 700 as const,
    style: 'normal' as const,
  },
];
