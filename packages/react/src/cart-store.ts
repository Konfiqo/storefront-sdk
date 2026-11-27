import {
  StorefrontError,
  cartIdKey,
  clearCartId,
  cookieCartStorage,
  isStorefrontError,
  loadCartId,
  saveCartId,
  type AddLineInput,
  type AnyStorefrontError,
  type Cart,
  type CartIdStorage,
  type CheckoutResult,
  type RequestOptions,
  type ShippingOptionList,
  type StorefrontClient,
} from '@konfiqo/storefront-sdk';

/**
 * An error a hook reports: a {@link StorefrontError} (narrow with
 * `isStorefrontError` and switch on `code`), or a plain `Error` for
 * programming mistakes (e.g. an invalid slug).
 */
export type StorefrontHookError = AnyStorefrontError | Error;

/** The cart part of the shared state. */
export interface CartSnapshot {
  /** The cart, or null when the buyer has none yet (created on the first write). */
  cart: Cart | null;
  /**
   * `idle` before the first read (and during server rendering), `loading`
   * while the saved cart is read, `ready` afterwards.
   */
  status: 'idle' | 'loading' | 'ready';
  /** A write is in progress. */
  isUpdating: boolean;
  /** The last read or write error, cleared by the next success. */
  error: StorefrontHookError | null;
  /**
   * The id of a cart this provider left because it was already `ordered`
   * when the buyer changed it (a write moved to a fresh cart). Lets the
   * app offer "continue your payment" for that order. Cleared by `reset()`.
   */
  previousCartId: string | null;
}

/** The checkout part of the shared state. */
export interface CheckoutSnapshot {
  /** A checkout call is in flight. */
  isPending: boolean;
  /** The last checkout's result. Holds the once-only order `token`. */
  result: CheckoutResult | null;
  /** The last checkout's error. */
  error: StorefrontHookError | null;
  /** Settled checkout calls so far (a challenge widget resets on each). */
  attempts: number;
}

/** Whether a write error means "this cart is already ordered". */
function isOrderedCartError(e: unknown): boolean {
  return (
    isStorefrontError(e) &&
    e.code === 'cart_read_only' &&
    e.details.status === 'ordered'
  );
}

/** Whether a cart error means "this cart is gone: start a new one". */
export function isDeadCartError(e: unknown): boolean {
  if (!isStorefrontError(e)) return false;
  if (e.code === 'cart_not_found') return true;
  return e.code === 'cart_read_only' && e.details.status === 'expired';
}

const toError = (e: unknown): StorefrontHookError =>
  e instanceof Error ? (e as StorefrontHookError) : new Error(String(e));

/**
 * The buyer's cart and checkout state, shared by every hook under one
 * provider. Writes and checkout run one at a time, in call order, and
 * every write replaces the state with the server's cart view. Internal.
 */
export class CartStore {
  private cartState: CartSnapshot = {
    cart: null,
    status: 'idle',
    isUpdating: false,
    error: null,
    previousCartId: null,
  };
  private checkoutState: CheckoutSnapshot = {
    isPending: false,
    result: null,
    error: null,
    attempts: 0,
  };
  private readonly listeners = new Set<() => void>();
  private queue: Promise<void> = Promise.resolve();
  private cartId: string | null = null;
  private loadPromise: Promise<void> | null = null;
  private reads = new AbortController();
  private pendingCheckout: Promise<CheckoutResult> | null = null;
  private pendingWrites = 0;
  /**
   * Bumped by `reset()` (and a cart id changed in another tab): a queued
   * operation that started under an older epoch drops its outcome instead
   * of resurrecting (or persisting) the cart it was working on.
   */
  private epoch = 0;
  /**
   * Bumped by `reset()` only. A checkout in flight keeps its outcome (the
   * once-only order token) when another tab merely changes the cart id.
   */
  private resetEpoch = 0;
  /** Whether a checkout was started under this provider. */
  checkoutStarted = false;

  /**
   * @param getClient - the provider's current client (read per call, so
   *   a new client — e.g. another `fetch` — keeps this cart state)
   */
  constructor(
    private readonly getClient: () => StorefrontClient,
    private readonly storeId: string,
    private readonly storage: () => CartIdStorage | null,
  ) {}

  private get client(): StorefrontClient {
    return this.getClient();
  }

  // ------------------------------------------------------ subscription

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };
  getCart = (): CartSnapshot => this.cartState;
  getCheckout = (): CheckoutSnapshot => this.checkoutState;

  private setCart(patch: Partial<CartSnapshot>): void {
    this.cartState = { ...this.cartState, ...patch };
    this.emit();
  }
  private setCheckout(patch: Partial<CheckoutSnapshot>): void {
    this.checkoutState = { ...this.checkoutState, ...patch };
    this.emit();
  }
  private emit(): void {
    for (const l of this.listeners) l();
  }

  /** Runs `fn` after everything queued before it. */
  private enqueue<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(fn);
    this.queue = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  private currentId(): string | null {
    return this.cartId ?? loadCartId(this.storage(), this.storeId);
  }

  /** Forgets the cart: the next write creates a new one. */
  private forget(): void {
    this.cartId = null;
    clearCartId(this.storage(), this.storeId);
  }

  /** Puts a server cart view into the state (an expired cart is forgotten). */
  private apply(cart: Cart): void {
    if (cart.status === 'expired') {
      this.forget();
      this.setCart({ cart: null, status: 'ready', error: null });
      return;
    }
    if (this.cartId !== cart.id) {
      this.cartId = cart.id;
      saveCartId(this.storage(), this.storeId, cart.id);
    }
    this.setCart({ cart, status: 'ready', error: null });
  }

  // ------------------------------------------------------ reads

  /** Reads the saved cart once (later calls share the first read). */
  load = (): Promise<void> => {
    this.loadPromise ??= this.read();
    return this.loadPromise;
  };

  /**
   * Reads the cart again. Also how a cart whose payment failed shows up
   * as `open` again: the read reopens it on the server.
   */
  refresh = (): Promise<void> => this.read();

  /** Cancels pending cart reads (the provider unmounted). */
  abortReads(): void {
    this.reads.abort();
    this.reads = new AbortController();
    this.loadPromise = null;
  }

  private read(): Promise<void> {
    const signal = this.reads.signal;
    return this.enqueue(async () => {
      if (signal.aborted) {
        if (this.cartState.status === 'loading')
          this.setCart({ status: 'idle' });
        return;
      }
      const epoch = this.epoch;
      const id = this.currentId();
      if (!id) {
        this.setCart({ cart: null, status: 'ready' });
        return;
      }
      this.cartId = id;
      if (this.cartState.cart === null) this.setCart({ status: 'loading' });
      try {
        const cart = await this.client.carts.get(id, { signal });
        if (epoch !== this.epoch) return;
        this.apply(cart);
      } catch (e) {
        if (epoch !== this.epoch) return;
        if (signal.aborted) {
          if (this.cartState.status === 'loading')
            this.setCart({ status: 'idle' });
          return;
        }
        if (isDeadCartError(e)) {
          this.forget();
          this.setCart({ cart: null, status: 'ready', error: null });
          return;
        }
        this.setCart({ status: 'ready', error: toError(e) });
      }
    });
  }

  // ------------------------------------------------------ writes

  private write(op: (cartId: string) => Promise<Cart>): Promise<Cart> {
    this.pendingWrites++;
    this.setCart({ isUpdating: true });
    return this.enqueue(async () => {
      const epoch = this.epoch;
      const current = () => epoch === this.epoch;
      /** Runs `op` on the current cart, creating one if needed. */
      const attempt = async (): Promise<Cart> => {
        let id = this.currentId();
        if (!id) {
          // Created lazily: a buyer who only browses never gets a cart.
          const created = await this.client.carts.create();
          if (!current()) {
            // Reset (or another tab) while the cart was being created: do
            // not write into a cart nobody holds.
            throw new StorefrontError(
              'aborted',
              0,
              'The cart was reset while the write was pending',
              undefined,
            );
          }
          this.apply(created);
          id = created.id;
        }
        return op(id);
      };
      try {
        let cart: Cart;
        try {
          cart = await attempt();
        } catch (e) {
          if (!current() || !isOrderedCartError(e)) throw e;
          // The cart was already checked out (its payment may still be
          // open): keep its id for the app, and replay the write once on
          // a fresh cart.
          const previousCartId = this.currentId();
          this.forget();
          this.setCart({ cart: null, previousCartId });
          cart = await attempt();
        }
        if (current()) this.apply(cart);
        return cart;
      } catch (e) {
        if (current()) {
          if (isDeadCartError(e)) {
            // Gone (expired / unknown): the next write starts a new cart.
            this.forget();
            this.setCart({ cart: null, status: 'ready' });
          }
          this.setCart({ error: toError(e) });
        }
        throw e;
      } finally {
        this.pendingWrites--;
        if (this.pendingWrites === 0) this.setCart({ isUpdating: false });
      }
    });
  }

  addLine = (input: AddLineInput) =>
    this.write((id) => this.client.carts.addLine(id, input));
  updateLine = (lineId: string, input: { quantity: number }) =>
    this.write((id) => this.client.carts.updateLine(id, lineId, input));
  removeLine = (lineId: string) =>
    this.write((id) => this.client.carts.removeLine(id, lineId));
  setCustomer = (
    input: Parameters<StorefrontClient['carts']['setCustomer']>[1],
  ) => this.write((id) => this.client.carts.setCustomer(id, input));
  setAddress = (
    input: Parameters<StorefrontClient['carts']['setAddress']>[1],
  ) => this.write((id) => this.client.carts.setAddress(id, input));
  setShippingOption = (optionId: string) =>
    this.write((id) => this.client.carts.setShippingOption(id, optionId));

  /** The shipping options of the cart (empty when there is no cart yet). */
  shippingOptions = async (
    options?: RequestOptions,
  ): Promise<ShippingOptionList> => {
    const id = this.currentId();
    if (!id) return { items: [] };
    return this.client.carts.shippingOptions(id, options);
  };

  /**
   * Forgets the cart (e.g. once its order is paid): the next write
   * creates a new one. The old cart is not deleted on the server.
   */
  reset = (): void => {
    this.epoch++;
    this.resetEpoch++;
    this.forget();
    this.loadPromise = null;
    this.setCart({
      cart: null,
      status: 'ready',
      error: null,
      previousCartId: null,
    });
    this.setCheckout({ result: null, error: null });
  };

  /**
   * The saved cart id changed in another tab (a `storage` event for this
   * store's key): follow it. Operations in flight on the old cart drop
   * their outcome.
   */
  syncFromStorage = (): void => {
    const id = loadCartId(this.storage(), this.storeId);
    if (id === this.cartId) return;
    this.epoch++;
    this.cartId = id;
    this.loadPromise = null;
    if (id === null) {
      this.setCart({ cart: null, status: 'ready', error: null });
      return;
    }
    void this.refresh();
  };

  /** The storage key this store persists its cart id under. */
  get storageKey(): string {
    return cartIdKey(this.storeId);
  }

  /** The storage the cart id is kept in (null: memory only). */
  currentStorage(): CartIdStorage | null {
    return this.storage();
  }

  // ------------------------------------------------------ checkout

  /**
   * Checks the cart out. Never aborted (the server may place the order
   * anyway); a second call while one is in flight returns the same
   * promise. The cart is read again afterwards.
   */
  checkout = (options: {
    agreementsHash: string;
    turnstileToken?: string;
  }): Promise<CheckoutResult> => {
    if (this.pendingCheckout) return this.pendingCheckout;
    this.checkoutStarted = true;
    this.setCheckout({ isPending: true, error: null });
    let epoch = this.resetEpoch;
    const run = this.enqueue(async () => {
      epoch = this.resetEpoch;
      const id = this.currentId();
      if (!id) {
        throw new StorefrontError(
          'checkout_incomplete',
          0,
          'There is no cart to check out',
          { missing: ['lines'] },
        );
      }
      return this.client.carts.checkout(id, {
        agreementsHash: options.agreementsHash,
        turnstileToken: options.turnstileToken || undefined,
      });
    });
    this.pendingCheckout = run;
    run.then(
      (result) => this.settleCheckout(epoch, { result, error: null }),
      (e: unknown) =>
        this.settleCheckout(epoch, { result: null, error: toError(e) }),
    );
    return run;
  };

  private settleCheckout(
    epoch: number,
    patch: Partial<CheckoutSnapshot>,
  ): void {
    this.pendingCheckout = null;
    this.setCheckout({
      // After `reset()` the outcome belongs to a cart the buyer left.
      ...(epoch === this.resetEpoch ? patch : {}),
      isPending: false,
      attempts: this.checkoutState.attempts + 1,
    });
    // Shows what the server now has: `ordered`, or the new prices after
    // `cart_changed`.
    void this.refresh();
  }

  /** Clears the last checkout result and error. */
  clearCheckout = (): void => {
    this.setCheckout({ result: null, error: null });
  };
}

/**
 * The default cart-id storage in a browser: the first-party `__Host-konfiqo_cart`
 * cookie (shared with a store's own frontend on the same domain) backed by
 * `localStorage`. Reads prefer the cookie, and each read that finds it
 * rewrites it, renewing its expiry. Safari caps a script-written cookie to
 * 7 days, so a cookie may expire while `localStorage` still holds the id:
 * then the id is read from `localStorage` and written back into the cookie.
 * Writes go to both, so the cart still persists when cookies are blocked.
 *
 * `removeItem` (the cart deliberately cleared on this origin) leaves a
 * tombstone in `localStorage`, which every frontend on the store origin
 * shares: while it is there an id left in `localStorage` is not brought
 * back. `setItem` clears it. Null on a server.
 */
export function defaultCartStorage(): CartIdStorage | null {
  if (typeof window === 'undefined') return null;
  let local: Storage | null = null;
  try {
    local = window.localStorage;
  } catch {
    local = null;
  }
  const cookie = cookieCartStorage();
  const attempt = (f: () => void): boolean => {
    try {
      f();
      return true;
    } catch {
      return false;
    }
  };
  const tombstoneKey = (key: string) => `${key}:cleared`;
  /** The marker an earlier version set; removed wherever it is seen. */
  const legacyMarkerKey = (key: string) => `${key}:in-cookie`;
  const cleared = (key: string): boolean => {
    try {
      return local?.getItem(tombstoneKey(key)) === '1';
    } catch {
      return false;
    }
  };
  const storage: CartIdStorage & { storageArea: Storage | null } = {
    // The area a `storage` event of another tab names.
    storageArea: local,
    getItem(key) {
      let fromCookie: string | null = null;
      try {
        fromCookie = cookie.getItem(key);
      } catch {
        fromCookie = null;
      }
      if (fromCookie) {
        // Renews the expiry (Safari: 7 days from the last write).
        attempt(() => cookie.setItem(key, fromCookie));
        return fromCookie;
      }
      let fromLocal: string | null = null;
      try {
        fromLocal = local?.getItem(key) ?? null;
      } catch {
        fromLocal = null;
      }
      if (!fromLocal) return null;
      // Cleared on purpose on this origin: do not bring the old id back.
      if (cleared(key)) return null;
      // The cookie expired, or never existed: put the id back into it.
      attempt(() => cookie.setItem(key, fromLocal));
      return fromLocal;
    },
    setItem(key, value) {
      const a = attempt(() => cookie.setItem(key, value));
      const b = local ? attempt(() => local.setItem(key, value)) : false;
      if (local) {
        attempt(() => local.removeItem(tombstoneKey(key)));
        attempt(() => local.removeItem(legacyMarkerKey(key)));
      }
      if (!a && !b) throw new Error('no cart storage available');
    },
    removeItem(key) {
      attempt(() => cookie.removeItem(key));
      if (local) {
        attempt(() => local.removeItem(key));
        attempt(() => local.setItem(tombstoneKey(key), '1'));
        attempt(() => local.removeItem(legacyMarkerKey(key)));
      }
    },
  };
  return storage;
}
