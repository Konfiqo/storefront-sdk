/**
 * The part of the Web Storage API the cart-id helpers use; `localStorage`,
 * `sessionStorage` or any object with these methods (a cookie adapter, a
 * test double).
 */
export interface CartIdStorage {
  /** Reads a value, or null. */
  getItem(key: string): string | null;
  /** Writes a value. */
  setItem(key: string, value: string): void;
  /** Deletes a value. */
  removeItem(key: string): void;
}

/** The storage key of a store's cart id. Namespaced per store. */
export function cartIdKey(storeId: string): string {
  return `storefront:cart:${storeId}`;
}

/**
 * The saved cart id of a store, or null. Never throws: a missing storage
 * (SSR), a storage that throws (Safari private mode, blocked cookies) or
 * an empty value all read as null.
 */
export function loadCartId(
  storage: CartIdStorage | null | undefined,
  storeId: string,
): string | null {
  try {
    const v = storage?.getItem(cartIdKey(storeId));
    return typeof v === 'string' && v.trim() !== '' ? v.trim() : null;
  } catch {
    return null;
  }
}

/** Saves a store's cart id. Returns false when the storage refused. Never throws. */
export function saveCartId(
  storage: CartIdStorage | null | undefined,
  storeId: string,
  cartId: string,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(cartIdKey(storeId), cartId);
    return true;
  } catch {
    return false;
  }
}

/**
 * Forgets a store's cart id (after `cart_not_found`, or `cart_read_only`
 * with `status: "expired"`). Returns false when the storage refused. Never throws.
 */
export function clearCartId(
  storage: CartIdStorage | null | undefined,
  storeId: string,
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(cartIdKey(storeId));
    return true;
  } catch {
    return false;
  }
}

/** The part of `document` the cookie storage uses. */
export interface CookieJar {
  cookie: string;
}

/** The cookie carrying the cart ids. */
const CART_COOKIE = '__Host-konfiqo_cart';
/** Largest encoded cookie value written (browsers drop a cookie over ~4 KB). */
const MAX_COOKIE_VALUE = 3500;
/** One year, seconds. */
const COOKIE_MAX_AGE = 31_536_000;

function readMap(doc: CookieJar): Record<string, string> {
  try {
    for (const part of doc.cookie.split(';')) {
      const p = part.trim();
      if (!p.startsWith(`${CART_COOKIE}=`)) continue;
      const parsed: unknown = JSON.parse(
        decodeURIComponent(p.slice(CART_COOKIE.length + 1)),
      );
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return {};
      }
      const out: Record<string, string> = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v === 'string') out[k] = v;
      }
      return out;
    }
  } catch {
    // Malformed cookie: ignored (and replaced by the next write).
  }
  return {};
}

function writeMap(doc: CookieJar, map: Record<string, string>): boolean {
  const attrs = '; Path=/; SameSite=Lax; Secure';
  const keys = Object.keys(map);
  if (keys.length === 0) {
    doc.cookie = `${CART_COOKIE}=; Max-Age=0${attrs}`;
    return true;
  }
  const value = encodeURIComponent(JSON.stringify(map));
  if (value.length > MAX_COOKIE_VALUE) return false;
  doc.cookie = `${CART_COOKIE}=${value}; Max-Age=${COOKIE_MAX_AGE}${attrs}`;
  return true;
}

/**
 * Cart ids in the first-party `__Host-konfiqo_cart` cookie (path
 * `/`, no `Domain`, `SameSite=Lax`, `Secure`). The `__Host-` prefix makes
 * browsers refuse a cookie of this name scoped to a parent domain, so a
 * sibling store subdomain cannot plant a cart; the old unprefixed
 * `konfiqo_cart` is never read. The value is a JSON map keyed by
 * {@link cartIdKey}, so a store's own frontend and the hosted checkout on the same domain share
 * the cart. `Secure` cookies are dropped by browsers on plain `http`
 * (other than `localhost`), so over http nothing is stored here; pair it
 * with a `localStorage` fallback. Without a document (SSR) it reads nothing and writes fail.
 * Never throws; a malformed or oversized cookie is ignored.
 *
 * @param doc Defaults to the global `document`; `null` disables it.
 */
export function cookieCartStorage(doc?: CookieJar | null): CartIdStorage {
  const jar = (): CookieJar | null =>
    doc === undefined
      ? ((globalThis as { document?: CookieJar }).document ?? null)
      : doc;
  return {
    getItem(key) {
      const d = jar();
      if (!d) return null;
      return readMap(d)[key] ?? null;
    },
    setItem(key, value) {
      const d = jar();
      if (!d) throw new Error('no document');
      const map = readMap(d);
      map[key] = value;
      if (!writeMap(d, map)) throw new Error('cart cookie too large');
    },
    removeItem(key) {
      const d = jar();
      if (!d) return;
      const map = readMap(d);
      if (!(key in map)) return;
      delete map[key];
      writeMap(d, map);
    },
  };
}
