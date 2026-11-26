# Changelog

## 0.6.0

- Cookie consent, store analytics and ad-pixel logic for custom storefronts
  (no UI; bring your own banner and panel). Requires
  `@konfiqo/storefront-sdk` `^0.6.0`.
  - Consent: `ConsentProvider` and `useConsent()` hold the shopper's choice
    in the shared `_consent` cookie. `onDecision` receives a
    `ConsentRecord` for every decision; an error it throws is ignored.
  - Store analytics: `configureAnalytics`, `track`, `recordConsent` and
    `AnalyticsTracker`, which sends a `page_view` for each new `pathname`.
  - Ad pixels (Meta, TikTok, Google): `configurePixels`, `firePixel`,
    `pixelsForHost`, `cookiesForHost`, `onDefaultDomain` and
    `AdPixelsLoader`, which loads the pixels only under a `marketing` grant.
- Pixel event ids follow the product feed rows, which are variants.
  `PixelEvent` `view_item` takes an optional `variantId` and `add_to_cart`
  a required `variantId`; `purchase` item ids are variant ids. Before a
  variant is chosen, `view_item` names the product as the group
  (`content_type: 'product_group'`).
- `AnalyticsTracker` and `AdPixelsLoader` take the current route as a
  `pathname` prop, so the package imports no router.

## 0.5.0

- `useCart().addLine` accepts `personalization` and passes it through to the
  SDK; `updateLine` / `removeLine` take a line id (`CartLine.id`). Requires
  `@konfiqo/storefront-sdk` `^0.5.0`.

## 0.4.0

- First release on npm. Requires `@konfiqo/storefront-sdk` `^0.4.0`; no
  change to the hooks or components.

## 0.3.0

- `<Content contentKey="home.hero" />` and `renderContent` render store
  content (Markdoc tags `ProductGrid`, `Product`, `CategoryLink`, `Image`,
  `Button`).
- The default cart storage reads the `__Host-konfiqo_cart` cookie first, then
  `localStorage`. Each cookie read renews the cookie; an expired cookie (Safari
  keeps script-written cookies 7 days) is rewritten from `localStorage`. A cart
  cleared with `removeItem` is not restored from `localStorage`.
- Requires `@konfiqo/storefront-sdk` `^0.3.0`.

## 0.2.0

- Initial public release of the React hooks and components.
