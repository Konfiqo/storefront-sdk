import type { ReactNode } from 'react';
import { vi, type Mock } from 'vitest';
import {
  StorefrontError,
  type Cart,
  type CartIdStorage,
  type StorefrontClient,
  type StorefrontErrorCode,
  type StorefrontErrorDetails,
} from '@konfiqo/storefront-sdk';
import { StorefrontProvider } from './provider';

/** A StorefrontClient whose every method is a vi.fn (rejecting by default). */
export type MockClient = {
  getContent: Mock<StorefrontClient['getContent']>;
} & {
  [K in Exclude<keyof StorefrontClient, 'getContent'>]: {
    [M in keyof StorefrontClient[K]]: StorefrontClient[K][M] extends (
      ...args: infer A
    ) => infer R
      ? Mock<(...args: A) => R>
      : never;
  };
};

export function mockClient(): MockClient {
  const fail = () =>
    vi.fn(() => Promise.reject(new Error('not mocked'))) as never;
  return {
    getContent: fail(),
    store: { get: fail() },
    categories: { list: fail() },
    products: { list: fail(), get: fail() },
    carts: {
      create: fail(),
      get: fail(),
      addLine: fail(),
      updateLine: fail(),
      removeLine: fail(),
      setCustomer: fail(),
      setAddress: fail(),
      shippingOptions: fail(),
      setShippingOption: fail(),
      checkout: fail(),
      recover: fail(),
    },
    orders: { get: fail() },
    account: {
      requestCode: fail(),
      signIn: fail(),
      signOut: fail(),
      get: fail(),
      updateProfile: fail(),
      saveAddresses: fail(),
    },
    media: { url: vi.fn((k: string) => `https://api.test/v1/media/${k}`) },
  } as unknown as MockClient;
}

export function apiError<C extends StorefrontErrorCode>(
  code: C,
  status: number,
  details: StorefrontErrorDetails<C>,
): StorefrontError<C> {
  return new StorefrontError(code, status, code, details);
}

export function makeCart(id: string, patch: Partial<Cart> = {}): Cart {
  return {
    id,
    status: 'open',
    currency: 'TRY',
    lines: [],
    subtotalMinor: 0,
    shippingMinor: 0,
    totalMinor: 0,
    shippingOption: null,
    customer: null,
    shippingAddress: null,
    billingAddress: null,
    expiresAt: '2026-11-16T00:00:00.000Z',
    ...patch,
  };
}

export function memoryStorage(
  initial: Record<string, string> = {},
): CartIdStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    removeItem: vi.fn((k: string) => void data.delete(k)),
  };
}

/** A deferred promise. */
export function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

export function wrapper(
  client: MockClient,
  storage: CartIdStorage | null = memoryStorage(),
  storeId = 'store-1',
) {
  return function Wrapper({ children }: { children?: ReactNode }) {
    return (
      <StorefrontProvider
        storeId={storeId}
        client={client as unknown as StorefrontClient}
        cartStorage={storage}
      >
        {children}
      </StorefrontProvider>
    );
  };
}
