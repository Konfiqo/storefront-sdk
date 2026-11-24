# Changelog

## Unreleased

- `useCart().addLine` accepts `personalization`; `updateLine` / `removeLine`
  take a line id (`CartLine.id`). Requires the matching SDK version.

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
