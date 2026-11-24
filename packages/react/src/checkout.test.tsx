import { act, render, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import {
  cartIdKey,
  isStorefrontError,
  type CheckoutResult,
} from '@konfiqo/storefront-sdk';
import { useCart } from './use-cart';
import { useCheckout, type UseCheckoutResult } from './use-checkout';
import {
  apiError,
  deferred,
  makeCart,
  memoryStorage,
  mockClient,
  wrapper,
} from './test-utils';

const KEY = cartIdKey('store-1');
const embedded: CheckoutResult = {
  presentation: 'embedded',
  orderId: 'o1',
  orderNumber: '261115-ABC',
  token: 'tok-secret',
  embed: { kind: 'iyzico-checkout-form', content: '<div></div>' },
};

describe('useCheckout', () => {
  it('checks the cart out with the challenge token and exposes the result', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1'));
    client.carts.checkout.mockResolvedValue(embedded);
    const { result } = renderHook(() => useCheckout(), {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })),
    });
    let returned;
    await act(async () => {
      returned = await result.current.checkout({ turnstileToken: 'ts-1' });
    });
    expect(returned).toBe(embedded);
    expect(client.carts.checkout).toHaveBeenCalledWith('c1', {
      turnstileToken: 'ts-1',
    });
    expect(result.current).toMatchObject({
      isPending: false,
      result: embedded,
      error: null,
      attempts: 1,
    });
    // The cart is read again afterwards (now `ordered`).
    await waitFor(() => expect(client.carts.get).toHaveBeenCalled());
  });

  it('sends no token when none is given', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1'));
    client.carts.checkout.mockResolvedValue(embedded);
    const { result } = renderHook(() => useCheckout(), {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })),
    });
    await act(async () => {
      await result.current.checkout({ turnstileToken: null });
    });
    expect(client.carts.checkout).toHaveBeenCalledWith('c1', {
      turnstileToken: undefined,
    });
  });

  it('surfaces cart_changed with its typed extras and re-reads the cart', async () => {
    const client = mockClient();
    const changedCart = makeCart('c1', { totalMinor: 1200 });
    client.carts.get
      .mockResolvedValueOnce(makeCart('c1', { totalMinor: 1000 }))
      .mockResolvedValue(changedCart);
    client.carts.checkout.mockRejectedValue(
      apiError('cart_changed', 409, {
        lines: [],
        subtotalMinor: 1000,
        shippingMinor: 200,
        totalMinor: 1200,
        shippingOptions: [{ id: 'standard', priceMinor: 200 }],
      }),
    );
    const { result } = renderHook(
      () => ({ cart: useCart(), checkout: useCheckout() }),
      { wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })) },
    );
    await waitFor(() =>
      expect(result.current.cart.cart?.totalMinor).toBe(1000),
    );
    await act(async () => {
      await expect(result.current.checkout.checkout()).rejects.toMatchObject({
        code: 'cart_changed',
      });
    });
    const error = result.current.checkout.error;
    expect(isStorefrontError(error)).toBe(true);
    if (isStorefrontError(error) && error.code === 'cart_changed') {
      expect(error.details.totalMinor).toBe(1200);
      expect(error.details.shippingOptions[0]!.priceMinor).toBe(200);
    } else {
      throw new Error('expected cart_changed');
    }
    expect(result.current.checkout.result).toBeNull();
    await waitFor(() => expect(result.current.cart.cart).toBe(changedCart));
  });

  it('without a cart rejects with checkout_incomplete (missing lines)', async () => {
    const client = mockClient();
    const { result } = renderHook(() => useCheckout(), {
      wrapper: wrapper(client),
    });
    await act(async () => {
      await result.current.checkout().catch(() => {});
    });
    expect(result.current.error).toMatchObject({
      code: 'checkout_incomplete',
      details: { missing: ['lines'] },
    });
    expect(client.carts.checkout).not.toHaveBeenCalled();
  });

  it('a second call while one is in flight returns the same promise', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1'));
    const d = deferred<CheckoutResult>();
    client.carts.checkout.mockReturnValue(d.promise);
    const { result } = renderHook(() => useCheckout(), {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })),
    });
    let a!: Promise<CheckoutResult>;
    let b!: Promise<CheckoutResult>;
    act(() => {
      a = result.current.checkout();
      b = result.current.checkout();
    });
    expect(a).toBe(b);
    expect(result.current.isPending).toBe(true);
    await act(async () => {
      d.resolve(embedded);
      await a;
    });
    expect(client.carts.checkout).toHaveBeenCalledOnce();
  });

  it('is not aborted on unmount; a remount re-reads the cart and sees the result', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1'));
    const d = deferred<CheckoutResult>();
    client.carts.checkout.mockReturnValue(d.promise);
    const Wrapper = wrapper(client, memoryStorage({ [KEY]: 'c1' }));
    let latest: UseCheckoutResult | null = null;
    function Step() {
      latest = useCheckout();
      return null;
    }
    // The provider stays; the checkout step unmounts and comes back.
    const { rerender } = render(
      <Wrapper>
        <Step />
      </Wrapper>,
    );
    act(() => {
      void latest!.checkout().catch(() => {});
    });
    await waitFor(() => expect(client.carts.checkout).toHaveBeenCalled());
    const options = client.carts.checkout.mock.calls[0]![1]!;
    expect(options).not.toHaveProperty('signal');
    rerender(<Wrapper>{null}</Wrapper>);
    await act(async () => {
      d.resolve(embedded);
      await d.promise;
    });
    // The settled checkout re-reads the cart once…
    await waitFor(() => expect(client.carts.get).toHaveBeenCalledTimes(1));
    const readsBefore = 1;
    latest = null;
    rerender(
      <Wrapper>
        <Step />
      </Wrapper>,
    );
    // …and the remounted step reads it again.
    await waitFor(() =>
      expect(client.carts.get).toHaveBeenCalledTimes(readsBefore + 1),
    );
    expect(latest!.result).toBe(embedded);
  });

  it('a component unmounting does not abort a checkout in flight (separate tree)', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1'));
    const d = deferred<CheckoutResult>();
    client.carts.checkout.mockReturnValue(d.promise);
    const { result, unmount } = renderHook(() => useCheckout(), {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })),
    });
    let p!: Promise<CheckoutResult>;
    act(() => {
      p = result.current.checkout();
    });
    await waitFor(() => expect(client.carts.checkout).toHaveBeenCalled());
    unmount();
    d.resolve(embedded);
    await expect(p).resolves.toBe(embedded);
  });

  it('checkout and reset keep their identity across renders', () => {
    const client = mockClient();
    const { result, rerender } = renderHook(() => useCheckout(), {
      wrapper: wrapper(client),
    });
    const { checkout, reset } = result.current;
    rerender();
    expect(result.current.checkout).toBe(checkout);
    expect(result.current.reset).toBe(reset);
  });

  it('reset during a checkout in flight drops its result from the state', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1'));
    const d = deferred<CheckoutResult>();
    client.carts.checkout.mockReturnValue(d.promise);
    const { result } = renderHook(
      () => ({ cart: useCart(), checkout: useCheckout() }),
      { wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })) },
    );
    await waitFor(() => expect(result.current.cart.cart?.id).toBe('c1'));
    let p!: Promise<CheckoutResult>;
    act(() => {
      p = result.current.checkout.checkout();
    });
    await waitFor(() => expect(client.carts.checkout).toHaveBeenCalled());
    act(() => result.current.cart.reset());
    await act(async () => {
      d.resolve(embedded);
      await p;
    });
    expect(result.current.checkout.result).toBeNull();
    expect(result.current.checkout.isPending).toBe(false);
    expect(result.current.cart.cart).toBeNull();
  });

  it('reset clears result and error', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1'));
    client.carts.checkout.mockRejectedValue(
      apiError('checkout_in_progress', 409, undefined),
    );
    const { result } = renderHook(() => useCheckout(), {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })),
    });
    await act(async () => {
      await result.current.checkout().catch(() => {});
    });
    expect(result.current.error).toMatchObject({
      code: 'checkout_in_progress',
    });
    act(() => result.current.reset());
    expect(result.current.error).toBeNull();
    expect(result.current.attempts).toBe(1);
  });
});
