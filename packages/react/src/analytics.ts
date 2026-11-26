import { analyticsConsent, type ConsentRecord } from './consent';

/** The events the store reports to commerce. */
export type AnalyticsEventType =
  'page_view' | 'product_view' | 'add_to_cart' | 'checkout_start';

/** Optional ids that go with an event. */
export interface AnalyticsExtra {
  productId?: string;
}

/** Query parameters that may leave the browser: campaign tags and click ids. */
const QUERY_ALLOWLIST = [
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'fbclid',
  'ttclid',
  'gclid',
  'gbraid',
  'wbraid',
];
const MAX_URL = 2000;
/** Events per request at most (the commerce limit). */
const MAX_BATCH = 20;

/** The path with ids of token-bearing pages (order status) redacted. */
function safePath(): string {
  const path = location.pathname;
  return path.startsWith('/orders/') ? '/orders/:id' : path;
}

/** The allowlisted query of the landing URL; none on token-bearing pages. */
function safeQuery(): string {
  const path = location.pathname;
  if (path.startsWith('/orders/') || path.startsWith('/cart/recover'))
    return '';
  const source = new URLSearchParams(location.search);
  const kept = new URLSearchParams();
  for (const [key, value] of source) {
    if (QUERY_ALLOWLIST.includes(key)) kept.append(key, value);
  }
  const query = kept.toString();
  return query ? `?${query}` : '';
}

/** The referrer reduced to its origin; null when absent or unparsable. */
function referrerOrigin(): string | null {
  try {
    return document.referrer ? new URL(document.referrer).origin : null;
  } catch {
    return null;
  }
}

interface AnalyticsConfig {
  baseUrl: string;
  publishableKey: string;
}

const PREVIEW_KEY = '_preview';

interface QueuedEvent {
  type: AnalyticsEventType;
  url: string;
  referrer: string | null;
  productId?: string;
}

let config: AnalyticsConfig | null = null;
let first = true;
/** Whether the landing URL has been checked for `_preview=1`. */
let landingChecked = false;
/** Events tracked this tick, sent together by `flush`. */
let queue: QueuedEvent[] = [];
/** Paths of the `page_view`s in `queue`, to drop same-tick duplicates. */
let queuedViews: string[] = [];

/**
 * Sets where events go: the commerce API origin and the store's publishable
 * key. Idempotent; `AnalyticsTracker` calls it on every render.
 */
export function configureAnalytics(next: AnalyticsConfig): void {
  config = next;
}

/** Test hook: forgets the configuration, the first-event state and the queue. */
export function resetAnalytics(): void {
  config = null;
  first = true;
  landingChecked = false;
  queue = [];
  queuedViews = [];
}

/** Whether a URL query carries the store editor's preview flag. */
function previewQuery(): boolean {
  return new URLSearchParams(location.search).get(PREVIEW_KEY) === '1';
}

/**
 * Reads the landing URL once: a tab opened from the store editor's preview
 * (`_preview=1` on the landing URL, only there) is remembered in
 * sessionStorage so the flag survives navigation inside the tab. Only
 * `track` reads the landing (its first event is the landing view).
 */
function readLanding(): void {
  if (landingChecked) return;
  landingChecked = true;
  try {
    if (previewQuery()) sessionStorage.setItem(PREVIEW_KEY, '1');
  } catch {
    // Storage may be blocked; the flag then lasts for the landing URL only.
  }
}

/**
 * True for a preview tab: the remembered flag, or `_preview=1` on a landing
 * URL not read yet. Reads only; never consumes the landing check.
 */
function isPreview(): boolean {
  if (!landingChecked && previewQuery()) return true;
  try {
    return sessionStorage.getItem(PREVIEW_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Reports one event. Fire and forget: never awaited, never throws. The
 * first event of a page load carries the full URL (allowlisted query
 * included) and the referrer origin so campaign tags are counted once;
 * later events carry the path only.
 *
 * An identical `page_view` (same path) in the same tick is sent once.
 *
 * Events of one tick are queued and sent together, in call order, by one
 * request (MAX_BATCH events each), so the landing `page_view` and a
 * `product_view` from the same render reach commerce as one batch.
 */
export function track(
  type: AnalyticsEventType,
  extra: AnalyticsExtra = {},
): void {
  try {
    if (!config) return;
    readLanding();
    if (isPreview()) return;
    // React StrictMode runs effects twice: one view per path and tick.
    if (type === 'page_view') {
      const path = safePath();
      if (queuedViews.includes(path)) return;
      queuedViews.push(path);
    }
    const url = (first ? safePath() + safeQuery() : safePath()).slice(
      0,
      MAX_URL,
    );
    const referrer = first ? referrerOrigin() : null;
    first = false;
    const { productId } = extra;
    if (queue.length === 0) queueMicrotask(flush);
    queue.push({ type, url, referrer, ...(productId ? { productId } : {}) });
  } catch {
    // Analytics must never break the page.
  }
}

/**
 * Posts `body` as JSON to `path` on the configured commerce origin with the
 * publishable key. Fire and forget: `keepalive` lets it outlive the page,
 * errors are swallowed.
 */
function send(cfg: AnalyticsConfig, path: string, body: unknown): void {
  void fetch(`${cfg.baseUrl}${path}`, {
    method: 'POST',
    keepalive: true,
    headers: {
      'content-type': 'application/json',
      'x-konfiqo-publishable-key': cfg.publishableKey,
    },
    body: JSON.stringify(body),
  }).catch(() => undefined);
}

/** Sends the queued events, MAX_BATCH per request. */
function flush(): void {
  try {
    const events = queue;
    queue = [];
    queuedViews = [];
    if (!config) return;
    // Read now, not when tracked: a choice made meanwhile already counts.
    const consent = { analytics: analyticsConsent() };
    for (let i = 0; i < events.length; i += MAX_BATCH) {
      send(config, '/v1/events', {
        events: events.slice(i, i + MAX_BATCH),
        consent,
      });
    }
  } catch {
    // Analytics must never break the page.
  }
}

/**
 * Records a consent decision with commerce. Fire and forget, never throws.
 * Not from the store editor's preview tab (the seller's own choices).
 */
export function recordConsent(record: ConsentRecord): void {
  try {
    if (!config || isPreview()) return;
    send(config, '/v1/consents', record);
  } catch {
    // Recording must never break the page.
  }
}
