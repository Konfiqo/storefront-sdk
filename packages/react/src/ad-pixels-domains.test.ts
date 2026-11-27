// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://www.brand.com.tr/"}
import { beforeEach, describe, expect, it } from 'vitest';
import type { AdPixels } from '@konfiqo/storefront-sdk';
import { configurePixels, resetPixels } from './ad-pixels';

const META: AdPixels = { meta: { pixelId: '123456789012345' } };

/** Records every `document.cookie` write (the writes still happen). */
function recordCookieWrites(): string[] {
  let owner = Object.getPrototypeOf(document) as object;
  let desc = Object.getOwnPropertyDescriptor(owner, 'cookie');
  while (!desc) {
    owner = Object.getPrototypeOf(owner) as object;
    desc = Object.getOwnPropertyDescriptor(owner, 'cookie');
  }
  const writes: string[] = [];
  Object.defineProperty(document, 'cookie', {
    configurable: true,
    get: () => desc!.get!.call(document),
    set: (v: string) => {
      writes.push(v);
      desc!.set!.call(document, v);
    },
  });
  return writes;
}

beforeEach(() => {
  delete (document as unknown as Record<string, unknown>).cookie;
  resetPixels();
  localStorage.clear();
});

describe('ad pixel cookie clearing domains', () => {
  it('clears on the host and the registrable domain, never the public suffix', () => {
    configurePixels(META, true);
    document.cookie = '_fbp=x; Path=/; Domain=brand.com.tr';
    const writes = recordCookieWrites();
    configurePixels(META, false);
    expect(document.cookie).not.toContain('_fbp');
    const deletes = writes.filter((v) => v.startsWith('_fbp='));
    expect(deletes).toEqual([
      '_fbp=; Max-Age=0; Path=/',
      '_fbp=; Max-Age=0; Path=/; Domain=www.brand.com.tr',
      '_fbp=; Max-Age=0; Path=/; Domain=brand.com.tr',
    ]);
    // Only the domain probe (refused by the browser) may name the suffix.
    expect(
      writes.filter((v) => !v.startsWith('_px_probe=')).join('\n'),
    ).not.toMatch(/Domain=\.?com\.tr(;|$)/m);
    expect(document.cookie).not.toContain('_px_probe');
  });

  it('host-only mode (default store domain) clears on the host only', () => {
    configurePixels({ google: { ga4Id: 'G-ABC123' } }, true, {
      hostOnly: true,
    });
    document.cookie = '_ga=y; Path=/';
    const writes = recordCookieWrites();
    configurePixels({ google: { ga4Id: 'G-ABC123' } }, false, {
      hostOnly: true,
    });
    expect(document.cookie).not.toContain('_ga');
    expect(writes).toEqual([
      '_ga=; Max-Age=0; Path=/',
      '_ga=; Max-Age=0; Path=/; Domain=www.brand.com.tr',
    ]);
  });
});
