import { act, renderHook, waitFor } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { cartIdKey, type StorefrontClient } from '@konfiqo/storefront-sdk';
import { StorefrontProvider } from './provider';
import { defaultCartStorage } from './cart-store';
import { useCart } from './use-cart';
import {
  apiError,
  deferred,
  makeCart,
  memoryStorage,
  mockClient,
  wrapper,
} from './test-utils';

const KEY = cartIdKey('store-1');
const line = (variantId: string, quantity: number) => ({
  id: variantId,
  variantId,
  quantity,
  personalization: null,
  personalizationValid: true,
  purchasable: true,
  inStock: true,
  productId: 'p',
  productSlug: 'tee',
  productName: 'Tee',
  variantTitle: null,
  sku: 'SKU',
  unitPriceMinor: 100,
  lineTotalMinor: 100 * quantity,
});

describe('useCart', () => {
  it('without a saved id: ready, no cart, no request', async () => {
    const client = mockClient();
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.cart).toBeNull();
    expect(result.current.itemCount).toBe(0);
    expect(client.carts.get).not.toHaveBeenCalled();
    expect(client.carts.create).not.toHaveBeenCalled();
  });

  it('passes the personalization text of addLine through', async () => {
    const client = mockClient();
    client.carts.create.mockResolvedValue(makeCart('c1'));
    client.carts.addLine.mockResolvedValue(makeCart('c1'));
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, memoryStorage()),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    await act(async () => {
      await result.current.addLine({
        variantId: 'v1',
        quantity: 1,
        personalization: 'Sarı',
      });
    });
    expect(client.carts.addLine).toHaveBeenCalledWith('c1', {
      variantId: 'v1',
      quantity: 1,
      personalization: 'Sarı',
    });
  });

  it('creates the cart lazily on the first write and persists its id', async () => {
    const client = mockClient();
    const storage = memoryStorage();
    client.carts.create.mockResolvedValue(makeCart('c1'));
    const withLine = makeCart('c1', { lines: [line('v1', 2)] });
    client.carts.addLine.mockResolvedValue(withLine);
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    let returned;
    await act(async () => {
      returned = await result.current.addLine({ variantId: 'v1', quantity: 2 });
    });
    expect(returned).toBe(withLine);
    expect(client.carts.create).toHaveBeenCalledOnce();
    expect(client.carts.addLine).toHaveBeenCalledWith('c1', {
      variantId: 'v1',
      quantity: 2,
    });
    expect(storage.data.get(KEY)).toBe('c1');
    expect(result.current.cart).toBe(withLine);
    expect(result.current.itemCount).toBe(2);
    expect(result.current.isUpdating).toBe(false);
  });

  it('loads the saved cart', async () => {
    const client = mockClient();
    const cart = makeCart('c9', { lines: [line('v1', 1)] });
    client.carts.get.mockResolvedValue(cart);
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c9' })),
    });
    await waitFor(() => expect(result.current.cart).toBe(cart));
    expect(client.carts.get.mock.calls[0]![0]).toBe('c9');
    expect(client.carts.get.mock.calls[0]![1]!.signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it('every write replaces the state with the server view, in call order', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1'));
    const a = deferred<ReturnType<typeof makeCart>>();
    client.carts.updateLine.mockReturnValueOnce(a.promise);
    client.carts.removeLine.mockResolvedValue(makeCart('c1', { lines: [] }));
    client.carts.setCustomer.mockResolvedValue(makeCart('c1'));
    client.carts.setAddress.mockResolvedValue(makeCart('c1'));
    client.carts.setShippingOption.mockResolvedValue(
      makeCart('c1', { shippingOption: 'standard', shippingMinor: 500 }),
    );
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })),
    });
    await waitFor(() => expect(result.current.cart?.id).toBe('c1'));
    let p1!: Promise<unknown>;
    let p2!: Promise<unknown>;
    act(() => {
      p1 = result.current.updateLine('v1', { quantity: 3 });
      p2 = result.current.removeLine('v1');
    });
    expect(result.current.isUpdating).toBe(true);
    // The second write waits for the first.
    expect(client.carts.removeLine).not.toHaveBeenCalled();
    await act(async () => {
      a.resolve(makeCart('c1', { lines: [line('v1', 3)] }));
      await p1;
      await p2;
    });
    expect(client.carts.removeLine).toHaveBeenCalledWith('c1', 'v1');
    expect(result.current.cart?.lines).toEqual([]);
    await act(async () => {
      await result.current.setCustomer({
        email: 'a@b.c',
        name: 'A',
        surname: 'B',
        phone: '05551112233',
      });
      await result.current.setAddress({
        shipping: { district: 'D', city: 'C', country: 'TR', line1: 'x' },
      });
      await result.current.setShippingOption('standard');
    });
    expect(client.carts.setShippingOption).toHaveBeenCalledWith(
      'c1',
      'standard',
    );
    expect(result.current.cart?.shippingMinor).toBe(500);
    expect(result.current.isUpdating).toBe(false);
  });

  it('forgets an unknown saved cart and starts fresh on the next write', async () => {
    const client = mockClient();
    const storage = memoryStorage({ [KEY]: 'gone' });
    client.carts.get.mockRejectedValue(
      apiError('cart_not_found', 404, undefined),
    );
    client.carts.create.mockResolvedValue(makeCart('new'));
    client.carts.addLine.mockResolvedValue(
      makeCart('new', { lines: [line('v1', 1)] }),
    );
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.cart).toBeNull();
    expect(result.current.error).toBeNull();
    expect(storage.data.has(KEY)).toBe(false);
    await act(async () => {
      await result.current.addLine({ variantId: 'v1', quantity: 1 });
    });
    expect(client.carts.addLine.mock.calls[0]![0]).toBe('new');
    expect(storage.data.get(KEY)).toBe('new');
  });

  it('a saved cart read as expired is forgotten', async () => {
    const client = mockClient();
    const storage = memoryStorage({ [KEY]: 'old' });
    client.carts.get.mockResolvedValue(makeCart('old', { status: 'expired' }));
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await waitFor(() => expect(result.current.status).toBe('ready'));
    expect(result.current.cart).toBeNull();
    expect(storage.data.has(KEY)).toBe(false);
  });

  it('a write on an expired cart rejects, clears the id, and the next write starts fresh', async () => {
    const client = mockClient();
    const storage = memoryStorage({ [KEY]: 'c1' });
    client.carts.get.mockResolvedValue(makeCart('c1'));
    client.carts.addLine
      .mockRejectedValueOnce(
        apiError('cart_read_only', 409, { status: 'expired' }),
      )
      .mockResolvedValueOnce(makeCart('c2', { lines: [line('v1', 1)] }));
    client.carts.create.mockResolvedValue(makeCart('c2'));
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await waitFor(() => expect(result.current.cart?.id).toBe('c1'));
    await act(async () => {
      await expect(
        result.current.addLine({ variantId: 'v1', quantity: 1 }),
      ).rejects.toMatchObject({ code: 'cart_read_only' });
    });
    expect(result.current.cart).toBeNull();
    expect(result.current.error).toMatchObject({ code: 'cart_read_only' });
    expect(storage.data.has(KEY)).toBe(false);
    await act(async () => {
      await result.current.addLine({ variantId: 'v1', quantity: 1 });
    });
    expect(client.carts.create).toHaveBeenCalledOnce();
    expect(result.current.cart?.id).toBe('c2');
    expect(result.current.error).toBeNull();
  });

  it('a read answering an ordered cart keeps it', async () => {
    const client = mockClient();
    const storage = memoryStorage({ [KEY]: 'c1' });
    const ordered = makeCart('c1', { status: 'ordered' });
    client.carts.get.mockResolvedValue(ordered);
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await waitFor(() => expect(result.current.cart).toBe(ordered));
    expect(storage.data.get(KEY)).toBe('c1');
    expect(result.current.previousCartId).toBeNull();
  });

  it('a write on an ordered cart moves to a fresh cart, keeps previousCartId, and replays the write once', async () => {
    const client = mockClient();
    const storage = memoryStorage({ [KEY]: 'c1' });
    client.carts.get.mockResolvedValue(makeCart('c1', { status: 'ordered' }));
    const fresh = makeCart('c2', { lines: [line('v1', 1)] });
    client.carts.addLine.mockImplementation((id: string) =>
      id === 'c1'
        ? Promise.reject(apiError('cart_read_only', 409, { status: 'ordered' }))
        : Promise.resolve(fresh),
    );
    client.carts.create.mockResolvedValue(makeCart('c2'));
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await waitFor(() => expect(result.current.cart?.id).toBe('c1'));
    let returned;
    await act(async () => {
      returned = await result.current.addLine({ variantId: 'v1', quantity: 1 });
    });
    expect(returned).toBe(fresh);
    expect(client.carts.create).toHaveBeenCalledOnce();
    expect(client.carts.addLine.mock.calls.map((c) => c[0])).toEqual([
      'c1',
      'c2',
    ]);
    expect(result.current.cart).toBe(fresh);
    expect(result.current.previousCartId).toBe('c1');
    expect(result.current.error).toBeNull();
    expect(storage.data.get(KEY)).toBe('c2');
    act(() => result.current.reset());
    expect(result.current.previousCartId).toBeNull();
  });

  it('replays an ordered-cart write only once', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1', { status: 'ordered' }));
    client.carts.create.mockResolvedValue(makeCart('c2'));
    client.carts.addLine.mockRejectedValue(
      apiError('cart_read_only', 409, { status: 'ordered' }),
    );
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })),
    });
    await waitFor(() => expect(result.current.cart?.id).toBe('c1'));
    await act(async () => {
      await expect(
        result.current.addLine({ variantId: 'v1', quantity: 1 }),
      ).rejects.toMatchObject({ code: 'cart_read_only' });
    });
    expect(client.carts.addLine).toHaveBeenCalledTimes(2);
    expect(client.carts.create).toHaveBeenCalledOnce();
  });

  it('reset during a read in flight: the old cart is not resurrected or persisted', async () => {
    const client = mockClient();
    const storage = memoryStorage({ [KEY]: 'c1' });
    const pending = deferred<ReturnType<typeof makeCart>>();
    client.carts.get.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await waitFor(() => expect(client.carts.get).toHaveBeenCalled());
    act(() => result.current.reset());
    await act(async () => {
      pending.resolve(makeCart('c1', { lines: [line('v1', 1)] }));
      await pending.promise;
    });
    expect(result.current.cart).toBeNull();
    expect(result.current.status).toBe('ready');
    expect(storage.data.has(KEY)).toBe(false);
  });

  it('reset during a write in flight: the write resolves but is not applied', async () => {
    const client = mockClient();
    const storage = memoryStorage({ [KEY]: 'c1' });
    client.carts.get.mockResolvedValue(makeCart('c1'));
    const pending = deferred<ReturnType<typeof makeCart>>();
    client.carts.addLine.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await waitFor(() => expect(result.current.cart?.id).toBe('c1'));
    let p!: Promise<unknown>;
    act(() => {
      p = result.current.addLine({ variantId: 'v1', quantity: 1 });
    });
    await waitFor(() => expect(client.carts.addLine).toHaveBeenCalled());
    act(() => result.current.reset());
    await act(async () => {
      pending.resolve(makeCart('c1', { lines: [line('v1', 1)] }));
      await p;
    });
    expect(result.current.cart).toBeNull();
    expect(result.current.isUpdating).toBe(false);
    expect(storage.data.has(KEY)).toBe(false);
  });

  describe('default storage (cookie with localStorage fallback)', () => {
    const cookieMap = () => {
      const m = document.cookie.match(/(?:^|; )__Host-konfiqo_cart=([^;]*)/);
      return m ? (JSON.parse(decodeURIComponent(m[1]!)) as object) : null;
    };
    const defaultWrapper = (client: ReturnType<typeof mockClient>) =>
      function W({ children }: { children?: React.ReactNode }) {
        return (
          <StorefrontProvider
            storeId="store-1"
            client={client as unknown as StorefrontClient}
          >
            {children}
          </StorefrontProvider>
        );
      };
    const cleanSlate = () => {
      document.cookie = '__Host-konfiqo_cart=; Max-Age=0; Path=/; Secure';
      localStorage.clear();
    };

    it('migrates a localStorage cart id into the cookie', async () => {
      cleanSlate();
      localStorage.setItem(KEY, 'c1');
      const client = mockClient();
      client.carts.get.mockImplementation((id: string) =>
        Promise.resolve(makeCart(id)),
      );
      const { result } = renderHook(() => useCart(), {
        wrapper: defaultWrapper(client),
      });
      await waitFor(() => expect(result.current.cart?.id).toBe('c1'));
      expect(cookieMap()).toEqual({ [KEY]: 'c1' });
      expect(localStorage.getItem(KEY)).toBe('c1');
      cleanSlate();
    });

    it('a cart created by a write lands in the cookie and localStorage', async () => {
      cleanSlate();
      const client = mockClient();
      client.carts.create.mockResolvedValue(makeCart('c7'));
      client.carts.addLine.mockResolvedValue(
        makeCart('c7', { lines: [line('v1', 1)] }),
      );
      const { result } = renderHook(() => useCart(), {
        wrapper: defaultWrapper(client),
      });
      await act(() => result.current.addLine({ variantId: 'v1', quantity: 1 }));
      expect(cookieMap()).toEqual({ [KEY]: 'c7' });
      expect(localStorage.getItem(KEY)).toBe('c7');
      act(() => result.current.reset());
      expect(cookieMap()).toBeNull();
      expect(localStorage.getItem(KEY)).toBeNull();
    });

    it('ignores a planted legacy konfiqo_cart cookie and uses localStorage', async () => {
      cleanSlate();
      localStorage.setItem(KEY, 'mine');
      document.cookie = `konfiqo_cart=${encodeURIComponent(JSON.stringify({ [KEY]: 'attacker' }))}; Path=/; Secure`;
      const storage = defaultCartStorage()!;
      expect(storage.getItem(KEY)).toBe('mine');
      expect(document.cookie).toContain('__Host-konfiqo_cart=');
      document.cookie = 'konfiqo_cart=; Max-Age=0; Path=/; Secure';
      cleanSlate();
    });

    it('prefers the cookie (shared with the seller frontend) over localStorage', async () => {
      cleanSlate();
      localStorage.setItem(KEY, 'old');
      document.cookie = `__Host-konfiqo_cart=${encodeURIComponent(JSON.stringify({ [KEY]: 'fresh' }))}; Path=/; Secure`;
      const client = mockClient();
      client.carts.get.mockImplementation((id: string) =>
        Promise.resolve(makeCart(id)),
      );
      const { result } = renderHook(() => useCart(), {
        wrapper: defaultWrapper(client),
      });
      await waitFor(() => expect(result.current.cart?.id).toBe('fresh'));
      cleanSlate();
    });

    // Safari caps a script-written cookie to 7 days: an expired cookie must
    // not lose the cart localStorage still holds.
    it('an expired cookie falls back to localStorage and is rewritten', () => {
      cleanSlate();
      const storage = defaultCartStorage()!;
      storage.setItem(KEY, 'c1');
      // Expired (no removeItem ran): the cookie is simply gone.
      document.cookie = '__Host-konfiqo_cart=; Max-Age=0; Path=/; Secure';
      expect(cookieMap()).toBeNull();
      expect(storage.getItem(KEY)).toBe('c1');
      expect(cookieMap()).toEqual({ [KEY]: 'c1' });
      cleanSlate();
    });

    it('a cart cleared by removeItem is not brought back from a stale localStorage copy', () => {
      cleanSlate();
      // Two frontends on the same store origin share localStorage.
      const hosted = defaultCartStorage()!;
      const own = defaultCartStorage()!;
      hosted.setItem(KEY, 'c1');
      own.removeItem(KEY);
      // A stale copy left behind (e.g. written by a tab that had not seen the clear).
      localStorage.setItem(KEY, 'c1');
      expect(hosted.getItem(KEY)).toBeNull();
      expect(own.getItem(KEY)).toBeNull();
      expect(cookieMap()).toBeNull();
      // A new id written afterwards clears the tombstone and is read normally.
      own.setItem(KEY, 'c2');
      expect(hosted.getItem(KEY)).toBe('c2');
      document.cookie = '__Host-konfiqo_cart=; Max-Age=0; Path=/; Secure';
      expect(hosted.getItem(KEY)).toBe('c2');
      cleanSlate();
    });

    it('a successful cookie read refreshes the cookie', () => {
      cleanSlate();
      document.cookie = `__Host-konfiqo_cart=${encodeURIComponent(JSON.stringify({ [KEY]: 'c1' }))}; Path=/; Secure`;
      const proto = Object.getPrototypeOf(document) as object;
      const desc =
        Object.getOwnPropertyDescriptor(proto, 'cookie') ??
        Object.getOwnPropertyDescriptor(Document.prototype, 'cookie')!;
      const writes: string[] = [];
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: () => desc.get!.call(document) as string,
        set: (v: string) => {
          writes.push(v);
          desc.set!.call(document, v);
        },
      });
      try {
        expect(defaultCartStorage()!.getItem(KEY)).toBe('c1');
        expect(writes).toHaveLength(1);
        expect(writes[0]).toMatch(
          /^__Host-konfiqo_cart=[^;]+; Max-Age=31536000/,
        );
      } finally {
        delete (document as { cookie?: string }).cookie;
        cleanSlate();
      }
    });

    it('still works through localStorage when cookies are unavailable', async () => {
      cleanSlate();
      Object.defineProperty(document, 'cookie', {
        configurable: true,
        get: () => '',
        set: () => undefined,
      });
      try {
        localStorage.setItem(KEY, 'c3');
        const client = mockClient();
        client.carts.get.mockImplementation((id: string) =>
          Promise.resolve(makeCart(id)),
        );
        const { result } = renderHook(() => useCart(), {
          wrapper: defaultWrapper(client),
        });
        await waitFor(() => expect(result.current.cart?.id).toBe('c3'));
        client.carts.addLine.mockResolvedValue(makeCart('c3'));
        act(() => result.current.reset());
        expect(localStorage.getItem(KEY)).toBeNull();
      } finally {
        delete (document as { cookie?: string }).cookie;
        cleanSlate();
      }
    });
  });

  it('picks up a cart id changed in another tab', async () => {
    localStorage.setItem(KEY, 'c1');
    const client = mockClient();
    client.carts.get.mockImplementation((id: string) =>
      Promise.resolve(makeCart(id)),
    );
    const { result } = renderHook(() => useCart(), {
      // Default storage: window.localStorage.
      wrapper: ({ children }) => (
        <StorefrontProvider
          storeId="store-1"
          client={client as unknown as StorefrontClient}
        >
          {children}
        </StorefrontProvider>
      ),
    });
    await waitFor(() => expect(result.current.cart?.id).toBe('c1'));
    const fire = (newValue: string | null, key = KEY) =>
      act(() => {
        window.dispatchEvent(
          new StorageEvent('storage', {
            key,
            newValue,
            storageArea: localStorage,
          }),
        );
      });
    defaultCartStorage()!.setItem(KEY, 'c2');
    fire('c2');
    await waitFor(() => expect(result.current.cart?.id).toBe('c2'));
    // Other keys are ignored.
    fire('zzz', cartIdKey('other-store'));
    defaultCartStorage()!.removeItem(KEY);
    fire(null);
    await waitFor(() => expect(result.current.cart).toBeNull());
    expect(client.carts.get.mock.calls.map((c) => c[0])).toEqual(['c1', 'c2']);
    document.cookie = '__Host-konfiqo_cart=; Max-Age=0; Path=/; Secure';
    localStorage.clear();
  });

  it('keeps the cart state when the config fetch changes identity, and uses the new fetch', async () => {
    const respond = (body: unknown) =>
      new Response(JSON.stringify(body), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      });
    const fetchA = vi.fn(async () => respond(makeCart('c1')));
    const fetchB = vi.fn(async () =>
      respond(makeCart('c1', { lines: [line('v1', 1)] })),
    );
    const storage = memoryStorage({ [KEY]: 'c1' });
    let currentFetch: typeof fetch = fetchA as unknown as typeof fetch;
    const { result, rerender } = renderHook(() => useCart(), {
      wrapper: ({ children }) => (
        <StorefrontProvider
          storeId="store-1"
          cartStorage={storage}
          config={{
            baseUrl: 'https://api.test',
            publishableKey: 'pk_x',
            fetch: currentFetch,
          }}
        >
          {children}
        </StorefrontProvider>
      ),
    });
    await waitFor(() => expect(result.current.cart?.id).toBe('c1'));
    const before = result.current.cart;
    currentFetch = fetchB as unknown as typeof fetch;
    rerender();
    expect(result.current.cart).toBe(before);
    await act(async () => {
      await result.current.addLine({ variantId: 'v1', quantity: 1 });
    });
    expect(fetchA).toHaveBeenCalledOnce();
    expect(fetchB).toHaveBeenCalledOnce();
    expect(result.current.itemCount).toBe(1);
  });

  it('other write errors reject and set error without forgetting the cart', async () => {
    const client = mockClient();
    const storage = memoryStorage({ [KEY]: 'c1' });
    const cart = makeCart('c1');
    client.carts.get.mockResolvedValue(cart);
    client.carts.addLine.mockRejectedValue(
      apiError('insufficient_stock', 409, { available: 1 }),
    );
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await waitFor(() => expect(result.current.cart).toBe(cart));
    await act(async () => {
      await expect(
        result.current.addLine({ variantId: 'v1', quantity: 5 }),
      ).rejects.toMatchObject({
        code: 'insufficient_stock',
        details: { available: 1 },
      });
    });
    expect(result.current.cart).toBe(cart);
    expect(storage.data.get(KEY)).toBe('c1');
  });

  it('a cart whose payment failed shows up open again on refresh', async () => {
    const client = mockClient();
    client.carts.get
      .mockResolvedValueOnce(makeCart('c1', { status: 'ordered' }))
      .mockResolvedValueOnce(makeCart('c1', { status: 'open' }));
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })),
    });
    await waitFor(() => expect(result.current.cart?.status).toBe('ordered'));
    await act(() => result.current.refresh());
    expect(result.current.cart?.status).toBe('open');
  });

  it('shares one cart across components and reads it once', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1'));
    client.carts.addLine.mockResolvedValue(
      makeCart('c1', { lines: [line('v1', 4)] }),
    );
    const { result } = renderHook(() => [useCart(), useCart()] as const, {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })),
    });
    await waitFor(() => expect(result.current[0].cart?.id).toBe('c1'));
    await act(async () => {
      await result.current[0].addLine({ variantId: 'v1', quantity: 4 });
    });
    expect(result.current[1].itemCount).toBe(4);
    expect(client.carts.get).toHaveBeenCalledOnce();
  });

  it('reset forgets the cart', async () => {
    const client = mockClient();
    const storage = memoryStorage({ [KEY]: 'c1' });
    client.carts.get.mockResolvedValue(makeCart('c1'));
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await waitFor(() => expect(result.current.cart?.id).toBe('c1'));
    act(() => result.current.reset());
    expect(result.current.cart).toBeNull();
    expect(storage.data.has(KEY)).toBe(false);
  });

  it('shippingOptions reads the cart options (empty without a cart)', async () => {
    const client = mockClient();
    const storage = memoryStorage();
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, storage),
    });
    await expect(result.current.shippingOptions()).resolves.toEqual({
      items: [],
    });
    storage.data.set(KEY, 'c1');
    client.carts.shippingOptions.mockResolvedValue({
      items: [{ id: 'standard', priceMinor: 500 }],
    });
    await expect(result.current.shippingOptions()).resolves.toEqual({
      items: [{ id: 'standard', priceMinor: 500 }],
    });
    expect(client.carts.shippingOptions.mock.calls[0]![0]).toBe('c1');
  });

  it('works without persistent storage (cartStorage null)', async () => {
    const client = mockClient();
    client.carts.create.mockResolvedValue(makeCart('c1'));
    client.carts.addLine.mockResolvedValue(makeCart('c1'));
    client.carts.removeLine.mockResolvedValue(makeCart('c1'));
    const { result } = renderHook(() => useCart(), {
      wrapper: wrapper(client, null),
    });
    await act(async () => {
      await result.current.addLine({ variantId: 'v1', quantity: 1 });
      await result.current.removeLine('v1');
    });
    expect(client.carts.create).toHaveBeenCalledOnce();
    expect(client.carts.removeLine).toHaveBeenCalledWith('c1', 'v1');
  });

  it('aborts the cart read when the provider unmounts', () => {
    const client = mockClient();
    client.carts.get.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => useCart(), {
      wrapper: wrapper(client, memoryStorage({ [KEY]: 'c1' })),
    });
    return waitFor(() => expect(client.carts.get).toHaveBeenCalled()).then(
      () => {
        const signal = client.carts.get.mock.calls[0]![1]!.signal!;
        unmount();
        expect(signal.aborted).toBe(true);
      },
    );
  });

  it('server rendering reads no storage and shows the idle state', () => {
    const client = mockClient();
    const storage = memoryStorage({ [KEY]: 'c1' });
    function Badge() {
      const { status, itemCount } = useCart();
      return <span>{`${status}:${itemCount}`}</span>;
    }
    const html = renderToString(
      <StorefrontProvider
        storeId="store-1"
        client={client as unknown as StorefrontClient}
        cartStorage={storage}
      >
        <Badge />
      </StorefrontProvider>,
    );
    expect(html).toContain('idle:0');
    expect(storage.getItem).not.toHaveBeenCalled();
    expect(client.carts.get).not.toHaveBeenCalled();
  });
});
