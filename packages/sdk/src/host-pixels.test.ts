import { describe, expect, it } from 'vitest';
import { cookiesForHost, onDefaultDomain, pixelsForHost } from './index';
import type { AdPixels, CookieInfo } from './models';

const ALL: AdPixels = {
  meta: { pixelId: '123456789012345' },
  tiktok: { pixelId: 'C1ABCDEF' },
  google: {
    ga4Id: 'G-ABC123',
    adsId: 'AW-111',
    adsConversionLabel: 'lbl_9',
  },
};

describe('pixels and cookies per host', () => {
  const COOKIES: CookieInfo[] = [
    {
      name: '_consent',
      category: 'necessary',
      purpose: 'p',
      durationDays: 365,
    },
    {
      name: '_fbp',
      category: 'marketing',
      purpose: 'p',
      durationDays: 90,
      customDomainOnly: true,
    },
    { name: '_ga', category: 'marketing', purpose: 'p', durationDays: 730 },
  ];

  it('a host under the default suffix is a default domain, case-insensitively', () => {
    expect(onDefaultDomain('acme.shopsuffix.com', 'shopsuffix.com')).toBe(true);
    expect(onDefaultDomain('ACME.ShopSuffix.com', 'shopsuffix.COM')).toBe(true);
    expect(onDefaultDomain('shopsuffix.com', 'shopsuffix.com')).toBe(true);
    expect(onDefaultDomain('shop.brand.com', 'shopsuffix.com')).toBe(false);
    expect(onDefaultDomain('notshopsuffix.com', 'shopsuffix.com')).toBe(false);
    expect(onDefaultDomain('acme.shopsuffix.com', undefined)).toBe(false);
  });

  it('on a default domain Meta and TikTok are dropped, Google stays', () => {
    expect(pixelsForHost(ALL, true)).toEqual({ google: ALL.google });
    expect(pixelsForHost(ALL, false)).toBe(ALL);
    expect(pixelsForHost(undefined, true)).toBeUndefined();
  });

  it('on a default domain customDomainOnly cookies are not listed', () => {
    expect(cookiesForHost(COOKIES, true).map((c) => c.name)).toEqual([
      '_consent',
      '_ga',
    ]);
    expect(cookiesForHost(COOKIES, false)).toBe(COOKIES);
    // nothing optional left: no consent needed at all
    expect(cookiesForHost(COOKIES.slice(0, 2), true)).toEqual([]);
  });
});
