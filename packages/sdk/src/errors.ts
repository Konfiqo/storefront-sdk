import type { CartLine, ShippingOption } from './models';

/** `checkout_incomplete`: what the cart still lacks. */
export type CheckoutMissing =
  | 'lines'
  | 'customer'
  | 'identityNumber'
  | 'shippingAddress'
  | 'shippingOption';

/**
 * `invalid_buyer_details`: the buyer detail the payment provider refused.
 * Address fields come as `shippingAddress.<field>` / `billingAddress.<field>`.
 */
export type BuyerDetailField =
  | 'name'
  | 'surname'
  | 'email'
  | 'phone'
  | 'identityNumber'
  | `shippingAddress.${string}`
  | `billingAddress.${string}`;

/** One validation problem of an `invalid_request`. */
export interface ValidationIssue {
  /** Dotted path of the field (`phone`, `shipping.city`, …). */
  path: string;
  /** What is wrong with it (never echoes the submitted value). */
  message: string;
}

/**
 * The extras each error code carries (`StorefrontError.details`). Codes
 * not listed here carry no details (`undefined`).
 */
export interface StorefrontErrorDetailsMap {
  /** Prices or shipping changed: show the new totals, then check out again. */
  cart_changed: {
    lines: CartLine[];
    subtotalMinor: number;
    shippingMinor: number;
    totalMinor: number;
    shippingOptions: ShippingOption[];
  };
  /**
   * A personalization text is refused (400, no details) or, at checkout
   * (409), a line's stored text no longer satisfies the product's rule:
   * `lineIds` are those lines. Remove the line and add it again with a
   * valid text.
   */
  invalid_personalization: { lineIds?: string[] };
  /** These variants cannot be bought (no longer sold, or not enough units). */
  out_of_stock: { variantIds: string[] };
  /** Collect what is missing, then check out again. */
  checkout_incomplete: { missing: CheckoutMissing[] };
  /** Let the buyer fix `field`, then check out again. */
  invalid_buyer_details: { field: BuyerDetailField };
  /** Only `available` units can be added. */
  insufficient_stock: { available: number };
  /** The request body or query failed validation. */
  invalid_request: { issues: ValidationIssue[] };
  /** The cart can no longer change: start a new cart. */
  cart_read_only: { status: 'ordered' | 'expired' };
  /** Throttled. `retryAfter` = seconds to wait, when the response said so. */
  rate_limited: { retryAfter?: number };
  /** No response within `timeoutMs`. */
  timeout: { timeoutMs: number };
  /** The server answered an error code this SDK version does not know. */
  unknown_error: { error: string | null };
}

/** Error codes of the Storefront API (the `error` field of an error response). */
export type StorefrontApiErrorCode =
  | 'store_not_found'
  | 'origin_not_allowed'
  | 'invalid_request'
  | 'invalid_buyer_ip'
  | 'catalog_unavailable'
  | 'product_not_found'
  | 'content_not_found'
  | 'cart_not_found'
  | 'variant_not_found'
  | 'line_not_found'
  | 'insufficient_stock'
  | 'quantity_out_of_range'
  | 'too_many_lines'
  | 'invalid_shipping_option'
  | 'cart_read_only'
  | 'checkout_in_progress'
  | 'checkout_incomplete'
  // 409: the store has not confirmed its legal texts yet (no orders).
  | 'legal_not_confirmed'
  // 409: the cart or a legal text changed since `carts.agreements`: load them again.
  | 'agreements_changed'
  // 409: the cart lacks lines, customer or address, so there is nothing to agree to.
  | 'cart_incomplete'
  | 'cart_changed'
  | 'invalid_personalization'
  | 'out_of_stock'
  | 'amount_out_of_range'
  | 'nothing_to_pay'
  | 'invalid_buyer_details'
  | 'payment_unavailable'
  | 'checkout_unavailable'
  | 'order_not_found'
  | 'order_unavailable'
  | 'media_not_found'
  | 'media_unavailable'
  | 'challenge_required'
  | 'challenge_failed'
  | 'challenge_unavailable'
  | 'too_many_open_orders'
  | 'not_signed_in'
  | 'invalid_code'
  | 'profile_required'
  | 'too_many_code_requests'
  | 'invalid_recovery_token'
  | 'cart_not_recoverable'
  | 'unavailable';

/**
 * Codes the SDK assigns itself:
 * - `rate_limited` — HTTP 429 without a known `error` code (the throttler);
 * - `unauthorized` — HTTP 401 without a code (a wrong `trustedStorefrontKey`);
 * - `http_error` — any other non-2xx response without an `error` code;
 * - `unknown_error` — an `error` code this SDK version does not know (in `details.error`);
 * - `invalid_response` — a 2xx response that is not JSON;
 * - `network_error` — no readable response: the API was unreachable (DNS,
 *   TLS, offline), or, in a browser, the origin is allowed by no store;
 * - `timeout` — no response within `timeoutMs`;
 * - `aborted` — the caller's `signal` aborted the request.
 */
export type StorefrontClientErrorCode =
  | 'rate_limited'
  | 'unauthorized'
  | 'http_error'
  | 'unknown_error'
  | 'invalid_response'
  | 'network_error'
  | 'timeout'
  | 'aborted';

/** Every code a {@link StorefrontError} can have. */
export type StorefrontErrorCode =
  StorefrontApiErrorCode | StorefrontClientErrorCode;

/** The `details` type of an error code (`undefined` for codes without extras). */
export type StorefrontErrorDetails<C extends StorefrontErrorCode> =
  C extends keyof StorefrontErrorDetailsMap
    ? StorefrontErrorDetailsMap[C]
    : undefined;

const API_CODES: ReadonlySet<string> = new Set<StorefrontApiErrorCode>([
  'store_not_found',
  'origin_not_allowed',
  'invalid_request',
  'invalid_buyer_ip',
  'catalog_unavailable',
  'product_not_found',
  'content_not_found',
  'cart_not_found',
  'variant_not_found',
  'line_not_found',
  'insufficient_stock',
  'quantity_out_of_range',
  'too_many_lines',
  'invalid_shipping_option',
  'cart_read_only',
  'checkout_in_progress',
  'checkout_incomplete',
  'legal_not_confirmed',
  'agreements_changed',
  'cart_incomplete',
  'cart_changed',
  'invalid_personalization',
  'out_of_stock',
  'amount_out_of_range',
  'nothing_to_pay',
  'invalid_buyer_details',
  'payment_unavailable',
  'checkout_unavailable',
  'order_not_found',
  'order_unavailable',
  'media_not_found',
  'media_unavailable',
  'challenge_required',
  'challenge_failed',
  'challenge_unavailable',
  'too_many_open_orders',
  'not_signed_in',
  'invalid_code',
  'profile_required',
  'too_many_code_requests',
  'invalid_recovery_token',
  'cart_not_recoverable',
  'unavailable',
]);

/**
 * Marks every {@link StorefrontError}. A global (`Symbol.for`) symbol, so
 * an error thrown by one installed copy of the SDK is recognised by another
 * (e.g. the React package resolving its own copy), where `instanceof` fails.
 */
const ERROR_BRAND = Symbol.for('@konfiqo/storefront-sdk/error');

/**
 * Every failure of a client call: an API error response, a throttle, a
 * timeout or a transport failure. Switch on `code`, never on `message`.
 *
 * To get `details` typed per code, narrow with {@link isStorefrontError}
 * (which yields the {@link AnyStorefrontError} union) and `switch (e.code)`,
 * or test one code with `e.is('cart_changed')`.
 */
export class StorefrontError<
  C extends StorefrontErrorCode = StorefrontErrorCode,
> extends Error {
  /** The API `error` code, or one of the SDK's own codes. */
  readonly code: C;
  /** HTTP status; `0` when no response arrived (`network_error`, `timeout`). */
  readonly status: number;
  /** The code's extras (see {@link StorefrontErrorDetailsMap}). */
  readonly details: StorefrontErrorDetails<C>;

  /**
   * @param code - the error code
   * @param status - the HTTP status (`0` without a response)
   * @param message - a human-readable description (not for display logic)
   * @param details - the code's extras
   * @param options - `cause`: the underlying error, if any
   */
  constructor(
    code: C,
    status: number,
    message: string,
    details: StorefrontErrorDetails<C>,
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = 'StorefrontError';
    this.code = code;
    this.status = status;
    this.details = details;
    Object.defineProperty(this, ERROR_BRAND, { value: true });
  }

  /** Whether this error has `code`; narrows `details` to that code's extras. */
  is<K extends StorefrontErrorCode>(code: K): this is StorefrontError<K> {
    return (this.code as StorefrontErrorCode) === code;
  }
}

/**
 * The union of {@link StorefrontError} by code: after narrowing `code`
 * (e.g. in a `switch`), `details` has that code's type.
 */
export type AnyStorefrontError = {
  [C in StorefrontErrorCode]: StorefrontError<C>;
}[StorefrontErrorCode];

/**
 * Whether `e` is a {@link StorefrontError}, as the code-discriminated union.
 * Also true for an error from another copy of this SDK (checked by a global
 * brand, not only `instanceof`).
 */
export function isStorefrontError(e: unknown): e is AnyStorefrontError {
  return (
    e instanceof StorefrontError ||
    (typeof e === 'object' &&
      e !== null &&
      (e as Record<symbol, unknown>)[ERROR_BRAND] === true)
  );
}

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Seconds from a `Retry-After` value (delta-seconds or an HTTP date). */
function parseRetryAfter(value: string | null): number | undefined {
  if (value === null) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed);
  const at = Date.parse(trimmed);
  if (Number.isNaN(at)) return undefined;
  return Math.max(0, Math.ceil((at - Date.now()) / 1000));
}

/**
 * Builds the error for a non-2xx response from its status, body (parsed
 * JSON, or undefined) and headers. Internal.
 */
export function errorFromResponse(
  status: number,
  body: unknown,
  headers: Headers,
): AnyStorefrontError {
  const b = isObject(body) ? body : {};
  const message =
    typeof b.message === 'string' && b.message !== ''
      ? b.message
      : `Storefront API request failed (HTTP ${status})`;

  const error = typeof b.error === 'string' ? b.error : null;
  // A 429 with a known code (`too_many_open_orders`) is that code; the
  // throttler's 429 carries none.
  if (status === 429 && (error === null || !API_CODES.has(error))) {
    // The throttler names its header per limit (`Retry-After`,
    // `Retry-After-ip`); when both come, the longer wait is the real one.
    const waits = [
      parseRetryAfter(headers.get('retry-after')),
      parseRetryAfter(headers.get('retry-after-ip')),
    ].filter((w): w is number => w !== undefined);
    const retryAfter = waits.length > 0 ? Math.max(...waits) : undefined;
    return new StorefrontError(
      'rate_limited',
      status,
      message,
      retryAfter === undefined ? {} : { retryAfter },
    );
  }

  if (error === null) {
    if (status === 401)
      return new StorefrontError('unauthorized', status, message, undefined);
    return new StorefrontError('http_error', status, message, undefined);
  }
  if (!API_CODES.has(error)) {
    return new StorefrontError('unknown_error', status, message, { error });
  }
  const code = error as StorefrontApiErrorCode;
  return apiError(code, status, message, b);
}

const arr = <T>(v: unknown): T[] => (Array.isArray(v) ? (v as T[]) : []);
const n = (v: unknown): number => (typeof v === 'number' ? v : 0);

function apiError(
  code: StorefrontApiErrorCode,
  status: number,
  message: string,
  b: Record<string, unknown>,
): AnyStorefrontError {
  switch (code) {
    case 'cart_changed':
      return new StorefrontError(code, status, message, {
        lines: arr<CartLine>(b.lines),
        subtotalMinor: n(b.subtotalMinor),
        shippingMinor: n(b.shippingMinor),
        totalMinor: n(b.totalMinor),
        shippingOptions: arr<ShippingOption>(b.shippingOptions),
      });
    case 'invalid_personalization':
      return new StorefrontError(
        code,
        status,
        message,
        Array.isArray(b.lineIds) ? { lineIds: arr<string>(b.lineIds) } : {},
      );
    case 'out_of_stock':
      return new StorefrontError(code, status, message, {
        variantIds: arr<string>(b.variantIds),
      });
    case 'checkout_incomplete':
      return new StorefrontError(code, status, message, {
        missing: arr<CheckoutMissing>(b.missing),
      });
    case 'invalid_buyer_details':
      return new StorefrontError(code, status, message, {
        field: String(b.field ?? '') as BuyerDetailField,
      });
    case 'insufficient_stock':
      return new StorefrontError(code, status, message, {
        available: n(b.available),
      });
    case 'invalid_request':
      return new StorefrontError(code, status, message, {
        issues: arr<ValidationIssue>(b.issues),
      });
    case 'cart_read_only':
      return new StorefrontError(code, status, message, {
        status: b.status === 'ordered' ? 'ordered' : 'expired',
      });
    default:
      return new StorefrontError(
        code,
        status,
        message,
        undefined,
      ) as AnyStorefrontError;
  }
}
