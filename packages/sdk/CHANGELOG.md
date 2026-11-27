# Changelog

## 0.6.2

- `SDK_VERSION` is `'0.6.2'`; nothing else changed. Released together
  with `@konfiqo/storefront-react` 0.6.2.

## 0.6.1

- `SDK_VERSION` is `'0.6.1'`; nothing else changed. Released together
  with `@konfiqo/storefront-react` 0.6.1, which sends pixel events fired
  before the pixels are configured.

## 0.6.0

- Server-safe host helpers for cookie consent and ad pixels:
  `onDefaultDomain(host, suffix)`, `pixelsForHost(adPixels, defaultDomain)`
  and `cookiesForHost(cookies, defaultDomain)`. They use no browser API, so
  server components can call them.
- Released together with `@konfiqo/storefront-react` 0.6.0, which adds
  cookie consent, store analytics and ad-pixel logic for custom
  storefronts. Pixel event ids there follow the product feed rows (variant
  ids; the product as `product_group` before a variant is chosen).

## 0.5.0

- Line personalization. `Product.personalization?` (`ProductPersonalization`:
  `label`, `required`, `minLength`, `maxLength`), `AddLineInput.personalization?`
  and `OrderLine.personalization?` are optional. `CartLine.id`,
  `CartLine.personalization` and `CartLine.personalizationValid` are
  required: they need a Konfiqo commerce API that returns them (released with
  this version), and code that builds `CartLine` fixtures must add them. Also
  the `invalid_personalization` error
  code (`details.lineIds?` on the checkout 409). `carts.updateLine` /
  `carts.removeLine` take a line id (`CartLine.id`); a variant id still
  matches a line without text.

## 0.4.0

First release on npm. Every addition is an optional field (absent from
older API versions), so 0.3.0 code compiles unchanged.

- Store types for cookie consent, all optional (absent from older API
  versions): `Store.cookies?: CookieInfo[]` (the cookies the store uses;
  empty when it uses no optional cookie), `Store.consentVersion?: string`
  (version of the optional cookie set; '' when none) and
  `StoreLegal.cookies?: string | null` (the cookie policy text). New
  exported types `CookieInfo` (`name`, `category`, `purpose`,
  `durationDays`) and `CookieCategory` (`'necessary' | 'analytics' |
'marketing'`).
- `CookieInfo.customDomainOnly?: boolean`: the cookie is set only on a custom
  store domain (Meta and TikTok); leave it out of the banner and policy on a
  default domain.
- Ad pixels: `Store.adPixels?: AdPixels` (the store's public pixel ids:
  `meta.pixelId`, `tiktok.pixelId`, `google.ga4Id` / `adsId` /
  `adsConversionLabel`; load them only after `marketing` consent) and
  `Store.defaultDomainSuffix?: string` (the default domains' suffix; on a
  host under it Meta and TikTok are not loaded).
- `OrderLine.productId?: string | null`: the line's product id, the item id
  ad pixels and analytics report.

## 0.3.0

- The cart id is kept in a first-party cookie, `__Host-konfiqo_cart` (Secure,
  Path=/, SameSite=Lax), as a JSON map keyed by `cartIdKey(storeId)`, so a
  storefront built by the seller on the store domain shares the cart with
  the hosted checkout. Exports `cartIdKey` and the `CookieJar` type.
- Store content: `getContent(key)` returns a Markdoc tree for the React
  `<Content>` component.
- `SDK_VERSION` is `0.3.0`.

## 0.2.0

- Initial public release of the typed Storefront API client.
