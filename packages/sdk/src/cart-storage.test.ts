import { describe, expect, it } from 'vitest';
import {
  cartIdKey,
  clearCartId,
  cookieCartStorage,
  loadCartId,
  saveCartId,
  type CartIdStorage,
} from './index';

function memory(): CartIdStorage & { data: Map<string, string> } {
  const data = new Map<string, string>();
  return {
    data,
    getItem: (k) => data.get(k) ?? null,
    setItem: (k, v) => void data.set(k, v),
    removeItem: (k) => void data.delete(k),
  };
}

const throwing: CartIdStorage = {
  getItem: () => {
    throw new Error('SecurityError');
  },
  setItem: () => {
    throw new Error('QuotaExceededError');
  },
  removeItem: () => {
    throw new Error('SecurityError');
  },
};

describe('cart id storage', () => {
  it('saves, loads and clears per store', () => {
    const s = memory();
    expect(saveCartId(s, 'store-a', 'cart-1')).toBe(true);
    expect(saveCartId(s, 'store-b', 'cart-2')).toBe(true);
    expect(loadCartId(s, 'store-a')).toBe('cart-1');
    expect(loadCartId(s, 'store-b')).toBe('cart-2');
    expect(s.data.get(cartIdKey('store-a'))).toBe('cart-1');
    expect(clearCartId(s, 'store-a')).toBe(true);
    expect(loadCartId(s, 'store-a')).toBeNull();
    expect(loadCartId(s, 'store-b')).toBe('cart-2');
  });

  it('keeps the key free of the platform name', () => {
    expect(cartIdKey('s1')).toBe('storefront:cart:s1');
  });

  it('reads an empty value as no cart', () => {
    const s = memory();
    s.setItem(cartIdKey('x'), '  ');
    expect(loadCartId(s, 'x')).toBeNull();
  });

  it('tolerates a missing or throwing storage', () => {
    expect(loadCartId(undefined, 'x')).toBeNull();
    expect(loadCartId(null, 'x')).toBeNull();
    expect(saveCartId(undefined, 'x', 'c')).toBe(false);
    expect(clearCartId(null, 'x')).toBe(false);
    expect(loadCartId(throwing, 'x')).toBeNull();
    expect(saveCartId(throwing, 'x', 'c')).toBe(false);
    expect(clearCartId(throwing, 'x')).toBe(false);
  });
});

/** A document double: one cookie jar that honours the attributes we set. */
function fakeDocument() {
  const jar = new Map<string, string>();
  const writes: string[] = [];
  return {
    jar,
    writes,
    get cookie() {
      return [...jar].map(([k, v]) => `${k}=${v}`).join('; ');
    },
    set cookie(line: string) {
      writes.push(line);
      const [pair = '', ...attrs] = line.split(';').map((p) => p.trim());
      const i = pair.indexOf('=');
      const name = pair.slice(0, i);
      if (attrs.some((a) => /^max-age=0$/i.test(a))) jar.delete(name);
      else jar.set(name, pair.slice(i + 1));
    },
  };
}

describe('cookieCartStorage', () => {
  it('keeps cart ids as a JSON map in the __Host-konfiqo_cart cookie', () => {
    const doc = fakeDocument();
    const s = cookieCartStorage(doc);
    expect(saveCartId(s, 'a', 'cart-1')).toBe(true);
    expect(saveCartId(s, 'b', 'cart-2')).toBe(true);
    expect(loadCartId(s, 'a')).toBe('cart-1');
    const raw = doc.jar.get('__Host-konfiqo_cart')!;
    expect(JSON.parse(decodeURIComponent(raw))).toEqual({
      [cartIdKey('a')]: 'cart-1',
      [cartIdKey('b')]: 'cart-2',
    });
    const line = doc.writes[0]!;
    expect(line).toMatch(/; Path=\//i);
    expect(line).toMatch(/; SameSite=Lax/i);
    expect(line).toMatch(/; Secure/i);
    expect(line.startsWith('__Host-konfiqo_cart=')).toBe(true);
    expect(line).toMatch(/; Path=\/; SameSite=Lax; Secure$/);
    expect(line).not.toMatch(/Domain/i);
    expect(line).not.toMatch(/HttpOnly/i);
  });

  it('clears one store without touching the others, and drops an empty cookie', () => {
    const doc = fakeDocument();
    const s = cookieCartStorage(doc);
    saveCartId(s, 'a', 'c1');
    saveCartId(s, 'b', 'c2');
    clearCartId(s, 'a');
    expect(loadCartId(s, 'a')).toBeNull();
    expect(loadCartId(s, 'b')).toBe('c2');
    clearCartId(s, 'b');
    expect(doc.jar.has('__Host-konfiqo_cart')).toBe(false);
  });

  it('ignores a malformed cookie and overwrites it on the next write', () => {
    const doc = fakeDocument();
    const s = cookieCartStorage(doc);
    for (const bad of [
      '%E0%A4%A',
      encodeURIComponent('not json'),
      encodeURIComponent('[1]'),
      encodeURIComponent('{"storefront:cart:a":5}'),
    ]) {
      doc.jar.set('__Host-konfiqo_cart', bad);
      expect(loadCartId(s, 'a')).toBeNull();
    }
    doc.jar.set('__Host-konfiqo_cart', '%E0%A4%A');
    expect(saveCartId(s, 'a', 'c9')).toBe(true);
    expect(loadCartId(s, 'a')).toBe('c9');
  });

  it('refuses an oversized value instead of writing a cookie the browser drops', () => {
    const doc = fakeDocument();
    const s = cookieCartStorage(doc);
    expect(saveCartId(s, 'a', 'x'.repeat(5000))).toBe(false);
    expect(doc.jar.has('__Host-konfiqo_cart')).toBe(false);
  });

  it('is inert without a document (SSR)', () => {
    const s = cookieCartStorage(null);
    expect(loadCartId(s, 'a')).toBeNull();
    expect(saveCartId(s, 'a', 'c')).toBe(false);
    expect(clearCartId(s, 'a')).toBe(true);
  });

  it('ignores a legacy konfiqo_cart cookie (a sibling subdomain can plant it)', () => {
    const doc = fakeDocument();
    doc.jar.set(
      'konfiqo_cart',
      encodeURIComponent(JSON.stringify({ [cartIdKey('a')]: 'attacker' })),
    );
    const s = cookieCartStorage(doc);
    expect(loadCartId(s, 'a')).toBeNull();
    saveCartId(s, 'a', 'mine');
    expect(loadCartId(s, 'a')).toBe('mine');
  });

  it('reads other cookies around it', () => {
    const doc = fakeDocument();
    doc.jar.set('theme', 'dark');
    const s = cookieCartStorage(doc);
    saveCartId(s, 'a', 'c1');
    doc.jar.set('z', '1');
    expect(loadCartId(s, 'a')).toBe('c1');
  });
});
