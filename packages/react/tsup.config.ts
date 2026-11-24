import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  // The SDK stays an import (never inlined) in both the code and the
  // `.d.ts`, so consumers get its published types, not its sources.
  dts: { resolve: false },
  clean: true,
  sourcemap: true,
  target: 'es2022',
  external: [
    'react',
    'react-dom',
    'react/jsx-runtime',
    '@konfiqo/storefront-sdk',
    '@markdoc/markdoc',
  ],
});
