import type { CookieCategory } from '@konfiqo/storefront-sdk';

/** A category the shopper can grant: every one but `necessary`. */
export type OptionalCookieCategory = Exclude<CookieCategory, 'necessary'>;

/**
 * A consent decision, as commerce records it (`POST /v1/consents`). The
 * provider hands one to `onDecision` for every decision.
 */
export interface ConsentRecord {
  consentId: string;
  granted: OptionalCookieCategory[];
  version: string;
}

/** A stored consent for the current category version. */
export interface StoredConsent {
  /** Consent id: 32 lowercase hex, kept across later choices. */
  id: string;
  granted: OptionalCookieCategory[];
}

/**
 * The strictly necessary cookie holding the shopper's choice. Its name,
 * value format (`id.version.granted`) and attributes are shared with every
 * storefront on the same host: keep them unchanged.
 */
const COOKIE = '_consent';
const MAX_AGE = 31536000;
const ID = /^[0-9a-f]{32}$/;
/** Every optional category, in display order. */
export const OPTIONAL_CATEGORIES: readonly OptionalCookieCategory[] = [
  'analytics',
  'marketing',
];

/** The store's current category version ('' when it uses no optional cookie). */
let currentVersion = '';
const listeners = new Set<() => void>();

/**
 * Sets the store's category version `analyticsConsent` checks against.
 * Browser-only: a no-op on the server, where this module state would be
 * shared by every request of every store.
 */
export function configureConsent(version: string): void {
  if (typeof window === 'undefined') return;
  currentVersion = version;
}

/** Calls `listener` after every `writeConsent`; returns the unsubscribe. */
export function subscribeConsent(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The raw `_consent` value; '' when absent or unreadable. */
export function rawConsent(): string {
  try {
    for (const part of document.cookie.split(';')) {
      const eq = part.indexOf('=');
      if (eq < 0 || part.slice(0, eq).trim() !== COOKIE) continue;
      return part.slice(eq + 1).trim();
    }
  } catch {
    // Cookies may be blocked: no consent.
  }
  return '';
}

/** `id.version.granted` parsed; null when malformed. */
function parse(
  raw: string,
): { id: string; version: string; granted: OptionalCookieCategory[] } | null {
  const parts = raw.split('.');
  if (parts.length !== 3) return null;
  const [id, version, list] = parts as [string, string, string];
  if (!ID.test(id)) return null;
  const items = list === '' ? [] : list.split(',');
  if (
    !items.every((c) => (OPTIONAL_CATEGORIES as readonly string[]).includes(c))
  )
    return null;
  return { id, version, granted: items as OptionalCookieCategory[] };
}

/**
 * The stored consent for `version`; null when absent, malformed or given
 * for another category version (the store's cookie set has changed).
 */
export function readConsent(version: string): StoredConsent | null {
  return consentFor(rawConsent(), version);
}

/** {@link readConsent} on a raw `_consent` value. */
export function consentFor(raw: string, version: string): StoredConsent | null {
  const parsed = parse(raw);
  if (!parsed || parsed.version !== version) return null;
  return { id: parsed.id, granted: parsed.granted };
}

/** A new consent id: 32 lowercase hex from the browser's CSPRNG. */
function newConsentId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Stores the shopper's choice for `version` in `_consent` (12 months) and
 * returns the consent id: a new one on the first choice, the stored one on
 * later choices.
 */
export function writeConsent(
  version: string,
  granted: OptionalCookieCategory[],
): string {
  const id = parse(rawConsent())?.id ?? newConsentId();
  const list = OPTIONAL_CATEGORIES.filter((c) => granted.includes(c)).join(',');
  try {
    document.cookie = `${COOKIE}=${id}.${version}.${list}; Max-Age=${MAX_AGE}; Path=/; SameSite=Lax; Secure`;
  } catch {
    // Cookies may be blocked: the choice lasts for this page only.
  }
  for (const listener of listeners) listener();
  return id;
}

/**
 * Whether the shopper granted analytics for the store's current category
 * version. False when the store uses no optional cookie.
 */
export function analyticsConsent(): boolean {
  if (!currentVersion) return false;
  return readConsent(currentVersion)?.granted.includes('analytics') ?? false;
}
