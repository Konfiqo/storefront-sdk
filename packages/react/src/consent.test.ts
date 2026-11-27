import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  analyticsConsent,
  configureConsent,
  readConsent,
  subscribeConsent,
  writeConsent,
} from './consent';

function clearConsentCookie() {
  document.cookie = '_consent=; Max-Age=0; Path=/; Secure';
}

beforeEach(() => {
  clearConsentCookie();
  configureConsent('');
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('consent storage', () => {
  // The default storefront's checkout pages and a custom storefront on the
  // same host read one stored choice. These strings were captured from the
  // storefront app's own `writeConsent` (storefront-react 0.5 era) with the
  // same fixed random bytes, version and grants: do not edit them.
  it('stores consent exactly as storefront 0.5 did', () => {
    const writes: string[] = [];
    const cookie = Object.getOwnPropertyDescriptor(
      Document.prototype,
      'cookie',
    )!;
    Object.defineProperty(document, 'cookie', {
      configurable: true,
      get: () => cookie.get!.call(document) as string,
      set: (value: string) => {
        writes.push(value);
        cookie.set!.call(document, value);
      },
    });
    const setItem = vi.spyOn(Storage.prototype, 'setItem');
    // Fixed "random" bytes 0x00, 0x11, 0x22, ... for a known consent id.
    vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      const bytes = array as unknown as Uint8Array;
      for (let i = 0; i < bytes.length; i++) bytes[i] = i * 17;
      return array;
    });

    try {
      const first = writeConsent('3f2a', ['marketing', 'analytics']);
      expect(first).toBe('00112233445566778899aabbccddeeff');
      expect(document.cookie).toBe(
        '_consent=00112233445566778899aabbccddeeff.3f2a.analytics,marketing',
      );
      const second = writeConsent('3f2a', []);
      expect(second).toBe(first);
      expect(document.cookie).toBe(
        '_consent=00112233445566778899aabbccddeeff.3f2a.',
      );
      expect(writes).toEqual([
        '_consent=00112233445566778899aabbccddeeff.3f2a.analytics,marketing; Max-Age=31536000; Path=/; SameSite=Lax; Secure',
        '_consent=00112233445566778899aabbccddeeff.3f2a.; Max-Age=31536000; Path=/; SameSite=Lax; Secure',
      ]);
      // The storefront app kept nothing in web storage.
      expect(setItem).not.toHaveBeenCalled();
    } finally {
      delete (document as { cookie?: string }).cookie;
    }
  });

  it('reads a choice the storefront app stored', () => {
    document.cookie =
      '_consent=00112233445566778899aabbccddeeff.3f2a.analytics,marketing; Max-Age=31536000; Path=/; SameSite=Lax; Secure';
    expect(readConsent('3f2a')).toEqual({
      id: '00112233445566778899aabbccddeeff',
      granted: ['analytics', 'marketing'],
    });
    // A later choice keeps the stored id.
    expect(writeConsent('3f2a', ['analytics'])).toBe(
      '00112233445566778899aabbccddeeff',
    );
  });

  it('readConsent rejects another version', () => {
    const id = writeConsent('v1', ['analytics']);
    expect(id).toMatch(/^[0-9a-f]{32}$/);
    expect(document.cookie).toBe(`_consent=${id}.v1.analytics`);
    expect(readConsent('v1')).toEqual({ id, granted: ['analytics'] });
    expect(readConsent('v2')).toBeNull();

    document.cookie = '_consent=nothex.v1.analytics; Path=/; Secure';
    expect(readConsent('v1')).toBeNull();
    document.cookie = `_consent=${id}.v1.analytics,unknown; Path=/; Secure`;
    expect(readConsent('v1')).toBeNull();
    clearConsentCookie();
    expect(readConsent('v1')).toBeNull();
  });

  it('writeConsent keeps the id', () => {
    const first = writeConsent('v1', []);
    expect(readConsent('v1')).toEqual({ id: first, granted: [] });
    const second = writeConsent('v1', ['analytics', 'marketing']);
    expect(second).toBe(first);
    // A new category version keeps the id as well.
    expect(writeConsent('v2', ['analytics'])).toBe(first);
    expect(readConsent('v2')).toEqual({ id: first, granted: ['analytics'] });
  });

  it('notifies subscribers after every write', () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConsent(listener);
    writeConsent('v1', []);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    writeConsent('v1', ['analytics']);
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('analyticsConsent', () => {
  it('is false after a reject', () => {
    configureConsent('v1');
    expect(analyticsConsent()).toBe(false);
    writeConsent('v1', []);
    expect(analyticsConsent()).toBe(false);
  });

  it('follows the current version, with no reload', () => {
    configureConsent('v1');
    writeConsent('v1', ['analytics']);
    expect(analyticsConsent()).toBe(true);

    // Withdrawn.
    writeConsent('v1', []);
    expect(analyticsConsent()).toBe(false);

    // A consent for another version does not count.
    writeConsent('v1', ['analytics']);
    configureConsent('v2');
    expect(analyticsConsent()).toBe(false);
    // No optional cookie in use: never granted.
    configureConsent('');
    expect(analyticsConsent()).toBe(false);
  });
});
