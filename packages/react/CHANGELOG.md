# Changelog

## 0.7.0

- **Breaking:** `useCheckout().checkout()` requires `{ agreementsHash }`
  and passes it to `carts.checkout`. Load the agreements with
  `client.carts.agreements(cartId)`, show them, then check out with the
  hash; on `agreements_changed`, load them again.
- **Breaking:** the SDK's `Store.legal` is removed (see the SDK changelog);
  `useStore()` now returns `company`. Requires `@konfiqo/storefront-sdk`
  `^0.7.0`.

## 0.6.2

- Pixels loaded on an earlier page no longer send a secret from a later one.
  Meta is loaded with `autoConfig` off, so it sends no automatic button or
  metadata events. Every Google `config` call and `page_view` carries a
  `page_location` without the `token` query parameter. Every Google event
  reports the current page, so it stays correct after a client-side route
  change. On order-status and cart-recovery pages no query string or
  fragment is kept. The new `scrubbedLocation()` returns that URL.
- `firePixel` copies an event it holds before the first `configurePixels`,
  so changing the object afterwards does not change what is sent.
- `ConsentProvider` no longer writes to a ref during render; behaviour is
  unchanged.
- Documentation: wording fixes, and no em dashes in the READMEs.
  Requires `@konfiqo/storefront-sdk` `^0.6.2`.

## 0.6.1

- `firePixel` holds events fired before the page's first `configurePixels`
  (for example a `view_item` from a product page's mount effect during
  hydration, before the consent is read). Up to 20 are held, the oldest
  dropped first. The first configuration sends them in order when it
  carries a `marketing` grant, and drops them otherwise; a later grant
  never sends them. Events held or flushed on an order-status or
  cart-recovery page are not sent. `resetPixels` also clears them.
  Requires `@konfiqo/storefront-sdk` `^0.6.1`.

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
    `onSecretPage` and `AdPixelsLoader`, which loads the pixels only under
    a `marketing` grant. The host helpers `onDefaultDomain`,
    `pixelsForHost` and `cookiesForHost` are in `@konfiqo/storefront-sdk`,
    so server components can call them.
  - `resetAnalytics` and `resetPixels` reset the module state between
    tests (tests only).
- Order-status (`/orders/…`) and cart-recovery (`/cart/recover`) pages
  carry buyer secrets in the URL: analytics scrubs their URLs and pixels
  send nothing there. Serve those pages only at these paths, and open them
  with a full page load, never a client-side route change.
- Pixel currency: `configurePixels(pixels, granted, { currency })` and
  `<AdPixelsLoader currency>` set the ISO 4217 currency of every pixel
  event (default `'TRY'`).
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
