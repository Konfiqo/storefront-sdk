import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  type ReactNode,
} from 'react';
import {
  createStorefrontClient,
  type CartIdStorage,
  type StorefrontClient,
  type StorefrontClientOptions,
} from '@konfiqo/storefront-sdk';
import { CartStore, defaultCartStorage } from './cart-store';

/** Client options the provider accepts: no secret keys, no buyer IP. */
export type ClientConfig = Omit<
  StorefrontClientOptions,
  'serverKey' | 'trustedStorefrontKey' | 'buyerIp'
>;

/** Props of {@link StorefrontProvider}. */
export interface StorefrontProviderProps {
  /**
   * The store's id: namespaces the persisted cart id, so one origin can
   * serve several stores.
   */
  storeId: string;
  /** A client to use. Give either `client` or `config`. */
  client?: StorefrontClient;
  /**
   * Options to create the client with (when `client` is not given). The
   * secret keys `serverKey` and `trustedStorefrontKey`, and `buyerIp`, are
   * refused: props of a client component are serialized into the page HTML.
   */
  config?: ClientConfig;
  /**
   * Where the cart id is persisted. Default: the first-party `__Host-konfiqo_cart`
   * cookie (shared with a store's own frontend on the same domain) with
   * `window.localStorage` as a fallback, read lazily (never during render, so server rendering is safe). `null`
   * keeps the cart id in memory only (lost on reload).
   */
  cartStorage?: CartIdStorage | null;
  /** The storefront. */
  children?: ReactNode;
}

interface StorefrontContextValue {
  client: StorefrontClient;
  storeId: string;
  cart: CartStore;
}

const StorefrontContext = createContext<StorefrontContextValue | null>(null);

/**
 * Makes a Storefront client and the buyer's cart available to the hooks
 * below it. Holds the cart state, so every `useCart()` under one provider
 * sees the same cart.
 *
 * @throws Error when neither `client` nor `config` is given, or when
 * `config` holds `serverKey`, `trustedStorefrontKey` or `buyerIp`.
 */
export function StorefrontProvider({
  storeId,
  client,
  config,
  cartStorage,
  children,
}: StorefrontProviderProps) {
  const forbidden = ['serverKey', 'trustedStorefrontKey', 'buyerIp'].filter(
    (k) => config !== undefined && k in config,
  );
  if (forbidden.length > 0) {
    throw new Error(
      `StorefrontProvider: config.${forbidden.join(', config.')} must not be passed to a client component (it would reach the browser). Create a server-side client instead.`,
    );
  }
  const baseUrl = config?.baseUrl;
  const publishableKey = config?.publishableKey;
  const timeoutMs = config?.timeoutMs;
  const customFetch = config?.fetch;
  const resolved = useMemo(() => {
    if (client) return client;
    if (baseUrl === undefined || publishableKey === undefined) {
      throw new Error('StorefrontProvider: pass `client` or `config`');
    }
    return createStorefrontClient({
      baseUrl,
      publishableKey,
      timeoutMs,
      fetch: customFetch,
    });
  }, [client, baseUrl, publishableKey, timeoutMs, customFetch]);

  // Read by the cart store per call. Assigned during render (an
  // idempotent write of the latest props) so the store — keyed by
  // `storeId` only — always uses the current client and storage, and the
  // cart state survives a new client (e.g. a new `fetch` identity).
  const clientRef = useRef(resolved);
  clientRef.current = resolved;
  const storageRef = useRef(cartStorage);
  storageRef.current = cartStorage;

  const cart = useMemo(
    () =>
      new CartStore(
        () => clientRef.current,
        storeId,
        () =>
          storageRef.current === undefined
            ? defaultCartStorage()
            : storageRef.current,
      ),
    [storeId],
  );
  // Cancels the cart read when the provider goes away. Writes (and
  // checkout) are never aborted: the server may apply them anyway.
  useEffect(() => () => cart.abortReads(), [cart]);
  // Another tab changed this store's cart id: follow it.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const onStorage = (e: StorageEvent) => {
      const storage = cart.currentStorage();
      if (!storage) return;
      // The default storage names the `localStorage` it writes through.
      const area = (storage as { storageArea?: unknown }).storageArea;
      if (e.storageArea !== (area ?? storage)) return;
      if (e.key !== null && e.key !== cart.storageKey) return;
      cart.syncFromStorage();
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [cart]);

  const value = useMemo(
    () => ({ client: resolved, storeId, cart }),
    [resolved, storeId, cart],
  );
  return (
    <StorefrontContext.Provider value={value}>
      {children}
    </StorefrontContext.Provider>
  );
}

/** The provider's context. Internal. */
export function useStorefrontContext(): StorefrontContextValue {
  const ctx = useContext(StorefrontContext);
  if (!ctx) {
    throw new Error(
      'Storefront hooks must be used inside <StorefrontProvider>',
    );
  }
  return ctx;
}

/** The provider's context, or null outside a provider. Internal. */
export function useOptionalStorefrontContext(): StorefrontContextValue | null {
  return useContext(StorefrontContext);
}

/**
 * The provider's {@link StorefrontClient}, for calls the hooks do not
 * cover.
 */
export function useStorefrontClient(): StorefrontClient {
  return useStorefrontContext().client;
}
