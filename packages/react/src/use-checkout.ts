import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { CheckoutResult } from '@konfiqo/storefront-sdk';
import type { CheckoutSnapshot } from './cart-store';
import { useOptionalStorefrontContext, useStorefrontContext } from './provider';

/** Options of `checkout()`. */
export interface CheckoutCallOptions {
  /**
   * The `agreementsHash` of the agreements the buyer was shown
   * (`client.carts.agreements(cartId)`). Required. A cart or legal text
   * that changed since makes checkout fail with `agreements_changed`.
   */
  agreementsHash: string;
  /**
   * The checkout challenge token (from `<CheckoutChallenge>`), required
   * when `store.checkoutChallenge` is set. Single-use.
   */
  turnstileToken?: string | null;
}

/** What {@link useCheckout} returns. */
export interface UseCheckoutResult extends CheckoutSnapshot {
  /**
   * Checks the cart out: `carts.checkout(cartId, { agreementsHash, turnstileToken })`.
   * Resolves with the result (present it with `<PaymentForm>`; keep its
   * `token`, returned only once) or rejects with the error (also in
   * `error`). A call while one is in flight returns the same promise.
   */
  checkout(options: CheckoutCallOptions): Promise<CheckoutResult>;
  /** Clears `result` and `error`. */
  reset(): void;
}

const SERVER_CHECKOUT: CheckoutSnapshot = {
  isPending: false,
  result: null,
  error: null,
  attempts: 0,
};

/**
 * Checkout for the provider's cart. The state is shared under the
 * provider, and a checkout is **never aborted** — not even when the
 * component unmounts — because the server may place the order anyway.
 * When a component using this hook mounts after a checkout was started,
 * the cart is read again so it shows what the server has.
 *
 * Errors are {@link StorefrontError}s: switch on `error.code`. For
 * `cart_changed`, `error.details` has the new `lines`, totals and
 * `shippingOptions` (the cart is also read again): show them and let the
 * buyer confirm before calling `checkout()` again — never retry silently.
 * For `agreements_changed`, load the agreements again, show the new texts
 * and call `checkout()` with the new `agreementsHash`.
 */
export function useCheckout(): UseCheckoutResult {
  const { cart: store } = useStorefrontContext();
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getCheckout,
    () => SERVER_CHECKOUT,
  );
  useEffect(() => {
    if (store.checkoutStarted) void store.refresh();
  }, [store]);
  const checkout = useCallback(
    (options: CheckoutCallOptions) =>
      store.checkout({
        agreementsHash: options.agreementsHash,
        turnstileToken: options.turnstileToken ?? undefined,
      }),
    [store],
  );
  return { ...snapshot, checkout, reset: store.clearCheckout };
}

/** Settled checkout attempts under the provider (0 outside one). Internal. */
export function useCheckoutAttempts(): number {
  const ctx = useOptionalStorefrontContext();
  const store = ctx?.cart;
  return useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.getCheckout().attempts ?? 0,
    () => 0,
  );
}

const noopSubscribe = () => () => {};
