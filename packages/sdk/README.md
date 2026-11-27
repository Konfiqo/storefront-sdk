# @konfiqo/storefront-sdk

Typed client for the Storefront API: catalog, carts, checkout, buyer order
status and catalog images, plus helpers to present payment, format money
and remember the buyer's cart.

- Works in browsers and in Node ≥ 20 (global `fetch`). ESM + CJS + `.d.ts`.
- Zero runtime dependencies. TypeScript ≥ 5.0 for the types.
- No retries, no caching, no global state: one function call = one request.

```bash
npm install @konfiqo/storefront-sdk
```

## Quick start

### Browser

```ts
import { createStorefrontClient, formatMoney } from '@konfiqo/storefront-sdk';

const sf = createStorefrontClient({
  baseUrl: 'https://shop.example.com/api', // your store domain + /api (or '/api' on the same origin)
  publishableKey: 'pk_live_…', // public: safe to ship to browsers
});

const store = await sf.store.get();
const { items } = await sf.products.list({ category: 'tshirts', pageSize: 24 });
console.log(
  formatMoney(items[0].variants[0].priceMinor, store.currency, 'tr-TR'),
);
```

The page's origin must be in the store's `allowedOrigins` (see
[CORS](#cors-and-allowedorigins)).

### Node

```ts
const sf = createStorefrontClient({ baseUrl, publishableKey });
const product = await sf.products.get('basic-tee');
```

A server-side request has no `Origin`, so `allowedOrigins` does not apply.
It is throttled per publishable key **and server IP**: every buyer your
server serves shares one budget (reads: about 120 requests per minute).
For buyer traffic, call the API from the browser (cart, checkout, order
status) and cache server-side catalog reads (see Next.js below). To
report the real buyer IP from your server, use a server key (see Server
usage below). The trusted storefront key is issued only to the hosted
Konfiqo storefront.

### Next.js (App Router)

Read the catalog in Server Components (no `Origin`) **and cache it**; run
the cart and checkout in Client Components (from the buyer's browser):

```tsx
// lib/storefront.ts (server)
import { createStorefrontClient } from '@konfiqo/storefront-sdk';

export const sf = createStorefrontClient({
  baseUrl: process.env.COMMERCE_URL!,
  publishableKey: process.env.NEXT_PUBLIC_PK!,
  // Next.js caches each catalog response for 60 s and shares it between
  // renders and buyers.
  fetch: (input, init) => fetch(input, { ...init, next: { revalidate: 60 } }),
});

// app/products/[slug]/page.tsx (server)
export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const product = await sf.products.get((await params).slug);
  return <ProductView product={product} />;
}
```

Why the cache matters: server-side reads are throttled per publishable key
**and your server's IP**, about **120 reads per minute** for all your
buyers together (and a page often makes two or three reads: store,
categories, products). Uncached server rendering starts failing with
`rate_limited` at a few dozen page views per minute. With the cache above,
each distinct read reaches the API about once a minute. Alternatives:
wrap the calls in `unstable_cache(fn, keyParts, { revalidate: 60 })` (or
`'use cache'` with `cacheLife`). Only cache catalog reads (`store`,
`categories`, `products`): never carts, checkout or orders,
which belong in the buyer's browser anyway. Prices and stock in a cached
page can be up to a minute old; the cart and checkout always show the
server's current totals.

`@konfiqo/storefront-react` wraps the browser side in a provider and hooks.

### Base URL

On every store domain, `/api/*` is the commerce API. Set `baseUrl` to
`https://<store domain>/api`, or to the relative `/api` in a browser app
served from the same domain. Do not add `/v1`: the client adds it, so
requests go to `/api/v1/...`.
Buyer accounts need the same-origin setup (see
[Accounts](#accounts-and-cart-recovery)).

### Server usage (server key)

A seller's own server can report the real buyer IP with the store's server
key, which the store operator mints and revokes. Keep it in server
environment variables, never in a browser bundle.

```ts
createStorefrontClient({
  baseUrl: 'https://shop.example.com/api',
  publishableKey,
  serverKey: process.env.KONFIQO_SERVER_KEY, // never in a browser
  buyerIp: request.headers.get('cf-connecting-ip')!, // required with serverKey
});
```

Sends `x-konfiqo-server-key` and `x-konfiqo-buyer-ip` next to the
publishable key. Create one client per incoming request. The constructor
throws when `serverKey` has no `buyerIp`, when it is combined with
`trustedStorefrontKey`, or when it runs in a browser-like host (the same
rules as `trustedStorefrontKey` below).

### Trusted storefront key (hosted storefront only)

The trusted storefront key is issued **only to the hosted Konfiqo
storefront**. Third-party sellers never get one: call the API from the
buyer's browser, or from your server with only the publishable key (then
throttled per key + server IP, as above).

```ts
createStorefrontClient({
  baseUrl,
  publishableKey,
  trustedStorefrontKey: process.env.COMMERCE_STOREFRONT_API_KEY, // never in a browser
  // Required with it: the buyer's IP as written by YOUR trusted edge.
  buyerIp: request.headers.get('cf-connecting-ip')!, // origin reachable only from Cloudflare
});
```

`buyerIp` must be an address that a proxy **you control** wrote, never one
the client can choose: `CF-Connecting-IP` when the origin accepts traffic
from Cloudflare only, or the Nth `X-Forwarded-For` entry **counted from the
right** (N = the number of your proxies that append to it). Never the first
(leftmost) `X-Forwarded-For` entry: the client writes that one, so any
buyer could pose as any IP and dodge throttling.

Sends `x-konfiqo-storefront-key` and `x-konfiqo-buyer-ip` so throttling and
the payment provider see the buyer instead of your server. Create one client
per incoming request. Without `trustedStorefrontKey` or `serverKey`, neither
header is ever sent (`buyerIp` is ignored).

The constructor **throws** when `trustedStorefrontKey` is given in a
browser-like host: `window` or `document` defined, or a web worker. Hosts
that define `window` on the server, jsdom, Electron renderers, React
Native, are refused too; keep the trusted key in a plain server process.

## Client options

| Option                 | Default        |                                                            |
| ---------------------- | -------------- | ---------------------------------------------------------- |
| `baseUrl`              | none           | `https://<store domain>/api`, or `/api` on the same origin |
| `publishableKey`       | none           | `pk_live_…` / `pk_test_…`                                  |
| `fetch`                | global `fetch` | any `fetch`-compatible function                            |
| `timeoutMs`            | `15000`        | per request; on expiry the request is aborted → `timeout`  |
| `trustedStorefrontKey` | none           | server only, see above                                     |
| `serverKey`            | none           | server only, see Server usage                              |
| `buyerIp`              | none           | required with `serverKey` or `trustedStorefrontKey`        |

**`pk_test_` is not a test mode**: it places real orders against the
tenant's payment connection. Test against a store whose payments are in the
provider's sandbox.

## API reference

Every method takes an optional last argument `{ signal?: AbortSignal }`
(combined with the timeout; aborting rejects with `aborted`) and resolves
with the response body or rejects with a [`StorefrontError`](#errors).
Path arguments (slugs, ids) that are empty, `.` or `..` reject with a
`TypeError` (`invalid_path_segment`) without a request.

| Method                                                                        | Route                                | Resolves with                                                                                                                        |
| ----------------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ |
| `store.get()`                                                                 | `GET /v1/store`                      | `Store`: name, `defaultLanguage`, `currency`, `logo`/`logoUrl`, `theme` (`ThemeV1`, as stored), contact, legal texts, shipping rules |
| `categories.list()`                                                           | `GET /v1/categories`                 | `{ items: Category[] }` (active tree, sorted)                                                                                        |
| `products.list({ category?, q?, page?, pageSize? })`                          | `GET /v1/products`                   | `{ items: Product[], pagination }` (`pageSize` 1–100, default 20)                                                                    |
| `products.get(slug)`                                                          | `GET /v1/products/:slug`             | `Product`                                                                                                                            |
| `carts.create()`                                                              | `POST /v1/carts`                     | `Cart`                                                                                                                               |
| `carts.get(cartId)`                                                           | `GET /v1/carts/:id`                  | `Cart`                                                                                                                               |
| `carts.addLine(cartId, { variantId, quantity, personalization? })`            | `POST /v1/carts/:id/lines`           | `Cart`                                                                                                                               |
| `carts.updateLine(cartId, lineId, { quantity })`                              | `PATCH /v1/carts/:id/lines/:lineId`  | `Cart`                                                                                                                               |
| `carts.removeLine(cartId, lineId)`                                            | `DELETE /v1/carts/:id/lines/:lineId` | `Cart`                                                                                                                               |
| `carts.setCustomer(cartId, { email, name, surname, phone, identityNumber? })` | `PUT /v1/carts/:id/customer`         | `Cart`                                                                                                                               |
| `carts.setAddress(cartId, { shipping, billing? })`                            | `PUT /v1/carts/:id/address`          | `Cart`                                                                                                                               |
| `carts.shippingOptions(cartId)`                                               | `GET /v1/carts/:id/shipping-options` | `{ items: { id, priceMinor }[] }`                                                                                                    |
| `carts.setShippingOption(cartId, optionId)`                                   | `PUT /v1/carts/:id/shipping-option`  | `Cart`                                                                                                                               |
| `carts.checkout(cartId, { turnstileToken? })`                                 | `POST /v1/carts/:id/checkout`        | `CheckoutResult` (see [Checkout challenge](#checkout-challenge))                                                                     |
| `orders.get(orderId, token)`                                                  | `GET /v1/orders/:id?token=`          | `Order`                                                                                                                              |
| `carts.recover(token)`                                                        | `POST /v1/carts/recover`             | `{ cartId }`: a **new** cart with the abandoned cart's lines (see [Accounts](#accounts-and-cart-recovery))                           |
| `account.requestCode(email, { turnstileToken? })`                             | `POST /v1/account/code`              | nothing (202 for any address)                                                                                                        |
| `account.signIn(email, code)`                                                 | `POST /v1/account/session`           | `{ customer: { email } }`; sets the session cookie                                                                                   |
| `account.signOut()`                                                           | `DELETE /v1/account/session`         | nothing                                                                                                                              |
| `account.get(page?)`                                                          | `GET /v1/account`                    | `Account`: profile, `savedAddresses`, one page of `orders` (20, newest first)                                                        |
| `account.updateProfile({ name, surname, phone })`                             | `PUT /v1/account/profile`            | nothing                                                                                                                              |
| `account.saveAddresses(list)`                                                 | `PUT /v1/account/addresses`          | `SavedAddress[]` as stored (max 5, one default)                                                                                      |
| `media.url(key)`                                                              | none                                 | absolute image URL (synchronous)                                                                                                     |

### Accounts and cart recovery

Buyers sign in with an e-mailed 6-digit code: `account.requestCode(email)`,
then `account.signIn(email, code)` (a wrong, spent or expired code rejects
`invalid_code`). The session is an **HttpOnly cookie** (`konfiqo_session`)
the API sets on the store origin, so run the storefront on the same origin
as the API (`baseUrl: '/api'`). Account calls send `credentials: 'include'`;
`account.get()` rejects `not_signed_in` (401) without a session. Save a
profile (`updateProfile`) before `saveAddresses`, else `profile_required`
(409). `phone` must be a Turkish mobile number (`invalid_request` otherwise).

**Same origin only.** Account calls (cookie sessions) work only when the
storefront is served on the store domain and calls `/api` there. A storefront
on another origin with a cross-origin `baseUrl` (for example
`https://shop.example.com/api` from `https://my-app.example.net`) can use the
catalog, carts and checkout, but not accounts: the session cookie belongs to
the store domain (`SameSite=Lax`) and the API does not allow credentialed
cross-origin requests, so the browser neither sends nor accepts the session
on those calls.

**Server-side.** A server that renders for the buyer must forward the
buyer's cookie: every method accepts `cookie` in its options.

```ts
const sf = createStorefrontClient({ baseUrl, publishableKey });
const account = await sf.account.get(1, {
  cookie: request.headers.get('cookie') ?? undefined,
});
```

The `cookie` option is a plain request header: browsers ignore it (they send
the session cookie themselves). Forward it only from the buyer's own request,
never store it or share a client's cookie across buyers. `Set-Cookie` from
`signIn` is not exposed to you on a server: sign in from the browser.

**Cart recovery.** An abandoned-cart e-mail links to
`<store>/cart/recover?t=<token>`. Pass `t` to `carts.recover(token)`: it
answers a **new** cart id holding the same lines (no buyer data); save it as
the buyer's cart. `invalid_recovery_token` (400) = bad link,
`cart_not_recoverable` (410) = the cart was ordered, expired or deleted.

Money is always integer **minor units** (kuruş for `TRY`). Prices you send
are ignored; every cart response is priced by the server.

**Images.** `image`, `logo` and the theme's `logo` / `favicon` / section
`image` are storage keys. `imageUrl` / `logoUrl` in responses are
**relative** (`/v1/media/<key>?pk=…`); prefix `baseUrl`, or call
`sf.media.url(key)`, which returns
`${baseUrl}/v1/media/<each segment encoded>?pk=<publishable key>` (a key
with an empty, `.` or `..` segment throws `invalid_path_segment`). The key
rides in the query because `<img>` cannot send headers; it is public.

**Cart lines** carry `purchasable` (false = no longer sold) and `inStock`
(false = fewer units left than the line asks for). Checkout refuses both:
show them and let the buyer remove or reduce.

**Line personalization.** A product can ask the buyer for one short text per
line (an engraving, a pet's name). When it does, `product.personalization` is
`{ label, required, minLength, maxLength }` (absent otherwise; lengths count
characters). Pass the text to `carts.addLine(cartId, { variantId, quantity,
personalization: 'Sarı' })`; a refused text rejects with
`invalid_personalization` (400). The same variant with a different text is a
separate line, so address lines by `line.id` in `updateLine` / `removeLine`:
it is the variant id for a line without text and `<variantId>~<12 hex>` for a
line with text (a variant id still matches a line without text). Each line
carries `personalization: string | null` and `personalizationValid`, which is
false when the stored text no longer satisfies the product's current rule;
checkout then rejects with `invalid_personalization` and `details.lineIds`:
remove those lines and add them again. `id`, `personalization` and
`personalizationValid` are required in the types and need a Konfiqo commerce
API that returns them; an older server omits them, and against one treat `id`
as `variantId`, `personalization` as null and `personalizationValid` as true.
Order lines carry `personalization?: string | null`.

**Customer.** `phone` must be a Turkish mobile number (`05XX…`, `5XX…`,
`+90…`, `0090…`; spaces, dashes, parentheses allowed); it comes back as
`90XXXXXXXXXX`. Addresses use `{ name?, phone?, email?, address | line1 +
line2?, district, city, zipCode | postalCode, country: 'TR' }`.

**Theme.** `store.theme` is passed through as the seller stored it and is
not validated: every field is optional, unknown keys are kept. Narrow
homepage sections with `isKnownThemeSection(section)` and skip the rest;
render `richText` as text or sanitised markdown, never raw HTML.

## Errors

Every failure is a `StorefrontError` with `code`, `status` (HTTP status, `0`
without a response), `message` (for logs, not for logic) and `details`
(typed per code). Switch on `code`:

```ts
import { isStorefrontError } from '@konfiqo/storefront-sdk';

try {
  const result = await sf.carts.checkout(cartId);
} catch (e) {
  if (!isStorefrontError(e)) throw e;
  switch (e.code) {
    case 'cart_changed':
      showNewTotals(e.details.totalMinor, e.details.lines);
      break;
    case 'out_of_stock':
      markLines(e.details.variantIds);
      break;
    case 'invalid_personalization':
      askAgain(e.details.lineIds ?? []);
      break;
    case 'checkout_incomplete':
      ask(e.details.missing);
      break;
    case 'invalid_buyer_details':
      focusField(e.details.field);
      break;
    case 'rate_limited':
      retryIn(e.details.retryAfter ?? 5);
      break;
    default:
      showGenericError();
  }
}
```

`e.is('cart_changed')` narrows a single code the same way.

### API error codes

| Code                      | Status   | `details`                                                                                             | Meaning / what to do                                                                                                                                                          |
| ------------------------- | -------- | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `store_not_found`         | 404      |                                                                                                       | bad / revoked publishable key, or the store is disabled                                                                                                                       |
| `origin_not_allowed`      | 403      |                                                                                                       | browser `Origin` not in the store's `allowedOrigins`                                                                                                                          |
| `invalid_request`         | 400      | `{ issues: [{ path, message }] }`                                                                     | a body or query field is invalid (e.g. `path: "phone"`)                                                                                                                       |
| `invalid_buyer_ip`        | 400      |                                                                                                       | trusted key sent without a valid `buyerIp`                                                                                                                                    |
| `catalog_unavailable`     | 503      |                                                                                                       | the catalog could not be read; retry later                                                                                                                                    |
| `product_not_found`       | 404      |                                                                                                       | no sellable product with that slug                                                                                                                                            |
| `cart_not_found`          | 404      |                                                                                                       | unknown cart (or another store's): start a new cart                                                                                                                           |
| `variant_not_found`       | 404      |                                                                                                       | the variant is not sold                                                                                                                                                       |
| `insufficient_stock`      | 409      | `{ available }`                                                                                       | only `available` units can be added                                                                                                                                           |
| `quantity_out_of_range`   | 400      |                                                                                                       | a line holds 1–99 units                                                                                                                                                       |
| `too_many_lines`          | 400      |                                                                                                       | a cart holds at most 50 lines                                                                                                                                                 |
| `line_not_found`          | 404      |                                                                                                       | no line with that id                                                                                                                                                          |
| `invalid_shipping_option` | 400      |                                                                                                       | the option is not offered for this cart                                                                                                                                       |
| `cart_read_only`          | 409      | `{ status: 'ordered' \| 'expired' }`                                                                  | the cart can no longer change: `expired` → start a new cart; `ordered` → check out again (re-opens payment) or show the order                                                 |
| `checkout_in_progress`    | 409      |                                                                                                       | another checkout of this cart is running: retry in a few seconds                                                                                                              |
| `checkout_incomplete`     | 400      | `{ missing: ('lines' \| 'customer' \| 'identityNumber' \| 'shippingAddress' \| 'shippingOption')[] }` | collect what is missing                                                                                                                                                       |
| `cart_changed`            | 409      | `{ lines, subtotalMinor, shippingMinor, totalMinor, shippingOptions }`                                | prices or shipping changed: show the new totals, let the buyer confirm, then call checkout again. Never re-submit silently.                                                   |
| `out_of_stock`            | 409      | `{ variantIds }`                                                                                      | remove / reduce those lines                                                                                                                                                   |
| `invalid_personalization` | 400, 409 | `{ lineIds? }` (409 at checkout)                                                                      | 400: the text breaks the product's rule (or the product asks for none). 409: those lines' stored text is no longer valid: remove each line and add it again with a valid text |
| `amount_out_of_range`     | 400      |                                                                                                       | total not representable                                                                                                                                                       |
| `nothing_to_pay`          | 400      |                                                                                                       | total is zero                                                                                                                                                                 |
| `invalid_buyer_details`   | 422      | `{ field }`                                                                                           | the payment provider refused `name`, `surname`, `email`, `phone`, `identityNumber`, `shippingAddress.<f>` or `billingAddress.<f>`: let the buyer fix it, check out again      |
| `payment_unavailable`     | 502      |                                                                                                       | payments refused or unreachable; the order was cancelled, the cart is still open                                                                                              |
| `checkout_unavailable`    | 503      |                                                                                                       | store backend unreachable; the cart is still open, retry                                                                                                                      |
| `order_not_found`         | 404      |                                                                                                       | unknown order or wrong token                                                                                                                                                  |
| `order_unavailable`       | 503      |                                                                                                       | order status temporarily unavailable; poll again                                                                                                                              |
| `media_not_found`         | 404      |                                                                                                       | (image route) key not referenced by the catalog                                                                                                                               |
| `media_unavailable`       | 503      |                                                                                                       | (image route) image temporarily unavailable                                                                                                                                   |
| `challenge_required`      | 400      |                                                                                                       | the store requires a checkout challenge and no token was sent: render the widget, check out with its token                                                                    |
| `challenge_failed`        | 403      |                                                                                                       | the token was invalid, expired or already used: `reset()` the widget, check out with the new token                                                                            |
| `challenge_unavailable`   | 503      |                                                                                                       | the challenge could not be verified right now: retry in a moment                                                                                                              |
| `too_many_open_orders`    | 429      |                                                                                                       | too many unpaid orders from this buyer: finish or wait out a pending payment                                                                                                  |
| `not_signed_in`           | 401      |                                                                                                       | no valid session cookie: sign in                                                                                                                                              |
| `invalid_code`            | 401      |                                                                                                       | wrong, spent or expired sign-in code (5 attempts per code)                                                                                                                    |
| `profile_required`        | 409      |                                                                                                       | save the profile before saving addresses                                                                                                                                      |
| `too_many_code_requests`  | 429      |                                                                                                       | too many codes requested from this address: wait                                                                                                                              |
| `invalid_recovery_token`  | 400      |                                                                                                       | the recovery link is malformed or not for this store                                                                                                                          |
| `cart_not_recoverable`    | 410      |                                                                                                       | the abandoned cart was ordered, expired or deleted: start a new cart                                                                                                          |
| `unavailable`             | 503      |                                                                                                       | the account could not be read or saved right now: retry                                                                                                                       |

### Codes the SDK assigns

| Code               | Status | `details`                   | When                                                                                                                        |
| ------------------ | ------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `rate_limited`     | 429    | `{ retryAfter? }` (seconds) | throttled (`checkout`: 5/min per key + IP); a 429 with a known code (`too_many_open_orders`) keeps that code                |
| `unauthorized`     | 401    |                             | a wrong `trustedStorefrontKey`                                                                                              |
| `http_error`       | any    |                             | an error response without an `error` code                                                                                   |
| `unknown_error`    | any    | `{ error }`                 | an `error` code this SDK version does not know                                                                              |
| `invalid_response` | 2xx    |                             | the response body is not JSON                                                                                               |
| `network_error`    | 0      |                             | the API was unreachable (DNS, TLS, offline), or the page's origin is allowed by no store (`cause` holds the original error) |
| `timeout`          | 0      | `{ timeoutMs }`             | no response within `timeoutMs`                                                                                              |
| `aborted`          | 0      |                             | your `signal` aborted the request                                                                                           |

**In browsers.** Error responses (status ≥ 400) carry CORS headers for
any origin that some store allows, and expose `Retry-After` /
`Retry-After-ip`: a browser reads every error code, including
`rate_limited` with its `retryAfter`, `store_not_found` and
`origin_not_allowed`. A `network_error` in a browser means the API could
not be reached at all, or the page's origin is in **no** store's
`allowedOrigins` (the browser then hides the response). Treat a
`network_error` on checkout as "try again in a moment", not as a decline.

**No retries.** The SDK never retries. Writes are not safely repeatable. In
particular, checking out a cart whose payment failed places a **new**
order, so retrying is your decision, per code (`checkout_in_progress`,
`checkout_unavailable`, `catalog_unavailable`, `rate_limited`).

## Payment

`carts.checkout` answers how to present payment, by `presentation`:

| `presentation` | Fields                     | Do                                                                                                                                        |
| -------------- | -------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `embedded`     | `embed: { kind, content }` | render the provider's form in your page                                                                                                   |
| `redirect`     | `url`                      | top-level navigation to `url` (never an iframe)                                                                                           |
| `closed`       | `page` (+ `orderStatus`)   | payment cannot be (re)opened: show the order status page. `page` is `paid`, `cancelled`, `processing`, `expired`, `failed` or `not_found` |

`mountPayment` does each of these:

```ts
import { mountPayment } from '@konfiqo/storefront-sdk';

const result = await sf.carts.checkout(cartId);
if (result.token) saveOrderToken(result.orderId, result.token); // returned ONCE
const token = result.token ?? loadOrderToken(result.orderId);

const mount = mountPayment(document.getElementById('payment')!, result, {
  onClosed: () =>
    router.push(`/orders/${result.orderId}?token=${encodeURIComponent(token)}`),
});
// mount.kind: 'embedded' (mount.unmount()), 'redirect', 'closed', or
// 'unsupported' (an embed kind this SDK cannot render: show a fallback)
```

- **embedded** (`iyzico-checkout-form`): puts the provider's HTML into the
  element and re-creates every `<script>` (attributes + text) so it
  executes; `innerHTML` alone never runs scripts. Mounting the same form
  into the same element again does nothing; a different form replaces the
  old one. Scripts are never injected twice (safe with React Strict Mode).
  Pass `mountPayment` only the **unmodified result of `checkout()`**.
  Never build a presentation, `embed` or redirect `url` from user input,
  URL parameters or storage: the embedded content is executed as script.
  This is the provider's own form: card data goes from it to the provider
  and never through your code. If you use a Content Security Policy, allow
  the provider's script and frame origins.
- **redirect**: `window.location.assign(url)`; only `http(s)` URLs.
- **closed**: calls `onClosed(page)` and returns `{ kind: 'closed', page }`.

## Checkout challenge

A store can require a bot challenge (Cloudflare Turnstile) on checkout.
`store.checkoutChallenge` is then `{ provider: 'turnstile', siteKey }`
(`null` or absent: no challenge).

```ts
import { renderTurnstile } from '@konfiqo/storefront-sdk';

let token: string | null = null;
const challenge = store.checkoutChallenge; // null: skip the widget
const widget = challenge
  ? await renderTurnstile(
      document.getElementById('challenge')!,
      challenge.siteKey,
      {
        onToken: (t) => (token = t),
        onExpired: () => (token = null),
      },
    )
  : null;

async function pay() {
  try {
    return await sf.carts.checkout(cartId, {
      turnstileToken: token ?? undefined,
    });
  } finally {
    token = null;
    widget?.reset(); // tokens are single-use: every checkout call needs a new one
  }
}
```

- `loadTurnstile(document)` injects Cloudflare's official script
  (`https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit`)
  once per document and resolves with `window.turnstile`; nothing else is
  ever injected. `renderTurnstile` calls it for you. If the script fails to
  load, the promise rejects and the failed tag is removed: calling again retries.
- Tokens are **single-use** and expire after about 5 minutes: reset the
  widget after every checkout call, successful or not
  (`challenge_failed` = used, expired or invalid token).
- On your own site, the widget only works on hostnames Cloudflare knows
  for the store's site key: your domain must be one of the store's domains
  / `allowedOrigins` **and** in the widget's hostname list (ask the store
  operator).
- Re-opening payment on an already ordered cart needs no token.
- With a Content Security Policy, allow `https://challenges.cloudflare.com`
  in `script-src` and `frame-src`.

## Cookies

`store.cookies` lists the cookies the store uses (`CookieInfo`: `name`,
`category` of `'necessary' | 'analytics' | 'marketing'`, `purpose` in the
store's language, `durationDays`). It is empty when the store uses no
optional cookie: then nothing needs the shopper's consent.
`store.consentVersion` identifies the set of optional cookies ('' when
none); a consent given for another version should be asked again.
`store.legal.cookies` is the cookie policy text. All three are absent from
API versions before cookie consent: treat them as `[]`, `''` and no text.

Server-safe helpers for a store's own host (no browser API, so they run in
server components):

- `onDefaultDomain(host, suffix)`, whether `host` is the default store
  domain suffix or a subdomain of it (case-insensitive; `false` without a
  suffix).
- `pixelsForHost(adPixels, defaultDomain)`, on a default domain only
  Google is kept: Meta and TikTok write their cookies to the registrable
  domain, which every default store domain shares.
- `cookiesForHost(cookies, defaultDomain)`, on a default domain the
  `customDomainOnly` cookies are dropped, and the list is empty when no
  optional cookie is left (then no consent is needed).

`@konfiqo/storefront-react` has the consent state, store analytics and
the ad-pixel loader that use them.

## Helpers

- `formatMoney(minor, currency, locale?)`, `Intl.NumberFormat` with the
  currency's own minor digits: `formatMoney(14990, 'TRY', 'tr-TR')` →
  `₺149,90`.
- `loadCartId(storage, storeId)`, `saveCartId(storage, storeId, cartId)`,
  `clearCartId(storage, storeId)`, remember the cart per store in
  `localStorage` (or any `{ getItem, setItem, removeItem }`). Key
  `storefront:cart:<storeId>`. They never throw: no storage (SSR), a
  throwing storage (private mode) → `null` / `false`.
- `cookieCartStorage()`, the same interface over the first-party
  `__Host-konfiqo_cart` cookie, which the hosted checkout on a store domain
  reads too.
- **Clearing a cart on a store domain.** A frontend served on the store's
  own domain shares both the cookie and `localStorage` with the hosted
  storefront, which restores a cart id from `localStorage` whenever the
  cookie is missing (Safari expires script-written cookies after 7 days).
  `clearCartId(localStorage, …)` or `cookieCartStorage().removeItem` on
  their own are therefore not enough: neither writes the
  `storefront:cart:<storeId>:cleared` tombstone, so the old cart comes back.
  Clear through `@konfiqo/storefront-react`'s `defaultCartStorage()` (or
  `useCartStorage()`), e.g. `clearCartId(defaultCartStorage(), storeId)`,
  which clears the cookie and `localStorage` and writes the tombstone. On
  your own domain (not a store domain) `localStorage` alone is fine.
- **`storeId`** is any string that is stable for one store and different
  between stores: it only names the storage key. The API does not return a
  store id; use the publishable key (it is public anyway), or a string the
  store operator gives you. Changing it later forgets carts saved under the
  old value.

## Build your own storefront

1. **Operator setup.** Ask the store operator to:
   - mint a `pk_live_…` publishable key for you;
   - list your site's exact origins (`https://shop.example.com`, plus
     `http://localhost:3000` for development) in the store's
     `allowedOrigins` (not as a store _domain_: store domains are routed
     to the hosted storefront);
   - set the store's `orderStatusUrl` to **your** order page, e.g.
     `https://shop.example.com/orders/{orderId}?token={token}` (step 7);
   - add your origin to the tenant's payments connection **allowed return
     addresses** (`allowedReturnOrigins`), else checkout fails with
     `payment_unavailable`;
   - if the store uses a checkout challenge, add your hostname to its
     Turnstile widget's hostname list, else checkout fails with
     `challenge_failed`.

2. **CORS and `allowedOrigins`.** <a id="cors-and-allowedorigins"></a>
   Browser requests must come from one of those origins, else 403
   `origin_not_allowed` (an origin that no store allows at all sees
   `network_error` instead). The API
   allows only the `content-type`, `x-konfiqo-publishable-key` and (on
   checkout) `x-konfiqo-turnstile-token` request headers cross-origin. Server-side requests (no `Origin`) are always
   allowed.

3. **Catalog.** `store.get()` for name, currency, language, theme, legal
   texts (show KVKK, distance-sales and returns texts at checkout);
   `categories.list()`, `products.list()`, `products.get(slug)`. Build
   variant pickers from `variant.optionValues`; disable variants with
   `available === 0`.

4. **Cart.** `carts.create()` once, `saveCartId(localStorage, storeId, cart.id)`.
   The cart id is a bearer capability; keep it in the buyer's browser
   only. On `cart_not_found` or `cart_read_only` with `status: 'expired'`,
   `clearCartId` and create a new cart (on a store domain, through the
   React package's storage: see "Clearing a cart on a store domain").
   Carts live 7 days.

5. **Checkout form.** `setCustomer` (Turkish mobile number; the **identity
   number**, TC kimlik no, 11 digits, is required by the payment
   provider, is stored sealed, is never returned (`identityNumberProvided`
   tells you one is on file) and can be omitted on later calls to keep the
   one on file; show a KVKK notice next to the field), `setAddress`,
   `shippingOptions` + `setShippingOption`.

6. **Pay.** If `store.checkoutChallenge` is set, render the challenge
   widget first ([below](#checkout-challenge)). `carts.checkout(cartId, { turnstileToken })`. Store the returned `token` with the
   `orderId`; it is returned only once and is the buyer's only key to the
   order page. Then `mountPayment`. Handle `cart_changed` by showing the
   new totals and asking the buyer to confirm before calling checkout
   again; never charge silently.

7. **Return URL.** The store's `orderStatusUrl`
   (`https://shop.example.com/orders/{orderId}?token={token}`) is where the
   payment provider sends the buyer back. Serve that page: read
   `orders.get(orderId, token)` and poll with backoff until the order is
   settled: `status` is anything past `pendingPayment` (`paid`,
   `fulfilling`, `shipped`, `delivered`, `cancelled`, `refunded`, …), or it
   is still `pendingPayment` but `paymentStatus` is `failed` or `expired`
   (offer to check out again, step 8). `paymentStatus: 'processing'` means
   the payment succeeded and the order is being updated: keep polling.
   `isOrderSettled(order)` in `@konfiqo/storefront-react` implements this
   rule. Do not send the token to analytics or logs.

8. **Failed payments.** A declined, failed or expired payment cancels the
   order, but the cart is **not** lost: the next `carts.get` or
   `carts.checkout` reopens it (`status: 'open'`) and checkout places a new
   order (new `orderId`, new `token`) with the same lines, buyer and
   addresses; the buyer re-enters nothing, including the identity number,
   which stays sealed on the cart until the order is paid or the cart
   expires. Calling checkout on an `ordered` cart whose payment is still
   pending re-opens the same payment (no new order). Stock is reserved for
   a pending order for up to 24 h.

9. **Secrets.** The publishable key is the only key that belongs in client
   code. The tenant API key, the operator key and the trusted storefront
   key are server secrets: never put them in a browser bundle, a mobile
   app or a public repository.

10. **Errors.** Map every code in the [table](#api-error-codes) to copy in
    your languages; never show `message` to buyers.
