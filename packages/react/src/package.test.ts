// @vitest-environment node
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const pkg = JSON.parse(
  readFileSync(new URL('../package.json', import.meta.url), 'utf8'),
) as {
  version?: string;
  files?: string[];
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
};

describe('exports', () => {
  it('exposes the consent state and provider', async () => {
    const mod = await import('./index');
    expect(typeof mod.ConsentProvider).toBe('function');
    expect(typeof mod.useConsent).toBe('function');
    expect(mod.OPTIONAL_CATEGORIES).toEqual(['analytics', 'marketing']);
  });

  it('exposes store analytics and ad pixels', async () => {
    const mod = (await import('./index')) as Record<string, unknown>;
    for (const name of [
      'configureAnalytics',
      'track',
      'recordConsent',
      'AnalyticsTracker',
      'configurePixels',
      'firePixel',
      'pixelsForHost',
      'cookiesForHost',
      'onDefaultDomain',
      'AdPixelsLoader',
    ]) {
      expect(typeof mod[name], name).toBe('function');
    }
  });
});

describe('package.json', () => {
  it('takes the SDK as a peer, so the app and this package share one copy', () => {
    expect(pkg.dependencies?.['@konfiqo/storefront-sdk']).toBeUndefined();
    expect(pkg.peerDependencies?.['@konfiqo/storefront-sdk']).toBe('^0.6.0');
    expect(pkg.devDependencies?.['@konfiqo/storefront-sdk']).toBeDefined();
  });

  it('peers only on what the runtime code imports', () => {
    expect(Object.keys(pkg.peerDependencies ?? {}).sort()).toEqual([
      '@konfiqo/storefront-sdk',
      'react',
    ]);
  });

  it('is at 0.6.0 and ships only dist, README and LICENSE', () => {
    expect(pkg.version).toBe('0.6.0');
    expect(pkg.files).toEqual(['dist', 'README.md', 'LICENSE']);
  });
});
