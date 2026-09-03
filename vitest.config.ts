import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

export default defineConfig({
  resolve: { alias: { '@contract': fileURLToPath(new URL('./src/contract/index.ts', import.meta.url)) } },
  test: { include: ['test/**/*.test.ts', 'test/**/*.test.tsx'], testTimeout: 20000 },
});
