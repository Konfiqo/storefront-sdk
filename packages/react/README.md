# @konfiqo/storefront-react

React hooks and components for
[`@konfiqo/storefront-sdk`](https://www.npmjs.com/package/@konfiqo/storefront-sdk)
([source](https://github.com/Konfiqo/storefront-sdk/tree/main/packages/sdk)): a provider, read hooks for
the catalog, a shared cart with its writes, checkout, buyer order status,
the payment form and the checkout challenge.

- A thin layer over the SDK: every request is an SDK call, every error a
  `StorefrontError`. Read the SDK README for the API, error codes and the
  "build your own storefront" guide.
- No styling: components render a plain `<div>` you can give a `className`.
- No runtime dependencies. Peer dependencies: `@konfiqo/storefront-sdk`
  `^0.4.0` and `react` ≥ 18. Install the SDK yourself, so your code and this
  package share one copy (`isStorefrontError` also recognises errors from a
  second copy, but one copy keeps the bundle small).
- Server-rendering safe: nothing touches `window`, `document` or storage
  during render; requests start in effects.

```bash
npm install @konfiqo/storefront-react @konfiqo/storefront-sdk
```

## Provider

```tsx
import { StorefrontProvider } from '@konfiqo/storefront-react';

<StorefrontProvider
  storeId={storeId}
  config={{
    baseUrl: 'https://commerce.example.com',
    publishableKey: 'pk_live_…',
  }}
>
  <App />
</StorefrontProvider>;
```

| Prop          | Type                    | Description                                                                                                                                                                                                                                                                                            |
| ------------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `storeId`     | `string`                | Any string stable for this store (e.g. its publishable key, or one the operator gives you). Namespaces the saved cart id (`storefront:cart:<storeId>`).                                                                                                                                                |
| `config`      | `ClientConfig`          | The SDK's `StorefrontClientOptions` without `serverKey`, `trustedStorefrontKey` and `buyerIp` (the type is exported by this package). The provider also refuses those three at run time (it throws), because props of a client component reach the browser. Use them only in a server-side SDK client. |
| `client`      | `StorefrontClient`      | An existing client, instead of `config`.                                                                                                                                                                                                                                                               |
| `cartStorage` | `CartIdStorage \| null` | Where the cart id is kept. Default `defaultCartStorage()`: the `__Host-konfiqo_cart` cookie backed by `window.localStorage` (read lazily, never during render; see [Cart storage](#cart-storage)). `null`: in memory only. Any `{ getItem, setItem, removeItem }` works.                               |

Everything under one provider shares one cart: a header badge and the cart
page see the same state. The cart state is keyed by `storeId` only: a new
client (e.g. a `config.fetch` with a new identity) is picked up for the
next request without dropping the cart. With the default storage, a cart
id changed in another tab (`storage` event for this store's key) is
followed: the cart is read again (or cleared). `useStorefrontClient()`
returns the client for calls the hooks do not cover (e.g.
`client.media.url(key)`).

## Catalog hooks

Each returns `{ data, error, isLoading, refetch }`. Every read has its own
`AbortSignal`: changing a parameter or unmounting cancels the previous
read, and a stale answer never replaces a newer one.

| Hook                  | SDK call                | Notes                                                                                          |
| --------------------- | ----------------------- | ---------------------------------------------------------------------------------------------- |
| `useStore()`          | `store.get()`           | Currency, theme, legal texts, `checkoutChallenge`.                                             |
| `useCategories()`     | `categories.list()`     | The category tree.                                                                             |
| `useProducts(params)` | `products.list(params)` | `{ category?, q?, page?, pageSize? }`. Reads again when a value changes (not on a new object). |
| `useProduct(slug)`    | `products.get(slug)`    | `null` / empty slug: reads nothing. Unknown slug: `error.code === 'product_not_found'`.        |

```tsx
function Category({ slug }: { slug: string }) {
  const [page, setPage] = useState(1);
  const { data, error, isLoading } = useProducts({ category: slug, page });
  if (error) return <p>{t('errors.catalog')}</p>;
  if (isLoading || !data) return <Spinner />;
  return <Grid products={data.items} />;
}
```

In the Next.js App Router, prefer reading the catalog **on the server**
with the SDK directly (cacheable, no `Origin`); the hooks are for client
components.

## `useCart()`

```tsx
const {
  cart, // Cart | null — the server's view; null until the buyer has one
  status, // 'idle' (before the first read, and on the server) | 'loading' | 'ready'
  isUpdating, // a write is in progress
  error, // the last read / write error, or null
  previousCartId, // string | null — an ordered cart a write moved away from (see below)
  itemCount, // total units (for a badge)
  addLine, // ({ variantId, quantity, personalization? }) => Promise<Cart>
  updateLine, // (lineId, { quantity }) => Promise<Cart>, lineId = cart line `id`
  removeLine, // (lineId) => Promise<Cart>
  setCustomer, // (CustomerInput) => Promise<Cart>
  setAddress, // ({ shipping, billing? }) => Promise<Cart>
  setShippingOption, // (optionId) => Promise<Cart>
  shippingOptions, // (options?) => Promise<ShippingOptionList>, { items: [] } without a cart
  refresh, // () => Promise<void> — read the cart again
  reset, // () => void — forget the cart (e.g. after its order is paid)
} = useCart();
```

- **Lazy cart.** The saved cart id is read after mount. No cart is created
  until the first write: browsing never makes one. The new id is saved in
  `cartStorage`.
- **Server view only.** Every write answers the updated cart and replaces
  the state: prices and totals are never computed in the browser. Writes
  run one at a time in call order.
- **Errors.** A write rejects with the `StorefrontError` (and sets
  `error`); catch it where you call it:

  ```tsx
  try {
    await addLine({ variantId, quantity: 1 });
  } catch (e) {
    if (isStorefrontError(e) && e.code === 'insufficient_stock')
      showOnlyLeft(e.details.available);
  }
  ```

- **Expired or unknown cart.** `cart_not_found`, `cart_read_only` with
  `status: "expired"`, or a cart read as `expired`: the id is cleared and
  `cart` becomes `null`; the next write starts a new cart.
- **Ordered cart.** A **read** that answers `status: "ordered"` keeps the
  cart: show the order / payment state (its payment may still be open).
  A **write** that gets `cart_read_only` with `status: "ordered"` (the
  buyer keeps shopping after checking out) moves on: the ordered cart's id
  goes to `previousCartId` (offer "continue your payment" for it), a fresh
  cart is created and the write is replayed on it **once**; the promise
  resolves with the fresh cart. Call `reset()` once the order is paid
  (it also clears `previousCartId`).
- **`reset()`** wins over anything in flight: a read, write or checkout
  that started before it does not bring the old cart (or its checkout
  result) back, and does not save its id again. A write that was still
  creating the cart rejects with `aborted` and is not applied to that cart.
- **Another tab** changing the cart id drops reads and writes in flight on
  the old cart, but not a checkout in flight: its result (and the
  once-only `token`) is kept.
- **Failed payment.** Reading a cart whose payment failed reopens it on the
  server: after the buyer comes back, `refresh()` (or a fresh mount) shows
  `status: "open"` again and the buyer can check out again.

## Cart storage

- **`defaultCartStorage()`** — the provider's default storage (null on a
  server). `getItem` reads the `__Host-konfiqo_cart` cookie first and
  rewrites it on every read, renewing its expiry; when the cookie is gone
  (Safari keeps script-written cookies 7 days) it reads `localStorage` and
  writes the id back into the cookie. `setItem` writes both. `removeItem`
  clears both and writes a `storefront:cart:<storeId>:cleared` tombstone in
  `localStorage`; while it is there no frontend on the store origin restores
  the old id from `localStorage`. The next `setItem` removes it.
- **`useCartStorage()`** — a getter for the storage this provider uses
  (call it in an effect or handler, never during render). Use it to save a
  cart id learned out of band (`saveCartId(getStorage(), storeId, id)`) or
  to clear one (`clearCartId(getStorage(), storeId)`).
- Clear a cart only this way (or with `reset()`). Deleting the cookie by
  hand or with `cookieCartStorage()` alone writes no tombstone, and the
  hosted storefront restores the old cart from `localStorage`.

## `useCheckout()`

```tsx
const { checkout, isPending, result, error, attempts, reset } = useCheckout();

const result = await checkout({ turnstileToken }); // CheckoutResult
```

- Calls `carts.checkout(cartId, { turnstileToken })` for the provider's cart.
  Without a cart it rejects with `checkout_incomplete`
  (`details.missing: ['lines']`) without a request. A second call while one
  is in flight returns the same promise.
- **Never aborted.** The server may place the order even if the browser
  stops waiting, so a checkout keeps running when the component unmounts.
  The state lives in the provider: when a component using `useCheckout()`
  mounts again it sees the result, and the cart is read again. The cart is
  also read again after every checkout (now `ordered`, or the new prices).
- **Keep `result.token`.** It is returned only once (by the checkout that
  placed the order) and is the buyer's only key to `useOrder`. Build the
  order status URL from it; do not log it or send it to analytics.
- **Errors** are typed (switch on `error.code`; see the SDK README):

  ```tsx
  if (isStorefrontError(error)) {
    switch (error.code) {
      case 'cart_changed':
        // error.details: { lines, subtotalMinor, shippingMinor, totalMinor, shippingOptions }
        // Show the new totals and let the buyer confirm; then checkout() again.
        // Never re-submit silently.
        break;
      case 'out_of_stock': // error.details.variantIds
      case 'checkout_incomplete': // error.details.missing
      case 'invalid_buyer_details': // error.details.field
      case 'checkout_in_progress':
      case 'challenge_required':
      case 'challenge_failed':
      case 'too_many_open_orders':
      case 'payment_unavailable':
    }
  }
  ```

## `<PaymentForm>`

```tsx
{
  result && (
    <PaymentForm
      presentation={result}
      onClosed={(page) => router.push(orderStatusUrl)}
      onUnsupported={() => setFallback(true)}
      onError={() => setFallback(true)}
      className="payment"
    />
  );
}
```

Presents payment with the SDK's `mountPayment`: the provider's embedded
form inside the `<div>` (its scripts run once — also under React Strict
Mode, which mounts effects twice), a top-level redirect (`redirect`), or
`onClosed(page)` (`closed`: `paid`, `cancelled`, `processing`, …). The form
is removed on unmount.

- Pass the **unmodified result of `checkout()`**. Never build a
  presentation, `embed` or redirect `url` from user input, URL parameters
  or storage: the embedded content runs as script.
- Card data goes from the provider's form to the provider; it never
  touches your code. Never put a Konfiqo secret (a storefront key, an API
  key) in client code — the browser only ever needs the publishable key.

## `<CheckoutChallenge>`

When `store.checkoutChallenge` is set, checkout needs a Cloudflare
Turnstile token:

```tsx
const { data: store } = useStore();
const [token, setToken] = useState<string | null>(null);
const { checkout } = useCheckout();

<CheckoutChallenge
  siteKey={store?.checkoutChallenge?.siteKey}
  onToken={setToken}
  onExpired={() => setToken(null)}
  onError={() => setChallengeFailed(true)}
/>
<button
  disabled={!!store?.checkoutChallenge && !token}
  onClick={() => checkout({ turnstileToken: token })}
>
  {t('checkout.pay')}
</button>
```

- Uses the SDK's `renderTurnstile` (Cloudflare's official script, loaded
  once; a failed load can be retried by mounting again). Without a
  `siteKey` it renders an empty `<div>`.
- Tokens are **single-use**: under the provider the widget resets itself
  after every settled `useCheckout()` call and calls `onExpired` (drop the
  token; a new one arrives through `onToken`). To reset it yourself, use a
  ref: `ref.current.reset()`.
- On your own domain, it must be in the store's domains / allowed origins
  and in the widget's hostname list (see the SDK README).

## `useAccount()`

```tsx
const { account, status, error, refresh } = useAccount();
```

`status` is `loading` until the first read answers, `signedOut` on a 401, and
`signedIn` with the `Account` otherwise. Sign in / out and saves go through
`useStorefrontClient().account` (`requestCode`, `signIn`, `signOut`,
`updateProfile`, `saveAddresses`); call `refresh()` after each. A failure
other than 401 (network, timeout) sets `error` and keeps the last account.
The session is an HttpOnly cookie: use a same-origin `baseUrl`. For
server-side calls forward the buyer's `cookie` (see the SDK README).

## `useOrder(orderId, token, { pollUntilFinal })`

```tsx
// app/orders/[id]/page.tsx renders <OrderStatus id={id} token={token} />
const { order, error, isLoading, isPolling, refetch } = useOrder(id, token, {
  pollUntilFinal: true,
});
```

- Reads `orders.get(orderId, token)`. Missing `orderId` or `token`: reads
  nothing.
- `pollUntilFinal`: reads again with backoff — 2 s, 4 s, 8 s, then every
  15 s — until the order is settled (`isOrderSettled`): any status past
  `pendingPayment` (`paid`, `fulfilling`, `shipped`, `delivered`,
  `cancelled`, `refunded`, …), or a pending order whose payment `failed` /
  `expired` (the buyer checks out again). Transient errors
  (`network_error`, `timeout`, `rate_limited` — honouring `retryAfter` —,
  `order_unavailable`, `http_error`) keep polling and keep the last
  `order`; other errors (`order_not_found`) stop it. Unmounting stops
  polling and aborts the read.
- The token is the buyer's only key to the order: the hook never logs it.
  Do not send the page URL (which carries it) to analytics.

Also exported: `isOrderSettled(order)`, `orderPollDelay(attempt)`,
`ORDER_POLL_MIN_MS`, `ORDER_POLL_MAX_MS`, `isDeadCartError(e)`.

## Next.js App Router

- The package is marked `'use client'`: import the provider, hooks and
  components from client components. Put the provider in a small client
  component and render it from your (server) layout:

  ```tsx
  // app/providers.tsx
  'use client';
  import { StorefrontProvider } from '@konfiqo/storefront-react';

  export function Providers({
    storeId,
    publishableKey,
    children,
  }: {
    storeId: string;
    publishableKey: string;
    children: React.ReactNode;
  }) {
    return (
      <StorefrontProvider
        storeId={storeId}
        config={{
          baseUrl: process.env.NEXT_PUBLIC_COMMERCE_URL!,
          publishableKey,
        }}
      >
        {children}
      </StorefrontProvider>
    );
  }
  ```

- Read the catalog in server components with the SDK; use the hooks for
  the cart, checkout and the order status page (they run in the buyer's
  browser, whose origin must be in the store's `allowedOrigins`).
- On the server render, `useCart()` reports `status: 'idle'` and no cart;
  the saved cart is read after hydration. Render a neutral badge until
  `status === 'ready'` to avoid a layout jump.
