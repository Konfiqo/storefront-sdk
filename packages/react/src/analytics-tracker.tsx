import { useEffect } from 'react';
import { configureAnalytics, track } from './analytics';

/** Props of {@link AnalyticsTracker}. */
export interface AnalyticsTrackerProps {
  /** The commerce API origin (the `baseUrl` the storefront client uses). */
  baseUrl: string;
  /** The store's publishable key. */
  publishableKey: string;
  /**
   * The current route's path, from your router (for example Next.js
   * `usePathname()`). Each new value sends one `page_view`.
   */
  pathname: string;
}

/** Configures analytics and sends a `page_view` on mount and every route change. */
export function AnalyticsTracker({
  baseUrl,
  publishableKey,
  pathname,
}: AnalyticsTrackerProps) {
  // Idempotent assignment, done during render so that effects of the
  // components below (which run first) can already track.
  configureAnalytics({ baseUrl, publishableKey });
  useEffect(() => {
    track('page_view');
  }, [pathname]);
  return null;
}
