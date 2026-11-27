import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Order } from '@konfiqo/storefront-sdk';
import { isOrderSettled, orderPollDelay, useOrder } from './use-order';
import { apiError, mockClient, wrapper } from './test-utils';

const order = (patch: Partial<Order> = {}): Order => ({
  id: 'o1',
  orderNumber: '261115-ABC',
  status: 'pendingPayment',
  paymentStatus: 'pending',
  currency: 'TRY',
  subtotalMinor: 1000,
  shippingMinor: 0,
  totalMinor: 1000,
  placedAt: null,
  shippingAddress: null,
  billingAddress: null,
  lines: [],
  shipments: [],
  agreements: [],
  ...patch,
});

const flush = () => act(async () => {});
const advance = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('orderPollDelay / isOrderSettled', () => {
  it('backs off 2s → 4s → 8s → 15s and stays at 15s', () => {
    expect([0, 1, 2, 3, 4, 10].map(orderPollDelay)).toEqual([
      2000, 4000, 8000, 15000, 15000, 15000,
    ]);
  });

  it('settles past pendingPayment or on a failed / expired payment', () => {
    for (const status of [
      'paid',
      'fulfilling',
      'shipped',
      'delivered',
      'cancelled',
      'refunded',
      'partiallyRefunded',
    ]) {
      expect(isOrderSettled(order({ status }))).toBe(true);
    }
    expect(isOrderSettled(order())).toBe(false);
    expect(isOrderSettled(order({ paymentStatus: 'processing' }))).toBe(false);
    expect(isOrderSettled(order({ paymentStatus: 'failed' }))).toBe(true);
    expect(isOrderSettled(order({ paymentStatus: 'expired' }))).toBe(true);
  });
});

describe('useOrder', () => {
  it('reads the order once without polling', async () => {
    const client = mockClient();
    client.orders.get.mockResolvedValue(order());
    const { result } = renderHook(() => useOrder('o1', 'tok-secret'), {
      wrapper: wrapper(client),
    });
    expect(result.current.isLoading).toBe(true);
    await flush();
    expect(result.current.order?.status).toBe('pendingPayment');
    expect(result.current.isPolling).toBe(false);
    expect(client.orders.get).toHaveBeenCalledWith(
      'o1',
      'tok-secret',
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    await advance(60_000);
    expect(client.orders.get).toHaveBeenCalledOnce();
  });

  it('polls with backoff until the order is paid, then stops', async () => {
    const client = mockClient();
    client.orders.get
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(order({ paymentStatus: 'processing' }))
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(order())
      .mockResolvedValueOnce(
        order({ status: 'paid', paymentStatus: 'succeeded' }),
      );
    const { result } = renderHook(
      () => useOrder('o1', 'tok-secret', { pollUntilFinal: true }),
      { wrapper: wrapper(client) },
    );
    await flush();
    expect(client.orders.get).toHaveBeenCalledTimes(1);
    expect(result.current.isPolling).toBe(true);
    // Each delay: nothing just before it, one read at it.
    for (const [delay, calls] of [
      [2000, 2],
      [4000, 3],
      [8000, 4],
      [15000, 5],
    ] as const) {
      await advance(delay - 1);
      expect(client.orders.get).toHaveBeenCalledTimes(calls - 1);
      await advance(1);
      expect(client.orders.get).toHaveBeenCalledTimes(calls);
    }
    expect(result.current.order?.status).toBe('paid');
    expect(result.current.isPolling).toBe(false);
    await advance(120_000);
    expect(client.orders.get).toHaveBeenCalledTimes(5);
  });

  it.each(['cancelled', 'refunded', 'delivered'])(
    'stops at %s',
    async (status) => {
      const client = mockClient();
      client.orders.get.mockResolvedValue(order({ status }));
      renderHook(() => useOrder('o1', 't', { pollUntilFinal: true }), {
        wrapper: wrapper(client),
      });
      await flush();
      await advance(60_000);
      expect(client.orders.get).toHaveBeenCalledOnce();
    },
  );

  it('keeps polling through transient errors, keeping the last order', async () => {
    const client = mockClient();
    client.orders.get
      .mockResolvedValueOnce(order())
      .mockRejectedValueOnce(apiError('network_error', 0, undefined))
      .mockRejectedValueOnce(apiError('rate_limited', 429, { retryAfter: 30 }))
      .mockResolvedValueOnce(order({ status: 'paid' }));
    const { result } = renderHook(
      () => useOrder('o1', 't', { pollUntilFinal: true }),
      { wrapper: wrapper(client) },
    );
    await flush();
    await advance(2000);
    expect(result.current.error).toMatchObject({ code: 'network_error' });
    expect(result.current.order?.status).toBe('pendingPayment');
    await advance(4000);
    expect(result.current.error).toMatchObject({ code: 'rate_limited' });
    // Retry-After (30 s) beats the 8 s backoff.
    await advance(29_000);
    expect(client.orders.get).toHaveBeenCalledTimes(3);
    await advance(1000);
    expect(client.orders.get).toHaveBeenCalledTimes(4);
    expect(result.current.order?.status).toBe('paid');
    expect(result.current.error).toBeNull();
  });

  it('stops on a non-transient error', async () => {
    const client = mockClient();
    client.orders.get.mockRejectedValue(
      apiError('order_not_found', 404, undefined),
    );
    const { result } = renderHook(
      () => useOrder('o1', 'bad', { pollUntilFinal: true }),
      { wrapper: wrapper(client) },
    );
    await flush();
    expect(result.current.error).toMatchObject({ code: 'order_not_found' });
    expect(result.current.isLoading).toBe(false);
    await advance(60_000);
    expect(client.orders.get).toHaveBeenCalledOnce();
  });

  it('stops polling and aborts on unmount', async () => {
    const client = mockClient();
    client.orders.get.mockResolvedValue(order());
    const { unmount } = renderHook(
      () => useOrder('o1', 't', { pollUntilFinal: true }),
      { wrapper: wrapper(client) },
    );
    await flush();
    const signal = client.orders.get.mock.calls[0]![2]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
    await advance(60_000);
    expect(client.orders.get).toHaveBeenCalledOnce();
  });

  it('reads nothing without an id or token', async () => {
    const client = mockClient();
    const { result } = renderHook(() => useOrder('o1', null), {
      wrapper: wrapper(client),
    });
    await flush();
    expect(result.current).toMatchObject({ order: null, isLoading: false });
    expect(client.orders.get).not.toHaveBeenCalled();
  });

  it('never logs the token', async () => {
    const spies = (['log', 'info', 'warn', 'error', 'debug'] as const).map(
      (m) => vi.spyOn(console, m),
    );
    const client = mockClient();
    client.orders.get
      .mockResolvedValueOnce(order())
      .mockRejectedValueOnce(apiError('network_error', 0, undefined))
      .mockRejectedValueOnce(apiError('order_not_found', 404, undefined));
    renderHook(() => useOrder('o1', 'tok-secret', { pollUntilFinal: true }), {
      wrapper: wrapper(client),
    });
    await flush();
    await advance(10_000);
    for (const spy of spies) {
      expect(JSON.stringify(spy.mock.calls)).not.toContain('tok-secret');
    }
  });
});
