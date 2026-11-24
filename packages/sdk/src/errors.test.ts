import { describe, expect, it } from 'vitest';
import { StorefrontError, isStorefrontError } from './errors';

const BRAND = Symbol.for('@konfiqo/storefront-sdk/error');

describe('isStorefrontError', () => {
  it('accepts an error of this copy', () => {
    const e = new StorefrontError('timeout', 0, 'slow', { timeoutMs: 1 });
    expect(isStorefrontError(e)).toBe(true);
    expect((e as unknown as Record<symbol, unknown>)[BRAND]).toBe(true);
  });

  it('accepts an error from another copy of the SDK (same global brand)', () => {
    // A second installed copy has its own class, so `instanceof` fails.
    class OtherCopyError extends Error {
      readonly [BRAND] = true;
      readonly code = 'cart_not_found';
      readonly status = 404;
      readonly details = undefined;
    }
    const e = new OtherCopyError('gone');
    expect(e instanceof StorefrontError).toBe(false);
    expect(isStorefrontError(e)).toBe(true);
  });

  it('refuses look-alikes without the brand', () => {
    for (const v of [
      new Error('x'),
      { code: 'cart_not_found', status: 404 },
      { [BRAND]: false },
      { [Symbol('@konfiqo/storefront-sdk/error')]: true },
      null,
      undefined,
      'cart_not_found',
    ]) {
      expect(isStorefrontError(v)).toBe(false);
    }
  });
});
