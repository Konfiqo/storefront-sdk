import { useCallback, useEffect, useState } from 'react';
import { isStorefrontError, type Order } from '@konfiqo/storefront-sdk';
import type { StorefrontHookError } from './cart-store';
import { useStorefrontContext } from './provider';

/** First poll delay, milliseconds. */
export const ORDER_POLL_MIN_MS = 2_000;
/** Longest poll delay, milliseconds. */
export const ORDER_POLL_MAX_MS = 15_000;

/** The delay before poll number `attempt` (0-based): 2 s, 4 s, 8 s, then 15 s. */
export function orderPollDelay(attempt: number): number {
  return Math.min(ORDER_POLL_MIN_MS * 2 ** attempt, ORDER_POLL_MAX_MS);
}

/**
 * Whether an order no longer changes on its own soon: anything past
 * `pendingPayment` (`paid`, `fulfilling`, `shipped`, `delivered`,
 * `cancelled`, `refunded`, …), or a pending order whose payment `failed`
 * / `expired` (the buyer has to check out again).
 */
export function isOrderSettled(order: Order): boolean {
  if (order.status !== 'pendingPayment') return true;
  return order.paymentStatus === 'failed' || order.paymentStatus === 'expired';
}

/** Errors worth polling through (the service may answer next time). */
function isTransient(e: unknown): boolean {
  if (!isStorefrontError(e)) return false;
  switch (e.code) {
    case 'network_error':
    case 'timeout':
    case 'rate_limited':
    case 'order_unavailable':
    case 'http_error':
      return true;
    default:
      return false;
  }
}

/** Options of {@link useOrder}. */
export interface UseOrderOptions {
  /**
   * Keep reading until the order is settled ({@link isOrderSettled}),
   * backing off 2 s → 4 s → 8 s → 15 s (then every 15 s). Transient
   * errors (network, timeout, throttling, `order_unavailable`) keep
   * polling; others stop it.
   */
  pollUntilFinal?: boolean;
}

/** What {@link useOrder} returns. */
export interface UseOrderResult {
  /** The order, or null before it arrives. Kept through a failed poll. */
  order: Order | null;
  /** The last read's error, or null. */
  error: StorefrontHookError | null;
  /** The first read is in progress. */
  isLoading: boolean;
  /** Another read is scheduled. */
  isPolling: boolean;
  /** Reads again now (and restarts polling). */
  refetch: () => void;
}

interface State {
  key: string | null;
  order: Order | null;
  error: StorefrontHookError | null;
  isPolling: boolean;
}

/**
 * The buyer's order (`orders.get(orderId, token)`), e.g. on the page the
 * payment provider returns to (`/orders/{orderId}?token=`). The token is
 * the buyer's only key to the order: this hook never logs it or puts it
 * anywhere but the request; do not send it to analytics either.
 */
export function useOrder(
  orderId: string | null | undefined,
  token: string | null | undefined,
  options: UseOrderOptions = {},
): UseOrderResult {
  const { client } = useStorefrontContext();
  const poll = options.pollUntilFinal ?? false;
  const key = orderId && token ? `${orderId} ${token}` : null;
  const [state, setState] = useState<State>({
    key: null,
    order: null,
    error: null,
    isPolling: false,
  });
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (!orderId || !token) {
      setState({ key: null, order: null, error: null, isPolling: false });
      return;
    }
    const k = `${orderId} ${token}`;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;
    const schedule = (atLeastMs: number) => {
      const delay = Math.max(orderPollDelay(attempt++), atLeastMs);
      setState((s) => ({ ...s, isPolling: true }));
      timer = setTimeout(tick, delay);
    };
    const tick = async () => {
      try {
        const order = await client.orders.get(orderId, token, {
          signal: controller.signal,
        });
        if (controller.signal.aborted) return;
        setState({ key: k, order, error: null, isPolling: false });
        if (poll && !isOrderSettled(order)) schedule(0);
      } catch (e) {
        if (controller.signal.aborted) return;
        const error =
          e instanceof Error
            ? (e as StorefrontHookError)
            : new Error(String(e));
        setState((s) => ({
          key: k,
          order: s.key === k ? s.order : null,
          error,
          isPolling: false,
        }));
        if (poll && isTransient(e)) {
          const retryAfter =
            isStorefrontError(e) && e.code === 'rate_limited'
              ? (e.details.retryAfter ?? 0) * 1000
              : 0;
          schedule(retryAfter);
        }
      }
    };
    void tick();
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [client, orderId, token, poll, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  if (state.key !== key) {
    return {
      order: null,
      error: null,
      isLoading: key !== null,
      isPolling: false,
      refetch,
    };
  }
  return {
    order: state.order,
    error: state.error,
    isLoading: false,
    isPolling: state.isPolling,
    refetch,
  };
}
