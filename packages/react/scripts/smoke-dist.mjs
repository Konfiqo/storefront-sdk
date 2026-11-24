// Post-build check: the built package loads by name through its `exports`
// map (ESM + CJS) in plain Node, is marked as client code for React Server
// Components, and its type declarations reference the SDK by package name
// only — never the SDK's source files.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const esm = await import('@konfiqo/storefront-react');
const cjs = require('@konfiqo/storefront-react');
for (const [name, mod] of [
  ['esm', esm],
  ['cjs', cjs],
]) {
  for (const fn of [
    'StorefrontProvider',
    'useCart',
    'useCheckout',
    'useOrder',
    'PaymentForm',
  ]) {
    assert.ok(mod[fn], `${name}: ${fn}`);
  }
}

const dist = new URL('../dist/', import.meta.url);
for (const file of ['index.js', 'index.cjs']) {
  const code = readFileSync(new URL(file, dist), 'utf8');
  assert.match(
    code,
    /^(['"]use strict['"];\s*)?['"]use client['"];/,
    `${file}: 'use client' must be in the directive prologue`,
  );
}
for (const file of ['index.d.ts', 'index.d.cts']) {
  const dts = readFileSync(new URL(file, dist), 'utf8');
  const specifiers = [...dts.matchAll(/from ['"]([^'"]+)['"]/g)].map(
    (m) => m[1],
  );
  for (const s of specifiers) {
    assert.ok(
      s === 'react' || s === '@konfiqo/storefront-sdk',
      `${file}: unexpected import ${s}`,
    );
  }
  assert.ok(!/sdk\/src|\.\.\//.test(dts), `${file}: references SDK sources`);
}
console.log('react dist smoke: esm + cjs + d.ts ok');
