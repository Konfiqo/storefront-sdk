# Changelog

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
