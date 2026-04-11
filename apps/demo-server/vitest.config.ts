import { defineConfig } from 'vitest/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const env = Object.fromEntries(
  readFileSync(resolve(__dirname, '../../.env'), 'utf-8')
    .split('\n')
    .filter(line => line && !line.startsWith('#') && line.includes('='))
    .map(line => {
      const i = line.indexOf('=');
      return [line.slice(0, i).trim(), line.slice(i + 1).trim()];
    })
);

export default defineConfig({
  test: {
    root: '../..',
    include: ['apps/demo-server/src/__tests__/**/*.test.ts'],
    reporter: 'verbose',
    setupFiles: [resolve(__dirname, 'vitest.setup.ts')],
    globalSetup: resolve(__dirname, 'vitest.globalSetup.ts'),
    env,
  },
});
