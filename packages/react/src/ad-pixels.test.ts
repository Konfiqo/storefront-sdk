// @vitest-environment jsdom
// @vitest-environment-options {"url":"https://shop.test/"}
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AdPixels } from '@konfiqo/storefront-sdk';
import { configurePixels, firePixel, resetPixels } from './ad-pixels';

const ALL: AdPixels = {
  meta: { pixelId: '123456789012345' },
  tiktok: { pixelId: 'C1ABCDEF' },
  google: {
    ga4Id: 'G-ABC123',
    adsId: 'AW-111',
    adsConversionLabel: 'lbl_9',
  },
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Win = Record<string, any>;
const w = () => window as unknown as Win;
const scripts = () =>
  Array.from(document.querySelectorAll('script[src]')).map((s) =>
    s.getAttribute('src'),
  );

/** Replaces the platform globals with spies (the stubs queue calls anyway). */
function spyGlobals() {
  const fbq = vi.fn();
  const ttq = {
    page: vi.fn(),
    track: vi.fn(),
    load: vi.fn(),
    disableCookie: vi.fn(),
  };
  w().fbq = fbq;
  w().ttq = ttq;
  w().gtag = vi.fn();
  return { fbq, ttq, gtag: w().gtag as ReturnType<typeof vi.fn> };
}

const PURCHASE = {
  name: 'purchase' as const,
  orderId: 'o1',
  valueMinor: 24990,
  items: [{ id: 'p1', quantity: 2, priceMinor: 12495 }],
};

/** Records every `document.cookie` write (the writes still happen). */
function recordCookieWrites(): string[] {
  const proto = Object.getPrototypeOf(document) as object;
  let desc = Object.getOwnPropertyDescriptor(proto, 'cookie');
  let owner = proto;
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

function clearAllCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]!.trim();
    if (name) document.cookie = `${name}=; Max-Age=0; Path=/`;
  }
}

/** A page load: module state forgotten, storage and cookies kept. */
const reload = () => resetPixels();

beforeEach(() => {
  delete (document as unknown as Win).cookie;
  clearAllCookies();
  resetPixels();
  document.head.innerHTML = '';
  localStorage.clear();
  delete w().fbq;
  delete w()._fbq;
  delete w().ttq;
  delete w().gtag;
  delete w().dataLayer;
});

describe('ad pixels', () => {
  it('no script before marketing consent', () => {
    configurePixels(ALL, false);
    firePixel({ name: 'page_view' });
    expect(scripts()).toEqual([]);
    expect(w().fbq).toBeUndefined();
    expect(w().gtag).toBeUndefined();
  });

  it('grant loads only enabled platforms', () => {
    configurePixels({ meta: { pixelId: '123456789012345' } }, true);
    expect(scripts()).toEqual([
      'https://connect.facebook.net/en_US/fbevents.js',
    ]);
    configurePixels({ meta: { pixelId: '123456789012345' } }, true);
    expect(scripts()).toHaveLength(1);
    resetPixels();
    document.head.innerHTML = '';
    configurePixels({ google: { ga4Id: 'G-ABC123' } }, true);
    expect(scripts()).toEqual([
      'https://www.googletagmanager.com/gtag/js?id=G-ABC123',
    ]);
  });

  it('purchase fires once per order with the order id as event id', () => {
    configurePixels(ALL, true);
    const { fbq, ttq, gtag } = spyGlobals();
    firePixel(PURCHASE);
    firePixel(PURCHASE);
    const meta = fbq.mock.calls.filter((c) => c[1] === 'Purchase');
    expect(meta).toHaveLength(1);
    expect(meta[0]).toEqual([
      'track',
      'Purchase',
      expect.objectContaining({
        value: 249.9,
        currency: 'TRY',
        content_ids: ['p1'],
      }),
      { eventID: 'o1' },
    ]);
    const tt = ttq.track.mock.calls.filter((c) => c[0] === 'CompletePayment');
    expect(tt).toHaveLength(1);
    expect(tt[0]![2]).toEqual({ event_id: 'o1' });
    const g = gtag.mock.calls.filter((c) => c[1] === 'purchase');
    expect(g).toHaveLength(1);
    expect(g[0]![2]).toMatchObject({
      transaction_id: 'o1',
      value: 249.9,
      currency: 'TRY',
      items: [{ item_id: 'p1', quantity: 2, price: 124.95 }],
    });
    expect(localStorage.getItem('px_purchase_o1')).not.toBeNull();
  });

  it('withdrawal stops firing', () => {
    configurePixels(ALL, true);
    const { fbq, ttq, gtag } = spyGlobals();
    document.cookie = '_fbp=x; Path=/';
    document.cookie = '_ga=y; Path=/';
    configurePixels(ALL, false);
    firePixel({ name: 'page_view' });
    firePixel(PURCHASE);
    expect(fbq).not.toHaveBeenCalledWith('track', expect.anything());
    expect(fbq).not.toHaveBeenCalledWith(
      'track',
      expect.anything(),
      expect.anything(),
      expect.anything(),
    );
    expect(ttq.page).not.toHaveBeenCalled();
    expect(gtag).not.toHaveBeenCalledWith('event', expect.anything());
    expect(gtag).not.toHaveBeenCalledWith(
      'event',
      'purchase',
      expect.anything(),
    );
    expect(localStorage.getItem('px_purchase_o1')).toBeNull();
    expect(document.cookie).not.toContain('_fbp');
    expect(document.cookie).not.toContain('_ga=');
    // A later grant resumes without loading the scripts again.
    const before = scripts().length;
    configurePixels(ALL, true);
    expect(scripts()).toHaveLength(before);
    firePixel({ name: 'page_view' });
    expect(fbq).toHaveBeenCalledWith('track', 'PageView');
  });

  it('ads conversion uses id and label', () => {
    configurePixels(ALL, true);
    const { gtag } = spyGlobals();
    firePixel(PURCHASE);
    expect(gtag).toHaveBeenCalledWith(
      'event',
      'conversion',
      expect.objectContaining({
        send_to: 'AW-111/lbl_9',
        value: 249.9,
        currency: 'TRY',
        transaction_id: 'o1',
      }),
    );
  });

  it('tiktok base code: load bookkeeping is set and early calls are queued', () => {
    configurePixels({ tiktok: { pixelId: 'C1ABCDEF' } }, true);
    const ttq = w().ttq;
    expect(ttq._i.C1ABCDEF).toHaveLength(0);
    expect(ttq._i.C1ABCDEF._u).toBe(
      'https://analytics.tiktok.com/i18n/pixel/events.js',
    );
    expect(typeof ttq._t.C1ABCDEF).toBe('number');
    expect(ttq._o.C1ABCDEF).toEqual({});
    firePixel({ name: 'page_view' });
    expect(ttq.slice(-1)).toEqual([['page']]);
    expect(scripts()).toEqual([
      'https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=C1ABCDEF&lib=ttq',
    ]);
  });

  it('withdrawal calls each platform opt-out', () => {
    configurePixels(ALL, true);
    const { fbq, ttq, gtag } = spyGlobals();
    configurePixels(ALL, false);
    expect(w()['ga-disable-G-ABC123']).toBe(true);
    expect(w()['ga-disable-AW-111']).toBe(true);
    expect(gtag).toHaveBeenCalledWith('consent', 'update', {
      ad_storage: 'denied',
      analytics_storage: 'denied',
      ad_user_data: 'denied',
      ad_personalization: 'denied',
    });
    expect(fbq).toHaveBeenCalledWith('consent', 'revoke');
    expect(ttq.disableCookie).toHaveBeenCalled();
    configurePixels(ALL, true);
    expect(w()['ga-disable-G-ABC123']).toBe(false);
    expect(fbq).toHaveBeenCalledWith('consent', 'grant');
  });

  it('google is configured host-only (cookie_domain = the host)', () => {
    configurePixels({ google: { ga4Id: 'G-ABC123', adsId: 'AW-111' } }, true);
    const configs = (w().dataLayer as IArguments[])
      .map((a) => Array.from(a))
      .filter((a) => a[0] === 'config');
    expect(configs).toEqual([
      [
        'config',
        'G-ABC123',
        { send_page_view: false, cookie_domain: 'shop.test' },
      ],
      [
        'config',
        'AW-111',
        { send_page_view: false, cookie_domain: 'shop.test' },
      ],
    ]);
    expect(
      (w().dataLayer as IArguments[]).map((a) => Array.from(a)),
    ).toContainEqual(['set', { cookie_domain: 'shop.test' }]);
  });

  it('a denied page with adPixels {} touches no cookies, even after an earlier grant', () => {
    configurePixels(ALL, true);
    reload();
    document.cookie = '_fbp=x; Path=/';
    document.cookie = '_ga=y; Path=/';
    const writes = recordCookieWrites();
    configurePixels({}, false);
    expect(writes).toEqual([]);
    expect(document.cookie).toContain('_fbp=x');
  });

  it('a denied page without the grant marker touches no cookies', () => {
    document.cookie = '_fbp=x; Path=/';
    document.cookie = '_ga=y; Path=/';
    const writes = recordCookieWrites();
    configurePixels(ALL, false);
    expect(writes).toEqual([]);
    expect(document.cookie).toContain('_fbp=x');
    expect(document.cookie).toContain('_ga=y');
  });

  it('a denied page after an earlier grant clears the configured platforms once and drops the marker', () => {
    configurePixels(ALL, true);
    reload();
    for (const c of [
      '_fbp=x',
      '_fbc=x',
      '_ttp=x',
      '_tt_enable_cookie=1',
      'ttcsid=x',
      'ttcsid_C1ABCDEF=x',
      '_ga=y',
      '_ga_ABC123=z',
      '_gcl_au=x',
      '_gcl_aw=x',
      'keep=1',
    ]) {
      document.cookie = `${c}; Path=/`;
    }
    configurePixels(ALL, false);
    expect(document.cookie).toBe('keep=1');
    // The marker is gone: the next denied page touches nothing.
    reload();
    document.cookie = '_fbp=again; Path=/';
    const writes = recordCookieWrites();
    configurePixels(ALL, false);
    expect(writes).toEqual([]);
  });

  it('only the platforms configured now are cleared', () => {
    configurePixels(ALL, true);
    reload();
    document.cookie = '_fbp=x; Path=/';
    document.cookie = '_ga=y; Path=/';
    configurePixels({ google: { ga4Id: 'G-ABC123' } }, false);
    expect(document.cookie).toBe('_fbp=x');
  });

  it('a withdrawal clears even without a marker, on the host and its registrable domain only', () => {
    configurePixels(ALL, true);
    localStorage.clear();
    document.cookie = '_fbp=x; Path=/';
    const writes = recordCookieWrites();
    configurePixels(ALL, false);
    expect(document.cookie).not.toContain('_fbp');
    const fbp = writes.filter((v) => v.startsWith('_fbp='));
    // shop.test is itself the registrable domain here (test is a suffix).
    expect(fbp).toEqual([
      '_fbp=; Max-Age=0; Path=/',
      '_fbp=; Max-Age=0; Path=/; Domain=shop.test',
    ]);
  });
});

describe('pages whose URL carries a buyer secret', () => {
  const at = (url: string) => history.replaceState(null, '', url);
  beforeEach(() => at('/'));

  it.each(['/orders/o1?token=tk', '/cart/recover?t=rt'])(
    'a grant on %s loads no script and sends nothing',
    (url) => {
      at(url);
      configurePixels(ALL, true);
      firePixel({ name: 'page_view' });
      expect(scripts()).toEqual([]);
      expect(w().fbq).toBeUndefined();
      expect(w().ttq).toBeUndefined();
      expect(w().gtag).toBeUndefined();
    },
  );

  it('scripts deferred on such a page load on the next page view elsewhere', () => {
    at('/orders/o1?token=tk');
    configurePixels(ALL, true);
    at('/');
    firePixel({ name: 'page_view' });
    expect(scripts()).toHaveLength(3);
  });

  it('pixels already loaded send nothing from the order page', () => {
    configurePixels(ALL, true);
    const { fbq, ttq, gtag } = spyGlobals();
    at('/orders/o1?token=tk');
    firePixel({ name: 'page_view' });
    firePixel(PURCHASE);
    expect(fbq).not.toHaveBeenCalled();
    expect(ttq.page).not.toHaveBeenCalled();
    expect(ttq.track).not.toHaveBeenCalled();
    expect(gtag).not.toHaveBeenCalled();
  });
});

it('meta does not track history changes itself (page views are sent explicitly)', () => {
  history.replaceState(null, '', '/');
  configurePixels({ meta: { pixelId: '123456789012345' } }, true);
  expect(w().fbq.disablePushState).toBe(true);
});

describe('pixel event ids follow the product feed rows', () => {
  it('meta view_item without a variant names the product group', () => {
    configurePixels(ALL, true);
    const { fbq } = spyGlobals();
    firePixel({ name: 'view_item', productId: 'p1', priceMinor: 1000 });
    expect(fbq).toHaveBeenCalledWith('track', 'ViewContent', {
      content_ids: ['p1'],
      content_type: 'product_group',
      value: 10,
      currency: 'TRY',
    });
  });

  it('meta view_item with a variant names the variant', () => {
    configurePixels(ALL, true);
    const { fbq } = spyGlobals();
    firePixel({
      name: 'view_item',
      productId: 'p1',
      variantId: 'v1',
      priceMinor: 1000,
    });
    expect(fbq).toHaveBeenCalledWith('track', 'ViewContent', {
      content_ids: ['v1'],
      content_type: 'product',
      value: 10,
      currency: 'TRY',
    });
  });

  it('meta add_to_cart sends the variant id', () => {
    configurePixels(ALL, true);
    const { fbq } = spyGlobals();
    firePixel({
      name: 'add_to_cart',
      productId: 'p1',
      variantId: 'v1',
      priceMinor: 1000,
      quantity: 2,
    });
    expect(fbq).toHaveBeenCalledWith('track', 'AddToCart', {
      content_ids: ['v1'],
      content_type: 'product',
      contents: [{ id: 'v1', quantity: 2, item_price: 10 }],
      value: 20,
      currency: 'TRY',
    });
  });

  it('tiktok uses the variant id when known, else the product group', () => {
    configurePixels(ALL, true);
    const { ttq } = spyGlobals();
    firePixel({ name: 'view_item', productId: 'p1', priceMinor: 1000 });
    firePixel({
      name: 'view_item',
      productId: 'p1',
      variantId: 'v1',
      priceMinor: 1000,
    });
    firePixel({
      name: 'add_to_cart',
      productId: 'p1',
      variantId: 'v2',
      priceMinor: 1000,
      quantity: 3,
    });
    const contents = ttq.track.mock.calls.map((c) => c[1].contents);
    expect(contents).toEqual([
      [
        {
          content_id: 'p1',
          content_type: 'product_group',
          quantity: 1,
          price: 10,
        },
      ],
      [{ content_id: 'v1', content_type: 'product', quantity: 1, price: 10 }],
      [{ content_id: 'v2', content_type: 'product', quantity: 3, price: 10 }],
    ]);
  });

  it('google uses the variant id when known, else the product id', () => {
    configurePixels(ALL, true);
    const { gtag } = spyGlobals();
    firePixel({ name: 'view_item', productId: 'p1', priceMinor: 1000 });
    firePixel({
      name: 'view_item',
      productId: 'p1',
      variantId: 'v1',
      priceMinor: 1000,
    });
    firePixel({
      name: 'add_to_cart',
      productId: 'p1',
      variantId: 'v2',
      priceMinor: 1000,
      quantity: 3,
    });
    const items = gtag.mock.calls
      .filter((c) => c[0] === 'event')
      .map((c) => c[2].items);
    expect(items).toEqual([
      [{ item_id: 'p1', quantity: 1, price: 10 }],
      [{ item_id: 'v1', quantity: 1, price: 10 }],
      [{ item_id: 'v2', quantity: 3, price: 10 }],
    ]);
  });

  it('purchase items carry the variant ids as the product', () => {
    configurePixels(ALL, true);
    const { fbq, ttq } = spyGlobals();
    firePixel({
      name: 'purchase',
      orderId: 'o2',
      valueMinor: 1000,
      items: [{ id: 'v1', quantity: 1, priceMinor: 1000 }],
    });
    expect(fbq).toHaveBeenCalledWith(
      'track',
      'Purchase',
      expect.objectContaining({
        content_ids: ['v1'],
        content_type: 'product',
        contents: [{ id: 'v1', quantity: 1, item_price: 10 }],
      }),
      { eventID: 'o2' },
    );
    expect(ttq.track.mock.calls[0]![1].contents).toEqual([
      { content_id: 'v1', content_type: 'product', quantity: 1, price: 10 },
    ]);
  });
});

describe('pixel currency', () => {
  const events = () => {
    firePixel({ name: 'view_item', productId: 'p1', priceMinor: 1000 });
    firePixel({
      name: 'add_to_cart',
      productId: 'p1',
      variantId: 'v1',
      priceMinor: 1000,
      quantity: 1,
    });
    firePixel({ name: 'begin_checkout', valueMinor: 1000 });
    firePixel({ ...PURCHASE, orderId: 'cur-' + Math.random() });
  };

  it('every platform event carries the configured currency', () => {
    configurePixels(ALL, true, { currency: 'EUR' });
    const { fbq, ttq, gtag } = spyGlobals();
    events();
    const meta = fbq.mock.calls.map((c) => c[2].currency);
    const tt = ttq.track.mock.calls.map((c) => c[1].currency);
    const g = gtag.mock.calls.map((c) => c[2].currency);
    expect(meta).toEqual(['EUR', 'EUR', 'EUR', 'EUR']);
    expect(tt).toEqual(['EUR', 'EUR', 'EUR', 'EUR']);
    // view_item, add_to_cart, begin_checkout, purchase, ads conversion
    expect(g).toEqual(['EUR', 'EUR', 'EUR', 'EUR', 'EUR']);
  });

  it('defaults to TRY', () => {
    configurePixels(ALL, true);
    const { fbq, ttq, gtag } = spyGlobals();
    events();
    expect(new Set(fbq.mock.calls.map((c) => c[2].currency))).toEqual(
      new Set(['TRY']),
    );
    expect(new Set(ttq.track.mock.calls.map((c) => c[1].currency))).toEqual(
      new Set(['TRY']),
    );
    expect(new Set(gtag.mock.calls.map((c) => c[2].currency))).toEqual(
      new Set(['TRY']),
    );
  });
});
