import { useEffect } from 'react';
import type { AdPixels } from '@konfiqo/storefront-sdk';
import { configurePixels, firePixel } from './ad-pixels';
import { useConsent } from './consent-provider';

/** Props of {@link AdPixelsLoader}. */
export interface AdPixelsLoaderProps {
  /** The store's ad pixels (`Store.adPixels`, see `pixelsForHost`). */
  pixels?: AdPixels;
  /** A default store domain: cookies are cleared on the host only. */
  hostOnly?: boolean;
  /**
   * The current route's path, from your router (for example Next.js
   * `usePathname()`). Each new value reports one page view.
   */
  pathname: string;
}

/**
 * Loads the store's ad pixels once the shopper granted `marketing` for the
 * current cookie version (no reload needed), stops them on withdrawal, and
 * reports a page view on every route change. Nothing is configured until
 * the browser's choice has been read (hydration), so a stored grant never
 * looks like a refusal. Must be inside a `ConsentProvider`.
 */
export function AdPixelsLoader({
  pixels,
  hostOnly = false,
  pathname,
}: AdPixelsLoaderProps) {
  const { stored, known } = useConsent();
  const granted = stored?.granted.includes('marketing') ?? false;
  useEffect(() => {
    if (!known) return;
    configurePixels(pixels, granted, { hostOnly });
  }, [pixels, granted, known, hostOnly]);
  useEffect(() => {
    // Declared after the configure effect, so the scripts exist by now.
    if (granted) firePixel({ name: 'page_view' });
  }, [granted, pathname]);
  return null;
}
