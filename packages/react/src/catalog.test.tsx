import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Product, ProductPage, Store } from '@konfiqo/storefront-sdk';
import { StorefrontProvider, useStorefrontClient } from './provider';
import { useCategories, useProduct, useProducts, useStore } from './catalog';
import { apiError, deferred, mockClient, wrapper } from './test-utils';

const store = { name: 'Shop', currency: 'TRY' } as Store;
const page = (n: number): ProductPage => ({
  items: [],
  pagination: { page: n, pageSize: 20, totalItems: 0, totalPages: 0 },
});

describe('StorefrontProvider', () => {
  it('creates a client from config', () => {
    const fetch = vi.fn();
    const { result } = renderHook(() => useStorefrontClient(), {
      wrapper: ({ children }) => (
        <StorefrontProvider
          storeId="s"
          config={{
            baseUrl: 'https://api.test',
            publishableKey: 'pk_x',
            fetch,
          }}
        >
          {children}
        </StorefrontProvider>
      ),
    });
    expect(result.current.media.url('a.png')).toBe(
      'https://api.test/v1/media/a.png?pk=pk_x',
    );
  });

  it('hooks outside a provider throw', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    expect(() => renderHook(() => useStore())).toThrow(/StorefrontProvider/);
    vi.restoreAllMocks();
  });
});

describe('useStore / useCategories', () => {
  it('reads the store with a signal', async () => {
    const client = mockClient();
    client.store.get.mockResolvedValue(store);
    const { result } = renderHook(() => useStore(), {
      wrapper: wrapper(client),
    });
    expect(result.current.isLoading).toBe(true);
    await waitFor(() => expect(result.current.data).toBe(store));
    expect(result.current.error).toBeNull();
    expect(client.store.get.mock.calls[0]![0]!.signal).toBeInstanceOf(
      AbortSignal,
    );
  });

  it('reports a typed error', async () => {
    const client = mockClient();
    client.categories.list.mockRejectedValue(
      apiError('catalog_unavailable', 503, undefined),
    );
    const { result } = renderHook(() => useCategories(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.data).toBeNull();
    expect(result.current.error).toMatchObject({ code: 'catalog_unavailable' });
  });

  it('refetch reads again', async () => {
    const client = mockClient();
    client.categories.list
      .mockRejectedValueOnce(apiError('network_error', 0, undefined))
      .mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useCategories(), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.error).not.toBeNull());
    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).toEqual({ items: [] }));
    expect(result.current.error).toBeNull();
  });
});

describe('useProducts', () => {
  it('reads with the params and cancels the stale read on change', async () => {
    const client = mockClient();
    const first = deferred<ProductPage>();
    client.products.list
      .mockReturnValueOnce(first.promise)
      .mockResolvedValueOnce(page(2));
    const { result, rerender } = renderHook(
      ({ p }: { p: number }) => useProducts({ category: 'tees', page: p }),
      { wrapper: wrapper(client), initialProps: { p: 1 } },
    );
    expect(client.products.list).toHaveBeenCalledWith(
      { category: 'tees', page: 1, q: undefined, pageSize: undefined },
      expect.anything(),
    );
    const firstSignal = client.products.list.mock.calls[0]![1]!.signal!;
    rerender({ p: 2 });
    expect(firstSignal.aborted).toBe(true);
    await waitFor(() => expect(result.current.data).toEqual(page(2)));
    // The stale answer arriving late changes nothing.
    first.resolve(page(1));
    await Promise.resolve();
    expect(result.current.data).toEqual(page(2));
  });

  it('does not refetch when the params are equal', async () => {
    const client = mockClient();
    client.products.list.mockResolvedValue(page(1));
    const { result, rerender } = renderHook(
      () => useProducts({ category: 'tees' }),
      { wrapper: wrapper(client) },
    );
    await waitFor(() => expect(result.current.data).not.toBeNull());
    rerender();
    expect(client.products.list).toHaveBeenCalledTimes(1);
  });

  it('aborts on unmount', () => {
    const client = mockClient();
    client.products.list.mockReturnValue(new Promise(() => {}));
    const { unmount } = renderHook(() => useProducts(), {
      wrapper: wrapper(client),
    });
    const signal = client.products.list.mock.calls[0]![1]!.signal!;
    unmount();
    expect(signal.aborted).toBe(true);
  });
});

describe('useProduct', () => {
  it('reads by slug', async () => {
    const client = mockClient();
    const product = { slug: 'tee' } as Product;
    client.products.get.mockResolvedValue(product);
    const { result } = renderHook(() => useProduct('tee'), {
      wrapper: wrapper(client),
    });
    await waitFor(() => expect(result.current.data).toBe(product));
    expect(client.products.get.mock.calls[0]![0]).toBe('tee');
  });

  it('reports product_not_found', async () => {
    const client = mockClient();
    client.products.get.mockRejectedValue(
      apiError('product_not_found', 404, undefined),
    );
    const { result } = renderHook(() => useProduct('nope'), {
      wrapper: wrapper(client),
    });
    await waitFor(() =>
      expect(result.current.error).toMatchObject({ code: 'product_not_found' }),
    );
  });

  it('reads nothing without a slug', () => {
    const client = mockClient();
    const { result } = renderHook(() => useProduct(null), {
      wrapper: wrapper(client),
    });
    expect(result.current).toMatchObject({ data: null, isLoading: false });
    expect(client.products.get).not.toHaveBeenCalled();
  });
});
