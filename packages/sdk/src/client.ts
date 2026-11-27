import { StorefrontError, errorFromResponse } from './errors';
import type {
  AddLineInput,
  AddressInput,
  Account,
  AccountProfileInput,
  AccountSession,
  Cart,
  CategoryList,
  CartAgreements,
  CheckoutResult,
  CustomerInput,
  Order,
  Product,
  ProductListQuery,
  ProductPage,
  SavedAddress,
  SavedAddressInput,
  ShippingOptionList,
  Store,
  StoreContent,
  UpdateLineInput,
} from './models';

/** Default request timeout, milliseconds. */
export const DEFAULT_TIMEOUT_MS = 15_000;

/** Header carrying the publishable key on every request. */
export const PUBLISHABLE_KEY_HEADER = 'x-konfiqo-publishable-key';
/** Header carrying the trusted storefront key (server-side only). */
export const STOREFRONT_KEY_HEADER = 'x-konfiqo-storefront-key';
/** Header carrying the store's server key (server-side only). */
export const SERVER_KEY_HEADER = 'x-konfiqo-server-key';
/** Header carrying the checkout challenge token (checkout only). */
export const TURNSTILE_TOKEN_HEADER = 'x-konfiqo-turnstile-token';
/** Header carrying the buyer's IP (only with a server key or the trusted storefront key). */
export const BUYER_IP_HEADER = 'x-konfiqo-buyer-ip';

/** Per-call options, accepted as the last argument of every method. */
export interface RequestOptions {
  /**
   * Aborts the request: it rejects with code `aborted`. Combined with the
   * client timeout (whichever comes first wins).
   */
  signal?: AbortSignal;
  /**
   * **Server-side only.** A `Cookie` header to forward, so a server-rendered
   * storefront can call the account routes as the buyer: pass the incoming
   * request's `cookie` header (or just `konfiqo_session=<value>`). Browsers
   * ignore a `Cookie` header set from script; there the session cookie rides
   * along automatically (`credentials: 'include'`).
   */
  cookie?: string;
}

/** Options of `account.requestCode`. */
export interface RequestCodeOptions extends RequestOptions {
  /**
   * The challenge token (Cloudflare Turnstile), required when the store
   * asks for one (`store.checkoutChallenge`). Single-use. Sent as
   * `x-konfiqo-turnstile-token`.
   */
  turnstileToken?: string;
}

/** Options of `carts.checkout`. */
export interface CheckoutOptions extends RequestOptions {
  /**
   * The `agreementsHash` of the {@link CartAgreements} the buyer was
   * shown (`carts.agreements`). Sent as the JSON body. Checkout refuses
   * with `agreements_changed` when the cart or a legal text changed since.
   */
  agreementsHash: string;
  /**
   * The checkout challenge token (Cloudflare Turnstile), required when
   * `store.checkoutChallenge` is set. Single-use: get a new one (reset the
   * widget) for every checkout call. Sent as `x-konfiqo-turnstile-token`.
   */
  turnstileToken?: string;
}

/** Options of {@link createStorefrontClient}. */
export interface StorefrontClientOptions {
  /**
   * The Storefront API base: `https://<store domain>/api` (or the relative
   * `/api` in a same-origin browser app). Requests go to `${baseUrl}/v1/...`,
   * so do not include `/v1`.
   */
  baseUrl: string;
  /** The store's publishable key (`pk_live_…` / `pk_test_…`). Public. */
  publishableKey: string;
  /** A `fetch` implementation; defaults to the global `fetch`. */
  fetch?: typeof fetch;
  /** Per-request timeout in milliseconds (default {@link DEFAULT_TIMEOUT_MS}). */
  timeoutMs?: number;
  /**
   * **Server-side only.** The shared storefront key that lets a server-side
   * renderer report the real buyer IP (`buyerIp`), so throttling and the
   * payment provider see the buyer instead of the server. Sent as
   * `x-konfiqo-storefront-key`. Constructing a client with it where
   * `window` exists throws: never ship this key to a browser.
   */
  trustedStorefrontKey?: string;
  /**
   * **Server-side only.** The store's own server key, minted by the store
   * operator. It lets the seller's server report the real buyer IP
   * (`buyerIp`). Sent as `x-konfiqo-server-key` next to the publishable
   * key. Needs `buyerIp`, cannot be combined with `trustedStorefrontKey`,
   * and constructing a client with it in a browser throws.
   */
  serverKey?: string;
  /**
   * The buyer's IP address, sent as `x-konfiqo-buyer-ip`. Required with
   * `serverKey` or `trustedStorefrontKey`, ignored without one. Create one
   * client per incoming request on the server.
   */
  buyerIp?: string;
}

/**
 * A typed client of the Storefront API (`/v1`).
 *
 * Every method returns the response body, or rejects with a
 * {@link StorefrontError}. Nothing is retried: whether to retry is the
 * caller's decision, because writes are not safely repeatable — in
 * particular `carts.checkout` on a cart whose order failed places a
 * **new** order, so a blind retry could open a second payment.
 */
export interface StorefrontClient {
  /**
   * `GET /v1/content/:key`: a piece of store content as a renderable
   * Markdoc tree. Rejects `content_not_found` (404) for an unknown key.
   */
  getContent(key: string, options?: RequestOptions): Promise<StoreContent>;
  /** Store information. */
  readonly store: {
    /** `GET /v1/store`: name, language, currency, logo, theme, contact, company details, shipping rules. */
    get(options?: RequestOptions): Promise<Store>;
  };
  /** Categories. */
  readonly categories: {
    /** `GET /v1/categories`: the active category tree. */
    list(options?: RequestOptions): Promise<CategoryList>;
  };
  /** Products. */
  readonly products: {
    /** `GET /v1/products`: a page of products, optionally filtered. */
    list(
      query?: ProductListQuery,
      options?: RequestOptions,
    ): Promise<ProductPage>;
    /** `GET /v1/products/:slug`. Rejects with `product_not_found`. */
    get(slug: string, options?: RequestOptions): Promise<Product>;
  };
  /** Carts. Every cart write answers the updated cart. */
  readonly carts: {
    /** `POST /v1/carts`: a new, empty cart. */
    create(options?: RequestOptions): Promise<Cart>;
    /**
     * `POST /v1/carts/recover`: turns the `t` token of an abandoned-cart
     * e-mail link into a **new** cart with the same lines (no buyer data).
     * Rejects `invalid_recovery_token` (400) or `cart_not_recoverable` (410:
     * the cart was ordered, expired or deleted).
     */
    recover(
      token: string,
      options?: RequestOptions,
    ): Promise<{ cartId: string }>;
    /** `GET /v1/carts/:id`. Also reopens a cart whose payment failed. */
    get(cartId: string, options?: RequestOptions): Promise<Cart>;
    /** `POST /v1/carts/:id/lines`: adds units of a variant. */
    addLine(
      cartId: string,
      input: AddLineInput,
      options?: RequestOptions,
    ): Promise<Cart>;
    /**
     * `PATCH /v1/carts/:id/lines/:lineId`: sets a line's quantity. `lineId`
     * is `CartLine.id`; a variant id still matches a line without text.
     */
    updateLine(
      cartId: string,
      lineId: string,
      input: UpdateLineInput,
      options?: RequestOptions,
    ): Promise<Cart>;
    /** `DELETE /v1/carts/:id/lines/:lineId`: removes a line (`CartLine.id`). */
    removeLine(
      cartId: string,
      lineId: string,
      options?: RequestOptions,
    ): Promise<Cart>;
    /** `PUT /v1/carts/:id/customer`: sets the buyer. */
    setCustomer(
      cartId: string,
      input: CustomerInput,
      options?: RequestOptions,
    ): Promise<Cart>;
    /** `PUT /v1/carts/:id/address`: sets the shipping (and billing) address. */
    setAddress(
      cartId: string,
      input: AddressInput,
      options?: RequestOptions,
    ): Promise<Cart>;
    /** `GET /v1/carts/:id/shipping-options`: the options this cart can use. */
    shippingOptions(
      cartId: string,
      options?: RequestOptions,
    ): Promise<ShippingOptionList>;
    /** `PUT /v1/carts/:id/shipping-option`: selects a shipping option by id. */
    setShippingOption(
      cartId: string,
      optionId: string,
      options?: RequestOptions,
    ): Promise<Cart>;
    /**
     * `POST /v1/carts/:id/agreements`: the order documents (preliminary
     * information and distance sales agreement) filled in with this cart,
     * and their hash. Show the documents, ask the buyer to accept them,
     * then pass the hash to `checkout`. Call it again after any change to
     * the cart. Refuses with `legal_not_confirmed` (the store takes no
     * orders yet) or `cart_incomplete`.
     */
    agreements(
      cartId: string,
      options?: RequestOptions,
    ): Promise<CartAgreements>;
    /**
     * `POST /v1/carts/:id/checkout`: places the order (or re-opens payment
     * for the cart's order) and answers how to present payment. Keep the
     * returned `token`: it is returned only once. Not retried.
     *
     * Aborting (`signal`) only stops waiting: the server may still place
     * the order. Read the cart again before showing a result.
     *
     * When `store.checkoutChallenge` is set, pass a fresh
     * `turnstileToken` (see `renderTurnstile`); tokens are single-use, so
     * reset the widget after every call. Re-opening payment on an already
     * ordered cart needs no token.
     *
     * `agreementsHash` is required (see `agreements`). On
     * `agreements_changed`, load the agreements again and show them.
     */
    checkout(cartId: string, options: CheckoutOptions): Promise<CheckoutResult>;
  };
  /** Buyer order status. */
  readonly orders: {
    /** `GET /v1/orders/:id?token=`: the order, for the buyer holding its token. */
    get(
      orderId: string,
      token: string,
      options?: RequestOptions,
    ): Promise<Order>;
  };
  /**
   * The signed-in buyer's account. Sign-in is by an e-mailed one-time code;
   * the session is an HttpOnly cookie (`konfiqo_session`) the API sets on the
   * store origin, so these calls send `credentials: 'include'`. On a server,
   * forward the buyer's cookie with the `cookie` call option.
   */
  readonly account: {
    /**
     * `POST /v1/account/code`: e-mails a 6-digit code. Resolves the same for
     * any address (202); rejects `too_many_code_requests` (429),
     * `challenge_required` / `challenge_failed`, `invalid_request`.
     */
    requestCode(email: string, options?: RequestCodeOptions): Promise<void>;
    /**
     * `POST /v1/account/session`: signs in with the code. A wrong, spent or
     * expired code rejects `invalid_code` (401).
     */
    signIn(
      email: string,
      code: string,
      options?: RequestOptions,
    ): Promise<AccountSession>;
    /** `DELETE /v1/account/session`: signs out (always succeeds). */
    signOut(options?: RequestOptions): Promise<void>;
    /**
     * `GET /v1/account[?page=]`: profile, saved addresses and a page of
     * orders (20 per page, newest first). Rejects `not_signed_in` (401).
     */
    get(page?: number, options?: RequestOptions): Promise<Account>;
    /**
     * `PUT /v1/account/profile`: saves name, surname and a Turkish mobile
     * phone. Creates the buyer's record on first save.
     */
    updateProfile(
      profile: AccountProfileInput,
      options?: RequestOptions,
    ): Promise<void>;
    /**
     * `PUT /v1/account/addresses`: replaces the saved addresses (at most 5,
     * at most one default). Resolves the list as stored (ids filled in).
     * Rejects `profile_required` (409) until a profile is saved.
     */
    saveAddresses(
      addresses: SavedAddressInput[],
      options?: RequestOptions,
    ): Promise<SavedAddress[]>;
  };
  /** Catalog images. */
  readonly media: {
    /**
     * The absolute URL of a storage key (product `image`, store `logo`,
     * theme `logo` / `favicon` / section `image`), usable in `<img src>`:
     * `${baseUrl}/v1/media/<key, each segment encoded>?pk=<publishable key>`.
     *
     * @throws TypeError (`invalid_path_segment`) when a key segment is
     * empty, `.` or `..`.
     */
    url(key: string): string;
  };
}

type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

/**
 * One encoded path segment. `encodeURIComponent` leaves `.` and `..` as
 * they are, and URL normalisation would turn them into another route, so
 * those (and an empty segment) are refused.
 */
function seg(v: string): string {
  if (typeof v !== 'string' || v === '' || v === '.' || v === '..') {
    throw new TypeError(
      `invalid_path_segment: ${JSON.stringify(v)} is not a valid path segment`,
    );
  }
  return encodeURIComponent(v);
}

/** Whether this host looks like a browser or a web worker. */
function isBrowserLike(): boolean {
  const g = globalThis as { importScripts?: unknown };
  return (
    typeof window !== 'undefined' ||
    typeof document !== 'undefined' ||
    (typeof self !== 'undefined' && typeof g.importScripts === 'function')
  );
}

/**
 * Creates a Storefront API client.
 *
 * @throws TypeError when `baseUrl` or `publishableKey` is empty, when
 * `serverKey` or `trustedStorefrontKey` is given without `buyerIp`, when
 * both keys are given together, or when either key is given in a
 * browser-like host (`window` or `document` defined, or a web worker).
 * Hosts that define `window` on a server (jsdom, Electron renderers,
 * React Native) are refused too: keep these keys in a plain server process.
 */
export function createStorefrontClient(
  options: StorefrontClientOptions,
): StorefrontClient {
  const baseUrl = options.baseUrl?.trim().replace(/\/+$/, '');
  if (!baseUrl)
    throw new TypeError('createStorefrontClient: baseUrl is required');
  const publishableKey = options.publishableKey?.trim();
  if (!publishableKey)
    throw new TypeError('createStorefrontClient: publishableKey is required');
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  if (!(timeoutMs > 0) || !Number.isFinite(timeoutMs)) {
    throw new TypeError(
      'createStorefrontClient: timeoutMs must be a positive number',
    );
  }

  const baseHeaders: Record<string, string> = {
    [PUBLISHABLE_KEY_HEADER]: publishableKey,
  };
  if (
    options.serverKey !== undefined &&
    options.trustedStorefrontKey !== undefined
  ) {
    throw new TypeError(
      'createStorefrontClient: serverKey and trustedStorefrontKey cannot be used together',
    );
  }
  if (options.serverKey !== undefined) {
    if (isBrowserLike()) {
      throw new TypeError(
        'createStorefrontClient: serverKey must never be used in a browser',
      );
    }
    const buyerIp = options.buyerIp?.trim();
    if (!buyerIp) {
      throw new TypeError(
        'createStorefrontClient: buyerIp is required with serverKey',
      );
    }
    baseHeaders[SERVER_KEY_HEADER] = options.serverKey;
    baseHeaders[BUYER_IP_HEADER] = buyerIp;
  }
  if (options.trustedStorefrontKey !== undefined) {
    if (isBrowserLike()) {
      throw new TypeError(
        'createStorefrontClient: trustedStorefrontKey is server-only and must never be used in a browser',
      );
    }
    const buyerIp = options.buyerIp?.trim();
    if (!buyerIp) {
      throw new TypeError(
        'createStorefrontClient: buyerIp is required with trustedStorefrontKey',
      );
    }
    baseHeaders[STOREFRONT_KEY_HEADER] = options.trustedStorefrontKey;
    baseHeaders[BUYER_IP_HEADER] = buyerIp;
  }

  async function request<T>(
    method: Method,
    path: () => string,
    body?: unknown,
    callOptions?: RequestOptions,
    extraHeaders: Record<string, string> = {},
    flags: { credentials?: boolean; emptyOk?: boolean } = {},
  ): Promise<T> {
    const url = `${baseUrl}${path()}`;
    const callerSignal = callOptions?.signal;
    if (callerSignal?.aborted) throw abortError(callerSignal);
    // Resolved per call (not at construction) so a polyfilled global works.
    // Called detached: a browser `fetch` must not be invoked on another `this`.
    const doFetch = options.fetch ?? globalThis.fetch;
    const headers: Record<string, string> = {
      ...baseHeaders,
      ...extraHeaders,
    };
    if (callOptions?.cookie) headers.cookie = callOptions.cookie;
    const init: RequestInit = { method, headers };
    if (flags.credentials) init.credentials = 'include';
    if (body !== undefined) {
      headers['content-type'] = 'application/json';
      init.body = JSON.stringify(body);
    }
    const controller = new AbortController();
    init.signal = controller.signal;
    let timedOut = false;
    // Raced as well as aborted: a custom `fetch` that ignores the signal
    // still cannot hold the caller past the timeout.
    let onTimeout: (e: StorefrontError) => void = () => {};
    const deadline = new Promise<never>((_, reject) => {
      onTimeout = reject;
    });
    deadline.catch(() => {});
    const timer = setTimeout(() => {
      timedOut = true;
      onTimeout(transportError(undefined, true, timeoutMs));
      controller.abort();
    }, timeoutMs);
    const onCallerAbort = () => {
      onTimeout(abortError(callerSignal!));
      controller.abort();
    };
    callerSignal?.addEventListener('abort', onCallerAbort, { once: true });

    try {
      let res: Response;
      let text: string;
      try {
        res = await Promise.race([doFetch(url, init), deadline]);
        text = await Promise.race([res.text(), deadline]);
      } catch (e) {
        if (e instanceof StorefrontError) throw e;
        throw transportError(e, timedOut, timeoutMs);
      }
      let parsed: unknown;
      let isJson = false;
      if (text !== '') {
        try {
          parsed = JSON.parse(text);
          isJson = true;
        } catch {
          parsed = undefined;
        }
      }
      if (!res.ok) throw errorFromResponse(res.status, parsed, res.headers);
      if (!isJson && flags.emptyOk && text === '') return undefined as T;
      if (!isJson) {
        throw new StorefrontError(
          'invalid_response',
          res.status,
          'Storefront API answered a non-JSON body',
          undefined,
        );
      }
      return parsed as T;
    } finally {
      clearTimeout(timer);
      callerSignal?.removeEventListener('abort', onCallerAbort);
    }
  }

  const get = <T>(path: () => string, options?: RequestOptions) =>
    request<T>('GET', path, undefined, options);
  const acct = { credentials: true } as const;
  const send = <T>(
    method: Method,
    path: string,
    body: unknown,
    o?: RequestOptions,
    extra: Record<string, string> = {},
    emptyOk = false,
  ) => request<T>(method, () => path, body, o, extra, { ...acct, emptyOk });
  const cart = (id: string) => `/v1/carts/${seg(id)}`;

  return {
    getContent: (key, o) =>
      get<StoreContent>(() => `/v1/content/${seg(key)}`, o),
    store: {
      get: (o) => get<Store>(() => '/v1/store', o),
    },
    categories: {
      list: (o) => get<CategoryList>(() => '/v1/categories', o),
    },
    products: {
      list: (query = {}, o) =>
        get<ProductPage>(() => {
          const params = new URLSearchParams();
          if (query.category !== undefined)
            params.set('category', query.category);
          if (query.q !== undefined) params.set('q', query.q);
          if (query.page !== undefined) params.set('page', String(query.page));
          if (query.pageSize !== undefined)
            params.set('pageSize', String(query.pageSize));
          const qs = params.toString();
          return `/v1/products${qs ? `?${qs}` : ''}`;
        }, o),
      get: (slug, o) => get<Product>(() => `/v1/products/${seg(slug)}`, o),
    },
    carts: {
      create: (o) => request<Cart>('POST', () => '/v1/carts', undefined, o),
      recover: (token, o) =>
        request<{ cartId: string }>(
          'POST',
          () => '/v1/carts/recover',
          { token },
          o,
        ),
      get: (cartId, o) => get<Cart>(() => cart(cartId), o),
      addLine: (cartId, input, o) =>
        request<Cart>(
          'POST',
          () => `${cart(cartId)}/lines`,
          {
            variantId: input.variantId,
            quantity: input.quantity,
            ...(input.personalization !== undefined && {
              personalization: input.personalization,
            }),
          },
          o,
        ),
      updateLine: (cartId, lineId, input, o) =>
        request<Cart>(
          'PATCH',
          () => `${cart(cartId)}/lines/${seg(lineId)}`,
          { quantity: input.quantity },
          o,
        ),
      removeLine: (cartId, lineId, o) =>
        request<Cart>(
          'DELETE',
          () => `${cart(cartId)}/lines/${seg(lineId)}`,
          undefined,
          o,
        ),
      setCustomer: (cartId, input, o) =>
        request<Cart>('PUT', () => `${cart(cartId)}/customer`, input, o),
      setAddress: (cartId, input, o) =>
        request<Cart>('PUT', () => `${cart(cartId)}/address`, input, o),
      shippingOptions: (cartId, o) =>
        get<ShippingOptionList>(() => `${cart(cartId)}/shipping-options`, o),
      setShippingOption: (cartId, optionId, o) =>
        request<Cart>(
          'PUT',
          () => `${cart(cartId)}/shipping-option`,
          { id: optionId },
          o,
        ),
      agreements: (cartId, o) =>
        request<CartAgreements>(
          'POST',
          () => `${cart(cartId)}/agreements`,
          undefined,
          o,
        ),
      checkout: async (cartId, o) => {
        // A request without a valid hash cannot succeed: refuse it here.
        const hash: unknown = o?.agreementsHash;
        if (typeof hash !== 'string' || !/^[0-9a-f]{64}$/i.test(hash)) {
          throw new StorefrontError(
            'invalid_request',
            0,
            'carts.checkout needs the agreementsHash of carts.agreements (64 hex characters)',
            {
              issues: [
                {
                  path: 'agreementsHash',
                  message:
                    'Must be the 64 hex characters from carts.agreements',
                },
              ],
            },
          );
        }
        return request<CheckoutResult>(
          'POST',
          () => `${cart(cartId)}/checkout`,
          { agreementsHash: o.agreementsHash },
          o,
          o.turnstileToken
            ? { [TURNSTILE_TOKEN_HEADER]: o.turnstileToken }
            : {},
        );
      },
    },
    orders: {
      get: (orderId, token, o) =>
        get<Order>(
          () => `/v1/orders/${seg(orderId)}?token=${encodeURIComponent(token)}`,
          o,
        ),
    },
    account: {
      requestCode: (email, o) =>
        send<void>(
          'POST',
          '/v1/account/code',
          { email },
          o,
          o?.turnstileToken
            ? { [TURNSTILE_TOKEN_HEADER]: o.turnstileToken }
            : {},
          true,
        ),
      signIn: (email, code, o) =>
        send<AccountSession>('POST', '/v1/account/session', { email, code }, o),
      signOut: (o) =>
        send<void>('DELETE', '/v1/account/session', undefined, o, {}, true),
      get: (page, o) =>
        send<Account>(
          'GET',
          page === undefined
            ? '/v1/account'
            : `/v1/account?page=${encodeURIComponent(String(page))}`,
          undefined,
          o,
        ),
      updateProfile: (profile, o) =>
        send<void>(
          'PUT',
          '/v1/account/profile',
          {
            name: profile.name,
            surname: profile.surname,
            phone: profile.phone,
          },
          o,
          {},
          true,
        ),
      saveAddresses: async (addresses, o) =>
        (
          await send<{ addresses: SavedAddress[] }>(
            'PUT',
            '/v1/account/addresses',
            { addresses },
            o,
          )
        ).addresses,
    },
    media: {
      url: (key) =>
        `${baseUrl}/v1/media/${key.split('/').map(seg).join('/')}?pk=${encodeURIComponent(publishableKey)}`,
    },
  };
}

/** The caller aborted the request (`options.signal`). */
function abortError(signal: AbortSignal): StorefrontError {
  return new StorefrontError(
    'aborted',
    0,
    'Storefront API request was aborted',
    undefined,
    { cause: signal.reason },
  );
}

/** A fetch / body-read failure as `timeout` or `network_error`. */
function transportError(
  e: unknown,
  timedOut: boolean,
  timeoutMs: number,
): StorefrontError {
  if (timedOut) {
    return new StorefrontError(
      'timeout',
      0,
      `Storefront API did not answer within ${timeoutMs} ms`,
      { timeoutMs },
      { cause: e },
    );
  }
  return new StorefrontError(
    'network_error',
    0,
    'Storefront API could not be reached',
    undefined,
    {
      cause: e,
    },
  );
}
