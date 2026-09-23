import { readFileSync } from 'node:fs';
import { assetPath } from './assets';

/** Resolved lazily: from source these sit in src/render/fonts, from dist in dist/fonts. */
export const fontPaths = (): [string, string] => [
  assetPath('fonts', 'Geist-Regular.ttf'),
  assetPath('fonts', 'Geist-Bold.ttf'),
];

export const fonts = () => {
  const [regular, bold] = fontPaths();
  return [
    { name: 'Geist', data: readFileSync(regular), weight: 400 as const, style: 'normal' as const },
    { name: 'Geist', data: readFileSync(bold), weight: 700 as const, style: 'normal' as const },
  ];
};
