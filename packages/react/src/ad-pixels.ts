import type { AdPixels, CookieInfo } from '@konfiqo/storefront-sdk';

/**
 * What the pixel layer is told about; mapped onto each platform's events.
 *
 * Ids match the rows of the store's product feed, which are variants: a
 * known variant is sent as the item (`product`); a product page before a
 * variant is chosen sends the product id as the group (`product_group`).
 * `purchase` items carry variant ids.
 */
export type PixelEvent =
  | { name: 'page_view' }
  | {
      name: 'view_item';
      productId: string;
      /** The selected variant, when one is chosen. */
      variantId?: string;
      priceMinor: number;
    }
  | {
      name: 'add_to_cart';
      productId: string;
      variantId: string;
      priceMinor: number;
      quantity: number;
    }
  | { name: 'begin_checkout'; valueMinor: number }
  | {
      name: 'purchase';
      orderId: string;
      valueMinor: number;
      /** `id` is the variant id. */
      items: { id: string; quantity: number; priceMinor: number }[];
    };

type ContentType = 'product' | 'product_group';

/** The feed row an item event names: the variant when known, else the group. */
function itemOf(e: { productId: string; variantId?: string }): {
  id: string;
  type: ContentType;
} {
  return e.variantId
    ? { id: e.variantId, type: 'product' }
    : { id: e.productId, type: 'product_group' };
}

/** The store's currency (every price is in it). */
const CURRENCY = 'TRY';
const PURCHASE_KEY = 'px_purchase_';
/**
 * Set (per store host: localStorage is per origin) once pixels were loaded
 * under a grant; a later denied page clears their cookies once and drops it.
 */
const GRANT_MARKER_KEY = 'px_granted';

type Fn = (...args: unknown[]) => void;
type PixelWindow = Window & {
  fbq?: Fn;
  _fbq?: unknown;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ttq?: any;
  TiktokAnalyticsObject?: string;
  gtag?: Fn;
  dataLayer?: unknown[];
};

const win = (): PixelWindow => window as unknown as PixelWindow;

let pixels: AdPixels | undefined;
let granted = false;
/** Platforms whose script has been added (once per page load). */
const loaded = new Set<'meta' | 'tiktok' | 'google'>();

/** Test hook: forgets the configuration and what was loaded. */
export function resetPixels(): void {
  pixels = undefined;
  granted = false;
  optedOut = false;
  loaded.clear();
}

/** Major units (minor / 100). */
const major = (minor: number) => minor / 100;

function addScript(src: string): void {
  const el = document.createElement('script');
  el.async = true;
  el.src = src;
  document.head.appendChild(el);
}

function loadMeta(id: string): void {
  const w = win();
  if (!w.fbq) {
    // The standard stub: queues calls until fbevents.js takes over.
    const fbq = function (...args: unknown[]) {
      const f = fbq as unknown as {
        callMethod?: (...a: unknown[]) => void;
        queue: unknown[];
      };
      if (f.callMethod) f.callMethod(...args);
      else f.queue.push(args);
    };
    Object.assign(fbq, {
      push: fbq,
      loaded: true,
      version: '2.0',
      queue: [] as unknown[],
    });
    w.fbq = fbq;
    w._fbq = fbq;
  }
  // No automatic PageView on history changes: page views are sent by
  // `firePixel` (none on pages whose URL carries a buyer secret).
  (w.fbq as unknown as { disablePushState?: boolean }).disablePushState = true;
  addScript('https://connect.facebook.net/en_US/fbevents.js');
  w.fbq('init', id);
}

const TT_METHODS = [
  'page',
  'track',
  'identify',
  'instances',
  'debug',
  'on',
  'off',
  'once',
  'ready',
  'alias',
  'group',
  'enableCookie',
  'disableCookie',
  'holdConsent',
  'revokeConsent',
  'grantConsent',
];

/** TikTok's official base code (`ttq.load` bookkeeping `events.js` reads). */
function loadTikTok(id: string): void {
  const w = win();
  w.TiktokAnalyticsObject = 'ttq';
  type Queue = unknown[] & Record<string, unknown>;
  const ttq = (w.ttq = w.ttq ?? ([] as unknown)) as unknown as Queue & {
    methods: string[];
    setAndDefer: (t: Queue, m: string) => void;
    instance: (id: string) => Queue;
    load: (id: string, opts?: { partner?: string }) => void;
    _i: Record<string, Queue & { _u?: string }>;
    _t: Record<string, number>;
    _o: Record<string, unknown>;
  };
  ttq.methods = TT_METHODS;
  ttq.setAndDefer = (t, m) => {
    t[m] = (...args: unknown[]) => {
      t.push([m, ...args]);
    };
  };
  for (const m of ttq.methods) ttq.setAndDefer(ttq, m);
  ttq.instance = (name) => {
    const inst = ttq._i[name] ?? ([] as unknown as Queue);
    for (const m of ttq.methods) ttq.setAndDefer(inst, m);
    return inst;
  };
  ttq.load = (name, opts) => {
    const src = 'https://analytics.tiktok.com/i18n/pixel/events.js';
    ttq._i = ttq._i ?? {};
    ttq._i[name] = [] as unknown as Queue & { _u?: string };
    ttq._i[name]._u = src;
    ttq._t = ttq._t ?? {};
    ttq._t[name] = Date.now();
    ttq._o = ttq._o ?? {};
    ttq._o[name] = opts ?? {};
    addScript(`${src}?sdkid=${encodeURIComponent(name)}&lib=ttq`);
  };
  ttq.load(id);
}

function loadGoogle(g: NonNullable<AdPixels['google']>): void {
  const w = win();
  const ids = [g.ga4Id, g.adsId].filter((v): v is string => !!v);
  if (ids.length === 0) return;
  w.dataLayer = w.dataLayer ?? [];
  if (!w.gtag) {
    w.gtag = function () {
      // gtag.js reads `arguments` objects, not arrays.
      // eslint-disable-next-line prefer-rest-params
      w.dataLayer!.push(arguments);
    };
  }
  addScript(
    `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(ids[0]!)}`,
  );
  w.gtag('js', new Date());
  // Host-only cookies everywhere (GA4, Ads and the conversion linker): on a
  // default store domain the parent is shared by every store.
  const cookieDomain = location.hostname;
  w.gtag('set', { cookie_domain: cookieDomain });
  // Page views are sent by `firePixel`, once per route change.
  for (const id of ids) {
    w.gtag('config', id, {
      send_page_view: false,
      cookie_domain: cookieDomain,
    });
  }
}

/**
 * Whether this page's URL carries a buyer secret: the order page
 * (`/orders/{id}?token=…`) and the cart-recovery link (`/cart/recover?t=…`).
 * Platform scripts read the page URL and send it on, so pixels load nothing
 * and send nothing there; the server's events still report the purchase.
 * Same pages as the store analytics leaves out.
 */
export function onSecretPage(path: string = location.pathname): boolean {
  return path.startsWith('/orders/') || path.startsWith('/cart/recover');
}

/** Loads each enabled platform's script once, on the first grant. */
function loadAll(p: AdPixels): void {
  if (p.meta && !loaded.has('meta')) {
    loaded.add('meta');
    loadMeta(p.meta.pixelId);
  }
  if (p.tiktok && !loaded.has('tiktok')) {
    loaded.add('tiktok');
    loadTikTok(p.tiktok.pixelId);
  }
  if (p.google && !loaded.has('google')) {
    loaded.add('google');
    loadGoogle(p.google);
  }
}

type Platform = 'meta' | 'tiktok' | 'google';

/** Each platform's first-party cookies: exact names and name prefixes. */
const PLATFORM_COOKIES: Record<
  Platform,
  { names: string[]; prefixes: string[] }
> = {
  meta: { names: ['_fbp', '_fbc'], prefixes: [] },
  tiktok: {
    names: ['_ttp', '_tt_enable_cookie', 'ttcsid'],
    prefixes: ['ttcsid_'],
  },
  google: { names: ['_ga', '_gcl_au', '_gcl_aw'], prefixes: ['_ga_'] },
};

function platformsOf(p: AdPixels): Platform[] {
  return (['meta', 'tiktok', 'google'] as const).filter((k) => !!p[k]);
}

function readMarker(): boolean {
  try {
    return localStorage.getItem(GRANT_MARKER_KEY) !== null;
  } catch {
    return false;
  }
}

function writeMarker(on: boolean): void {
  try {
    if (on) localStorage.setItem(GRANT_MARKER_KEY, '1');
    else localStorage.removeItem(GRANT_MARKER_KEY);
  } catch {
    // Storage blocked: a later denied page simply clears nothing.
  }
}

const PROBE = '_px_probe';

/**
 * The registrable domain (eTLD+1) the libraries write to, found the way they
 * find it: the shortest parent of the host that accepts a cookie (browsers
 * refuse a public suffix). The host itself when none does.
 */
function registrableDomain(host: string): string {
  const parts = host.split('.');
  for (let i = parts.length - 2; i > 0; i--) {
    const candidate = parts.slice(i).join('.');
    document.cookie = `${PROBE}=1; Path=/; Domain=${candidate}`;
    if (document.cookie.split(';').some((c) => c.trim() === `${PROBE}=1`)) {
      document.cookie = `${PROBE}=; Max-Age=0; Path=/; Domain=${candidate}`;
      return candidate;
    }
  }
  return host;
}

/**
 * Deletes the cookies of the platforms configured in `p` that this page
 * sees, on the host (host-only and `Domain=host`) and, unless `onlyHost`,
 * on the registrable domain. Never on a public suffix or another parent.
 */
function clearCookies(p: AdPixels, onlyHost: boolean): void {
  try {
    const spec = platformsOf(p).map((k) => PLATFORM_COOKIES[k]);
    const present = document.cookie
      .split(';')
      .map((c) => c.split('=')[0]!.trim())
      .filter(Boolean);
    const names = present.filter((n) =>
      spec.some(
        (s) => s.names.includes(n) || s.prefixes.some((x) => n.startsWith(x)),
      ),
    );
    if (names.length === 0) return;
    const host = location.hostname;
    const domains: (string | undefined)[] = [undefined, host];
    if (!onlyHost && !/^[\d.]+$/.test(host) && !host.includes(':')) {
      const site = registrableDomain(host);
      if (site !== host) domains.push(site);
    }
    for (const name of names) {
      for (const domain of domains) {
        document.cookie = `${name}=; Max-Age=0; Path=/${domain ? `; Domain=${domain}` : ''}`;
      }
    }
  } catch {
    // Cookies may be blocked: nothing to delete.
  }
}

/** Whether the platforms were told to stop (undone by a later grant). */
let optedOut = false;

const GOOGLE_CONSENT = (v: 'granted' | 'denied') => ({
  ad_storage: v,
  analytics_storage: v,
  ad_user_data: v,
  ad_personalization: v,
});

function googleIds(g?: AdPixels['google']): string[] {
  return [g?.ga4Id, g?.adsId].filter((v): v is string => !!v);
}

/** Withdrawal: each loaded library's own opt-out (scripts stay in memory). */
function optOut(p: AdPixels): void {
  optedOut = true;
  const w = win() as unknown as Record<string, unknown>;
  for (const id of googleIds(p.google)) w[`ga-disable-${id}`] = true;
  if (loaded.has('google') && typeof w.gtag === 'function') {
    (w.gtag as Fn)('consent', 'update', GOOGLE_CONSENT('denied'));
  }
  if (loaded.has('meta') && typeof w.fbq === 'function') {
    (w.fbq as Fn)('consent', 'revoke');
  }
  const ttq = w.ttq as Record<string, unknown> | undefined;
  if (loaded.has('tiktok') && typeof ttq?.disableCookie === 'function') {
    (ttq.disableCookie as Fn)();
  }
}

/** A later grant after a withdrawal: undo {@link optOut}. */
function optIn(p: AdPixels): void {
  optedOut = false;
  const w = win() as unknown as Record<string, unknown>;
  for (const id of googleIds(p.google)) w[`ga-disable-${id}`] = false;
  if (loaded.has('google') && typeof w.gtag === 'function') {
    (w.gtag as Fn)('consent', 'update', GOOGLE_CONSENT('granted'));
  }
  if (loaded.has('meta') && typeof w.fbq === 'function') {
    (w.fbq as Fn)('consent', 'grant');
  }
  const ttq = w.ttq as Record<string, unknown> | undefined;
  if (loaded.has('tiktok') && typeof ttq?.enableCookie === 'function') {
    (ttq.enableCookie as Fn)();
  }
}

/**
 * Sets the store's pixels and whether the shopper granted `marketing`.
 * Scripts load once, on the first grant. Platform cookies are deleted only
 * on a withdrawal on this page, or on a denied page when this browser
 * loaded the store's pixels under an earlier grant (the marker), and only
 * those of the platforms configured. `hostOnly` (a default store domain)
 * keeps the deletion to the host.
 */
export function configurePixels(
  next: AdPixels | undefined,
  isGranted: boolean,
  opts: { hostOnly?: boolean } = {},
): void {
  try {
    pixels = next;
    const was = granted;
    granted = isGranted && !!next;
    if (granted && next) {
      if (optedOut) optIn(next);
      // On a secret page the scripts wait for the next page view elsewhere.
      if (!onSecretPage()) loadAll(next);
      if (platformsOf(next).length > 0) writeMarker(true);
    } else if (next) {
      // Live libraries are told to stop.
      if (was) optOut(next);
      if (was || readMarker()) {
        clearCookies(next, opts.hostOnly ?? false);
        writeMarker(false);
      }
    }
  } catch {
    // Pixels must never break the page.
  }
}

/** Whether `host` is a default store domain (`suffix` or below it). */
export function onDefaultDomain(
  host: string,
  suffix: string | undefined,
): boolean {
  if (!suffix) return false;
  const h = host.toLowerCase();
  const s = suffix.toLowerCase();
  return h === s || h.endsWith(`.${s}`);
}

/**
 * The pixels a host may load: Meta and TikTok write their cookies to the
 * registrable domain, which every default store domain shares, so they run
 * only on custom domains.
 */
export function pixelsForHost(
  p: AdPixels | undefined,
  defaultDomain: boolean,
): AdPixels | undefined {
  if (!p || !defaultDomain) return p;
  return p.google ? { google: p.google } : {};
}

/**
 * The cookies a host lists: on a default domain without the
 * `customDomainOnly` ones, and none at all when no optional cookie is left.
 */
export function cookiesForHost(
  cookies: CookieInfo[],
  defaultDomain: boolean,
): CookieInfo[] {
  if (!defaultDomain) return cookies;
  const kept = cookies.filter((c) => !c.customDomainOnly);
  return kept.some((c) => c.category !== 'necessary') ? kept : [];
}

/** Whether `firePixel` would reach the platforms now. */
export function pixelsActive(): boolean {
  return granted && !!pixels;
}

/** Whether this browser already reported the purchase. */
function purchased(orderId: string): boolean {
  try {
    return localStorage.getItem(PURCHASE_KEY + orderId) !== null;
  } catch {
    return false;
  }
}

function markPurchased(orderId: string): void {
  try {
    localStorage.setItem(PURCHASE_KEY + orderId, '1');
  } catch {
    // Storage blocked: the server's event id still dedupes.
  }
}

/** Reports `e` to every enabled platform; a no-op without a grant. */
export function firePixel(e: PixelEvent): void {
  try {
    if (!granted || !pixels || onSecretPage()) return;
    loadAll(pixels);
    if (e.name === 'purchase') {
      if (purchased(e.orderId)) return;
      markPurchased(e.orderId);
    }
    const w = win();
    if (pixels.meta && w.fbq) meta(w.fbq, e);
    if (pixels.tiktok && w.ttq) tiktok(w.ttq, e);
    if (pixels.google && w.gtag) google(w.gtag, pixels.google, e);
  } catch {
    // Pixels must never break the page.
  }
}

function meta(fbq: Fn, e: PixelEvent): void {
  switch (e.name) {
    case 'page_view':
      fbq('track', 'PageView');
      return;
    case 'view_item': {
      const it = itemOf(e);
      fbq('track', 'ViewContent', {
        content_ids: [it.id],
        content_type: it.type,
        value: major(e.priceMinor),
        currency: CURRENCY,
      });
      return;
    }
    case 'add_to_cart':
      fbq('track', 'AddToCart', {
        content_ids: [e.variantId],
        content_type: 'product',
        contents: [
          {
            id: e.variantId,
            quantity: e.quantity,
            item_price: major(e.priceMinor),
          },
        ],
        value: major(e.priceMinor * e.quantity),
        currency: CURRENCY,
      });
      return;
    case 'begin_checkout':
      fbq('track', 'InitiateCheckout', {
        value: major(e.valueMinor),
        currency: CURRENCY,
      });
      return;
    case 'purchase':
      fbq(
        'track',
        'Purchase',
        {
          content_ids: e.items.map((i) => i.id),
          content_type: 'product',
          contents: e.items.map((i) => ({
            id: i.id,
            quantity: i.quantity,
            item_price: major(i.priceMinor),
          })),
          value: major(e.valueMinor),
          currency: CURRENCY,
        },
        { eventID: e.orderId },
      );
  }
}

function tiktok(ttq: NonNullable<PixelWindow['ttq']>, e: PixelEvent): void {
  const content = (
    id: string,
    quantity: number,
    priceMinor: number,
    type: ContentType = 'product',
  ) => ({
    content_id: id,
    content_type: type,
    quantity,
    price: major(priceMinor),
  });
  switch (e.name) {
    case 'page_view':
      ttq.page!();
      return;
    case 'view_item': {
      const it = itemOf(e);
      ttq.track!('ViewContent', {
        contents: [content(it.id, 1, e.priceMinor, it.type)],
        value: major(e.priceMinor),
        currency: CURRENCY,
      });
      return;
    }
    case 'add_to_cart':
      ttq.track!('AddToCart', {
        contents: [content(e.variantId, e.quantity, e.priceMinor)],
        value: major(e.priceMinor * e.quantity),
        currency: CURRENCY,
      });
      return;
    case 'begin_checkout':
      ttq.track!('InitiateCheckout', {
        value: major(e.valueMinor),
        currency: CURRENCY,
      });
      return;
    case 'purchase':
      ttq.track!(
        'CompletePayment',
        {
          contents: e.items.map((i) => content(i.id, i.quantity, i.priceMinor)),
          value: major(e.valueMinor),
          currency: CURRENCY,
        },
        { event_id: e.orderId },
      );
  }
}

function google(
  gtag: Fn,
  g: NonNullable<AdPixels['google']>,
  e: PixelEvent,
): void {
  const item = (id: string, quantity: number, priceMinor: number) => ({
    item_id: id,
    quantity,
    price: major(priceMinor),
  });
  switch (e.name) {
    case 'page_view':
      gtag('event', 'page_view');
      return;
    case 'view_item':
      gtag('event', 'view_item', {
        currency: CURRENCY,
        value: major(e.priceMinor),
        items: [item(itemOf(e).id, 1, e.priceMinor)],
      });
      return;
    case 'add_to_cart':
      gtag('event', 'add_to_cart', {
        currency: CURRENCY,
        value: major(e.priceMinor * e.quantity),
        items: [item(e.variantId, e.quantity, e.priceMinor)],
      });
      return;
    case 'begin_checkout':
      gtag('event', 'begin_checkout', {
        currency: CURRENCY,
        value: major(e.valueMinor),
      });
      return;
    case 'purchase':
      gtag('event', 'purchase', {
        transaction_id: e.orderId,
        currency: CURRENCY,
        value: major(e.valueMinor),
        items: e.items.map((i) => item(i.id, i.quantity, i.priceMinor)),
      });
      if (g.adsId && g.adsConversionLabel) {
        gtag('event', 'conversion', {
          send_to: `${g.adsId}/${g.adsConversionLabel}`,
          value: major(e.valueMinor),
          currency: CURRENCY,
          transaction_id: e.orderId,
        });
      }
  }
}
