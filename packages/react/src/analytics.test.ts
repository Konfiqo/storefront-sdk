// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureAnalytics,
  recordConsent,
  resetAnalytics,
  track,
} from './analytics';

const fetchMock = vi.fn();

/** Lets queued microtasks (the batch flush) run. */
const tick = () => new Promise((r) => setTimeout(r, 0));

function body(call = 0) {
  return JSON.parse(fetchMock.mock.calls[call]![1].body);
}

beforeEach(() => {
  fetchMock.mockReset().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  resetAnalytics();
  sessionStorage.clear();
  window.history.replaceState(null, '', '/');
  configureAnalytics({ baseUrl: '/api', publishableKey: 'pk_test' });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('track', () => {
  it('first event carries query and referrer, later ones only the path', async () => {
    window.history.replaceState(null, '', '/p/shirt?utm_source=ad');
    vi.spyOn(document, 'referrer', 'get').mockReturnValue('https://x.test/');
    track('page_view');
    await tick();
    track('product_view', { productId: 'p1' });
    await tick();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe('/api/v1/events');
    expect(init.method).toBe('POST');
    expect(init.keepalive).toBe(true);
    expect(init.headers).toEqual({
      'content-type': 'application/json',
      'x-konfiqo-publishable-key': 'pk_test',
    });
    expect(body(0).events).toEqual([
      {
        type: 'page_view',
        url: '/p/shirt?utm_source=ad',
        referrer: 'https://x.test',
      },
    ]);
    expect(body(1).events).toEqual([
      {
        type: 'product_view',
        url: '/p/shirt',
        referrer: null,
        productId: 'p1',
      },
    ]);
  });

  it('consent flag is false', async () => {
    track('page_view');
    await tick();
    expect(body().consent).toEqual({ analytics: false });
  });

  it('preview flag silences every event', async () => {
    window.history.replaceState(null, '', '/?_preview=1');
    track('page_view');
    window.history.replaceState(null, '', '/p/shirt');
    track('product_view', { productId: 'p1' });
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(sessionStorage.getItem('_preview')).toBe('1');
  });

  it('_preview=1 counts only on the landing URL', async () => {
    track('page_view');
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);

    window.history.replaceState(null, '', '/p/shirt?_preview=1');
    track('page_view');
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(sessionStorage.getItem('_preview')).toBeNull();
  });

  it('network error is swallowed', async () => {
    const rejected = Promise.reject(new Error('offline'));
    const handled = vi.spyOn(rejected, 'catch');
    fetchMock.mockReturnValue(rejected);
    expect(() => track('page_view')).not.toThrow();
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    // The rejection is consumed by the internal catch, so nothing is left
    // for the runtime to report as unhandled.
    expect(handled).toHaveBeenCalledTimes(1);
    await expect(handled.mock.results[0]!.value).resolves.toBeUndefined();
  });

  it('query keeps only campaign and click-id params', async () => {
    window.history.replaceState(
      null,
      '',
      '/p/shirt?token=secret&utm_source=ad&email=a%40b.c&gclid=g1&utm_term=x',
    );
    track('page_view');
    await tick();
    expect(body().events[0].url).toBe(
      '/p/shirt?utm_source=ad&gclid=g1&utm_term=x',
    );

    resetAnalytics();
    configureAnalytics({ baseUrl: '/api', publishableKey: 'pk_test' });
    window.history.replaceState(null, '', '/p/shirt?token=secret');
    track('page_view');
    await tick();
    expect(body(1).events[0].url).toBe('/p/shirt');
  });

  it('order and recover pages send no query', async () => {
    window.history.replaceState(
      null,
      '',
      '/orders/o1?token=secret&utm_source=ad',
    );
    track('page_view');
    await tick();
    expect(body().events[0].url).toBe('/orders/:id');

    resetAnalytics();
    configureAnalytics({ baseUrl: '/api', publishableKey: 'pk_test' });
    window.history.replaceState(
      null,
      '',
      '/cart/recover?token=secret&utm_source=ad',
    );
    track('page_view');
    await tick();
    expect(body(1).events[0].url).toBe('/cart/recover');
  });

  it('referrer is reduced to its origin', async () => {
    const ref = vi.spyOn(document, 'referrer', 'get');
    ref.mockReturnValue('https://x.test/orders/o1?token=secret');
    track('page_view');
    await tick();
    expect(body().events[0].referrer).toBe('https://x.test');

    resetAnalytics();
    configureAnalytics({ baseUrl: '/api', publishableKey: 'pk_test' });
    ref.mockReturnValue('not a url');
    track('page_view');
    await tick();
    expect(body(1).events[0].referrer).toBeNull();
  });

  it('url is capped at 2000 characters', async () => {
    window.history.replaceState(null, '', `/p/${'a'.repeat(3000)}`);
    track('page_view');
    await tick();
    expect(body().events[0].url.length).toBe(2000);
  });

  it('order id is redacted from the path', async () => {
    window.history.replaceState(null, '', '/orders/o-123/receipt');
    track('page_view');
    track('product_view', { productId: 'p1' });
    await tick();
    expect(body().events.map((e: { url: string }) => e.url)).toEqual([
      '/orders/:id',
      '/orders/:id',
    ]);
  });

  it('cart id is never sent', async () => {
    track('add_to_cart', { productId: 'p1', cartId: 'secret-cart' } as never);
    await tick();
    expect(fetchMock.mock.calls[0]![1].body).not.toContain('secret-cart');
    expect(body().events[0].productId).toBe('p1');
  });

  it('same-tick events go in one request in call order', async () => {
    track('page_view');
    track('product_view', { productId: 'p1' });
    track('add_to_cart', { productId: 'p1' });
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body().events.map((e: { type: string }) => e.type)).toEqual([
      'page_view',
      'product_view',
      'add_to_cart',
    ]);
    // The next tick is a new request.
    track('page_view');
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(1).events).toHaveLength(1);
  });

  it('first event in the batch carries the landing query', async () => {
    window.history.replaceState(null, '', '/p/shirt?utm_source=ad&token=x');
    vi.spyOn(document, 'referrer', 'get').mockReturnValue(
      'https://l.instagram.com/path?q=1',
    );
    track('page_view');
    track('product_view', { productId: 'p1' });
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(body().events).toEqual([
      {
        type: 'page_view',
        url: '/p/shirt?utm_source=ad',
        referrer: 'https://l.instagram.com',
      },
      {
        type: 'product_view',
        url: '/p/shirt',
        referrer: null,
        productId: 'p1',
      },
    ]);
  });

  it('more than 20 same-tick events go in requests of at most 20', async () => {
    for (let i = 0; i < 25; i++) track('product_view', { productId: 'p1' });
    await tick();
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(body(0).events).toHaveLength(20);
    expect(body(1).events).toHaveLength(5);
  });

  it('an identical page_view in the same tick is sent once', async () => {
    track('page_view');
    track('page_view');
    await tick();
    expect(body().events).toHaveLength(1);

    // A different path, or a later tick, is a new view.
    track('page_view');
    window.history.replaceState(null, '', '/p/shirt');
    track('page_view');
    await tick();
    expect(body(1).events).toHaveLength(2);
    track('page_view');
    await tick();
    expect(body(2).events).toHaveLength(1);
  });

  it('does nothing before it is configured', async () => {
    resetAnalytics();
    track('page_view');
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('recordConsent and the landing', () => {
  const decision = {
    consentId: 'a'.repeat(32),
    granted: [] as [],
    version: 'v1',
  };
  const eventCalls = () =>
    fetchMock.mock.calls.filter(([url]) => url === '/api/v1/events');

  it("a decision before any track() does not change the first event's landing query", async () => {
    window.history.replaceState(null, '', '/?utm_source=ad');
    recordConsent(decision);
    track('page_view');
    await tick();
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/v1/consents');
    expect(JSON.parse(eventCalls()[0]![1].body).events[0].url).toBe(
      '/?utm_source=ad',
    );
  });

  it('a decision before any track() leaves the landing preview check to track()', async () => {
    recordConsent(decision);
    // The URL the first event reads is the landing; the decision is not.
    window.history.replaceState(null, '', '/?_preview=1');
    track('page_view');
    await tick();
    expect(eventCalls()).toHaveLength(0);
    expect(sessionStorage.getItem('_preview')).toBe('1');
  });

  it('a decision in a preview tab is not recorded, landing read or not', async () => {
    window.history.replaceState(null, '', '/?_preview=1');
    recordConsent(decision);
    track('page_view');
    recordConsent(decision);
    await tick();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
