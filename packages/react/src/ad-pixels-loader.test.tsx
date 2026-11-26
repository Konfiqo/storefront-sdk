// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://shop.test/"}
import { act, render } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import type { CookieInfo } from '@konfiqo/storefront-sdk';
import { firePixel, resetPixels } from './ad-pixels';
import { writeConsent } from './consent';
import { AdPixelsLoader } from './ad-pixels-loader';
import { ConsentProvider } from './consent-provider';

const COOKIES: CookieInfo[] = [
  { name: '_fbp', category: 'marketing', purpose: 'p', durationDays: 90 },
];
const PIXELS = { meta: { pixelId: '123456789012345' } };
const scripts = () => document.querySelectorAll('script[src]').length;

function ui(hostOnly?: boolean) {
  return (
    <ConsentProvider cookies={COOKIES} version="v1">
      <AdPixelsLoader pixels={PIXELS} hostOnly={hostOnly} pathname="/" />
    </ConsentProvider>
  );
}

beforeEach(() => {
  resetPixels();
  document.head.innerHTML = '';
  document.cookie = '_consent=; Max-Age=0; Path=/';
  document.cookie = '_fbp=; Max-Age=0; Path=/';
  localStorage.clear();
  delete (window as unknown as Record<string, unknown>).fbq;
});

describe('AdPixelsLoader', () => {
  it('loads nothing without a grant and reacts to a grant without reload', () => {
    render(ui());
    expect(scripts()).toBe(0);
    act(() => {
      writeConsent('v1', ['analytics']);
    });
    expect(scripts()).toBe(0);
    act(() => {
      writeConsent('v1', ['analytics', 'marketing']);
    });
    expect(scripts()).toBe(1);
  });

  it('a stored grant of another version loads nothing', () => {
    writeConsent('v0', ['marketing']);
    render(ui());
    expect(scripts()).toBe(0);
  });

  it('while the consent is not read yet (hydration) no cookie is cleared', () => {
    // An earlier page loaded the pixels under this grant.
    writeConsent('v1', ['analytics', 'marketing']);
    localStorage.setItem('px_granted', '1');
    document.cookie = '_fbp=fb.1.2.3; Path=/';
    const container = document.createElement('div');
    document.body.appendChild(container);
    render(ui(), { container, hydrate: true });
    expect(document.cookie).toContain('_fbp=fb.1.2.3');
    expect(scripts()).toBe(1);
  });

  it('a withdrawal on a default store domain clears on the host only', () => {
    writeConsent('v1', ['marketing']);
    render(ui(true));
    document.cookie = '_fbp=x; Path=/';
    act(() => {
      writeConsent('v1', []);
    });
    expect(document.cookie).not.toContain('_fbp');
  });

  it('reports a page view on every pathname change under a grant', () => {
    writeConsent('v1', ['marketing']);
    const fbq = (): unknown[][] =>
      (
        (window as unknown as Record<string, { queue: unknown[][] }>).fbq
          ?.queue ?? []
      ).filter((c) => c[0] === 'track' && c[1] === 'PageView');
    const el = (pathname: string) => (
      <ConsentProvider cookies={COOKIES} version="v1">
        <AdPixelsLoader pixels={PIXELS} pathname={pathname} />
      </ConsentProvider>
    );
    const { rerender } = render(el('/'));
    expect(fbq()).toHaveLength(1);
    rerender(el('/'));
    expect(fbq()).toHaveLength(1);
    rerender(el('/p/shirt'));
    expect(fbq()).toHaveLength(2);
  });

  it('passes its currency to the pixel events', () => {
    writeConsent('v1', ['marketing']);
    render(
      <ConsentProvider cookies={COOKIES} version="v1">
        <AdPixelsLoader pixels={PIXELS} pathname="/" currency="EUR" />
      </ConsentProvider>,
    );
    firePixel({ name: 'begin_checkout', valueMinor: 1000 });
    const queue = (window as unknown as Record<string, { queue: unknown[][] }>)
      .fbq!.queue;
    expect(queue.find((c) => c[1] === 'InitiateCheckout')).toEqual([
      'track',
      'InitiateCheckout',
      { value: 10, currency: 'EUR' },
    ]);
  });
});
