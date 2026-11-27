// Post-build smoke test (Review Focus 5): loads the built package through
// its own `exports` map — ESM `import` and CJS `require` — in plain Node
// (no `window`) and exercises the client.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';

assert.equal(typeof window, 'undefined');
const HASH = 'c'.repeat(64);
const require = createRequire(import.meta.url);
const esm = await import('@konfiqo/storefront-sdk');
const cjs = require('@konfiqo/storefront-sdk');

for (const [name, sdk] of [
  ['esm', esm],
  ['cjs', cjs],
]) {
  for (const fn of [
    'createStorefrontClient',
    'mountPayment',
    'formatMoney',
    'loadCartId',
    'isStorefrontError',
    'pixelsForHost',
    'cookiesForHost',
    'onDefaultDomain',
  ]) {
    assert.equal(typeof sdk[fn], 'function', `${name}: ${fn}`);
  }
  const client = sdk.createStorefrontClient({
    baseUrl: 'https://api.test',
    publishableKey: 'pk_live_x',
    trustedStorefrontKey: 'sk',
    buyerIp: '1.2.3.4',
    fetch: async (url) =>
      String(url).endsWith('/agreements')
        ? new Response(
            JSON.stringify({
              orderNumber: 'S-1',
              documents: [],
              agreementsHash: HASH,
            }),
            { status: 200 },
          )
        : new Response(
            JSON.stringify({
              statusCode: 409,
              error: 'out_of_stock',
              message: 'm',
              variantIds: ['v'],
            }),
            {
              status: 409,
            },
          ),
  });
  // The agreements call, then checkout with its hash (the contract).
  const agreements = await client.carts.agreements('c1');
  assert.equal(agreements.agreementsHash, HASH, `${name}: agreements`);
  // Checkout without the hash is refused before any request.
  await assert.rejects(client.carts.checkout('c1'), (e) => {
    assert.ok(e instanceof sdk.StorefrontError, `${name}: no-hash error`);
    assert.equal(e.code, 'invalid_request');
    return true;
  });
  await assert.rejects(
    client.carts.checkout('c1', { agreementsHash: agreements.agreementsHash }),
    (e) => {
      assert.ok(e instanceof sdk.StorefrontError, `${name}: StorefrontError`);
      assert.deepEqual(e.details, { variantIds: ['v'] });
      return true;
    },
  );
  assert.equal(sdk.formatMoney(14990, 'TRY', 'tr-TR'), '₺149,90');
}

// The SDK is server-safe: no 'use client' directive, so React Server
// Components can call its helpers (for example `pixelsForHost`) directly.
for (const file of ['index.js', 'index.cjs']) {
  const code = readFileSync(
    new URL(`../dist/${file}`, import.meta.url),
    'utf8',
  );
  assert.doesNotMatch(
    code,
    /['"]use client['"]/,
    `${file}: the SDK must not be marked as client code`,
  );
}
console.log('sdk dist smoke: esm + cjs ok');
