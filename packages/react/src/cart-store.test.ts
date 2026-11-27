import { describe, expect, it } from 'vitest';
import type { StorefrontClient } from '@konfiqo/storefront-sdk';
import { CartStore } from './cart-store';
import {
  apiError,
  deferred,
  makeCart,
  memoryStorage,
  mockClient,
} from './test-utils';

const HASH = 'b'.repeat(64);

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('CartStore', () => {
  it('a read queued behind a write makes no request once reads are aborted', async () => {
    const client = mockClient();
    const storage = memoryStorage({ 'storefront:cart:s': 'c1' });
    const store = new CartStore(
      () => client as unknown as StorefrontClient,
      's',
      () => storage,
    );
    const write = deferred<ReturnType<typeof makeCart>>();
    client.carts.addLine.mockReturnValue(write.promise);
    const w = store.addLine({ variantId: 'v1', quantity: 1 });
    const r = store.refresh();
    store.abortReads();
    write.resolve(makeCart('c1'));
    await w;
    await r;
    expect(client.carts.get).not.toHaveBeenCalled();
  });

  it('previousCartId is the saved id even when the cart was never read', async () => {
    const client = mockClient();
    const storage = memoryStorage({ 'storefront:cart:s': 'c1' });
    const store = new CartStore(
      () => client as unknown as StorefrontClient,
      's',
      () => storage,
    );
    client.carts.addLine.mockImplementation((id: string) =>
      id === 'c1'
        ? Promise.reject(apiError('cart_read_only', 409, { status: 'ordered' }))
        : Promise.resolve(makeCart(id)),
    );
    client.carts.create.mockResolvedValue(makeCart('c2'));
    await store.addLine({ variantId: 'v1', quantity: 1 });
    expect(store.getCart().previousCartId).toBe('c1');
  });

  it('reset while the cart is being created: the write is not run on the orphan cart', async () => {
    const client = mockClient();
    const storage = memoryStorage();
    const store = new CartStore(
      () => client as unknown as StorefrontClient,
      's',
      () => storage,
    );
    const created = deferred<ReturnType<typeof makeCart>>();
    client.carts.create.mockReturnValue(created.promise);
    client.carts.addLine.mockResolvedValue(makeCart('c9'));
    const w = store.addLine({ variantId: 'v1', quantity: 1 });
    await flush();
    expect(client.carts.create).toHaveBeenCalledOnce();
    store.reset();
    created.resolve(makeCart('c9'));
    await expect(w).rejects.toMatchObject({ code: 'aborted' });
    expect(client.carts.addLine).not.toHaveBeenCalled();
    expect(storage.data.size).toBe(0);
    expect(store.getCart().cart).toBeNull();
    expect(store.getCart().error).toBeNull();
  });

  it('a cart id changed in another tab keeps an in-flight checkout result', async () => {
    const client = mockClient();
    const storage = memoryStorage({ 'storefront:cart:s': 'c1' });
    const store = new CartStore(
      () => client as unknown as StorefrontClient,
      's',
      () => storage,
    );
    client.carts.get.mockImplementation((id: string) =>
      Promise.resolve(makeCart(id)),
    );
    const pending =
      deferred<Awaited<ReturnType<StorefrontClient['carts']['checkout']>>>();
    client.carts.checkout.mockReturnValue(pending.promise);
    const result = {
      presentation: 'redirect' as const,
      url: 'https://pay.test/x',
      orderId: 'o1',
      orderNumber: '261115-AAAAAA',
      token: 'tok',
    };
    const p = store.checkout({ agreementsHash: HASH });
    await flush();
    expect(client.carts.checkout).toHaveBeenCalledWith('c1', {
      agreementsHash: HASH,
      turnstileToken: undefined,
    });
    storage.data.set('storefront:cart:s', 'c2');
    store.syncFromStorage();
    pending.resolve(result);
    await p;
    await flush();
    expect(store.getCheckout().result).toBe(result);
    expect(store.getCheckout().isPending).toBe(false);
  });
});
