import type { AdPixels, CookieInfo } from './models';

// Pure helpers for choosing what a store host may load and list. They touch
// no browser API, so they run in server code (for example a Next.js server
// component) as well as in the browser.

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
