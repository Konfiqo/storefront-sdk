import { useEffect, useMemo, useSyncExternalStore } from 'react';
import type {
  AddLineInput,
  AddressInput,
  Cart,
  CartIdStorage,
  CustomerInput,
  RequestOptions,
  ShippingOptionList,
  UpdateLineInput,
} from '@konfiqo/storefront-sdk';
import type { CartSnapshot } from './cart-store';
import { useStorefrontContext } from './provider';

/** What {@link useCart} returns. */
export interface UseCartResult extends CartSnapshot {
  /** Total units in the cart (for a badge). */
  itemCount: number;
  /** Adds units of a variant. Creates the cart on the first write. */
  addLine(input: AddLineInput): Promise<Cart>;
  /** Sets a line's quantity. */
  updateLine(variantId: string, input: UpdateLineInput): Promise<Cart>;
  /** Removes a line. */
  removeLine(variantId: string): Promise<Cart>;
  /** Sets the buyer. */
  setCustomer(input: CustomerInput): Promise<Cart>;
  /** Sets the shipping (and billing) address. */
  setAddress(input: AddressInput): Promise<Cart>;
  /** Selects a shipping option. */
  setShippingOption(optionId: string): Promise<Cart>;
  /** The shipping options of the cart (`{ items: [] }` without a cart). */
  shippingOptions(options?: RequestOptions): Promise<ShippingOptionList>;
  /** Reads the cart again (a cart whose payment failed comes back `open`). */
  refresh(): Promise<void>;
  /** Forgets the cart (e.g. after its order is paid); the next write starts a new one. */
  reset(): void;
}

const SERVER_CART: CartSnapshot = {
  cart: null,
  status: 'idle',
  isUpdating: false,
  error: null,
  previousCartId: null,
};

/**
 * The buyer's cart, shared by every component under the provider.
 *
 * The saved cart id is read on mount (after hydration: nothing is read
 * during render). No cart is created until the first write. Every write
 * replaces the state with the server's cart view — prices are never
 * computed locally. Writes reject with a {@link StorefrontHookError} (and
 * also set `error`); a cart that expired or is unknown is forgotten, and
 * the next write starts a new one.
 */
export function useCart(): UseCartResult {
  const { cart: store } = useStorefrontContext();
  const snapshot = useSyncExternalStore(
    store.subscribe,
    store.getCart,
    () => SERVER_CART,
  );
  useEffect(() => {
    void store.load();
  }, [store]);
  const itemCount =
    snapshot.cart?.lines.reduce((n, line) => n + line.quantity, 0) ?? 0;
  return {
    ...snapshot,
    itemCount,
    addLine: store.addLine,
    updateLine: store.updateLine,
    removeLine: store.removeLine,
    setCustomer: store.setCustomer,
    setAddress: store.setAddress,
    setShippingOption: store.setShippingOption,
    shippingOptions: store.shippingOptions,
    refresh: store.refresh,
    reset: store.reset,
  };
}

/**
 * Where this provider keeps the cart id, as a getter (read it inside an
 * effect or handler, never during render: it is null on a server). Lets a
 * page that learns a cart id out of band (e.g. cart recovery) save it
 * where the cart reads it, with `saveCartId(getStorage(), storeId, id)`.
 */
export function useCartStorage(): () => CartIdStorage | null {
  const { cart } = useStorefrontContext();
  return useMemo(() => () => cart.currentStorage(), [cart]);
}
