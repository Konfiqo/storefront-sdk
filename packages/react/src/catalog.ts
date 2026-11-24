import type {
  CategoryList,
  Product,
  ProductListQuery,
  ProductPage,
  Store,
} from '@konfiqo/storefront-sdk';
import { useStorefrontContext } from './provider';
import { useResource, type ResourceResult } from './use-resource';

/** The store (`store.get()`): name, currency, theme, legal texts, checkout challenge. */
export function useStore(): ResourceResult<Store> {
  const { client } = useStorefrontContext();
  return useResource('store', client, (signal) => client.store.get({ signal }));
}

/** The active category tree (`categories.list()`). */
export function useCategories(): ResourceResult<CategoryList> {
  const { client } = useStorefrontContext();
  return useResource('categories', client, (signal) =>
    client.categories.list({ signal }),
  );
}

/**
 * A page of products (`products.list(params)`). Reads again when a
 * parameter changes, cancelling the previous read.
 */
export function useProducts(
  params: ProductListQuery = {},
): ResourceResult<ProductPage> {
  const { client } = useStorefrontContext();
  const query: ProductListQuery = {
    category: params.category,
    q: params.q,
    page: params.page,
    pageSize: params.pageSize,
  };
  return useResource(JSON.stringify(query), client, (signal) =>
    client.products.list(query, { signal }),
  );
}

/**
 * One product by slug (`products.get(slug)`); an unknown slug is the
 * error `product_not_found`. A null / empty slug reads nothing.
 */
export function useProduct(
  slug: string | null | undefined,
): ResourceResult<Product> {
  const { client } = useStorefrontContext();
  return useResource(slug ? `product:${slug}` : null, client, (signal) =>
    client.products.get(slug!, { signal }),
  );
}
