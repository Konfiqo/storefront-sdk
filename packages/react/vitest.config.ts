import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@konfiqo/storefront-sdk': fileURLToPath(
        new URL('../sdk/src/index.ts', import.meta.url),
      ),
    },
  },
  test: {
    name: 'react',
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'jsdom',
    // `Secure` cookies are only stored on an https page.
    environmentOptions: { jsdom: { url: 'https://store.test/' } },
    // Node 25+ defines a global `localStorage` that shadows jsdom's unless
    // webstorage is switched off.
    poolOptions: {
      forks: { execArgv: ['--no-experimental-webstorage'] },
      threads: { execArgv: ['--no-experimental-webstorage'] },
    },
    setupFiles: ['./src/test-setup.ts'],
  },
});
