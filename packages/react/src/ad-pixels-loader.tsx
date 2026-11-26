import { useEffect } from 'react';
import type { AdPixels } from '@konfiqo/storefront-sdk';
import { configurePixels, firePixel } from './ad-pixels';
import { useConsent } from './consent-provider';

/** Props of {@link AdPixelsLoader}. */
export interface AdPixelsLoaderProps {
  /**
   * The store's ad pixels (`Store.adPixels`, filtered by the SDK's
   * `pixelsForHost`).
   */
  pixels?: AdPixels;
  /** A default store domain: cookies are cleared on the host only. */
  hostOnly?: boolean;
  /**
   * The store's currency (ISO 4217) for every price sent to the platforms.
   * Default `'TRY'`.
   */
  currency?: string;
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
 *
 * Pages whose URL carries a buyer secret (`/orders/…` and `/cart/recover`,
 * see `onSecretPage`) load no pixel script and send no pixel event. A
 * custom storefront must serve its order-status and cart-recovery pages
 * only at those paths, or not render this component there.
 */
export function AdPixelsLoader({
  pixels,
  hostOnly = false,
  currency = 'TRY',
  pathname,
}: AdPixelsLoaderProps) {
  const { stored, known } = useConsent();
  const granted = stored?.granted.includes('marketing') ?? false;
  useEffect(() => {
    if (!known) return;
    configurePixels(pixels, granted, { hostOnly, currency });
  }, [pixels, granted, known, hostOnly, currency]);
  useEffect(() => {
    // Declared after the configure effect, so the scripts exist by now.
    if (granted) firePixel({ name: 'page_view' });
  }, [granted, pathname]);
  return null;
}
