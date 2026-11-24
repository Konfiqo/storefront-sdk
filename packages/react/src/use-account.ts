import { useCallback, useEffect, useRef, useState } from 'react';
import { isStorefrontError, type Account } from '@konfiqo/storefront-sdk';
import type { StorefrontHookError } from './cart-store';
import { useStorefrontContext } from './provider';

/** What {@link useAccount} returns. */
export interface UseAccountResult {
  /** The signed-in buyer's account, or null. */
  account: Account | null;
  /** `loading` until the first read answers; `signedOut` on a 401. */
  status: 'loading' | 'signedOut' | 'signedIn';
  /**
   * The last read's error when it was not a 401 (e.g. network, timeout),
   * else null. The status is `signedOut` then, unless an earlier read
   * succeeded (the account is kept).
   */
  error: StorefrontHookError | null;
  /** Reads the account again (call after sign-in, sign-out or a save). */
  refresh(): Promise<void>;
}

interface State {
  account: Account | null;
  status: UseAccountResult['status'];
  error: StorefrontHookError | null;
}

/**
 * The buyer's account (`client.account.get()`), read after mount. A 401
 * (no or an ended session) means `signedOut`. Sign in / out and saves go
 * through `useStorefrontClient().account`; call `refresh()` afterwards.
 */
export function useAccount(): UseAccountResult {
  const { client } = useStorefrontContext();
  const [state, setState] = useState<State>({
    account: null,
    status: 'loading',
    error: null,
  });
  const seq = useRef(0);
  const alive = useRef(true);

  const refresh = useCallback(async () => {
    const mine = ++seq.current;
    try {
      const account = await client.account.get();
      if (!alive.current || mine !== seq.current) return;
      setState({ account, status: 'signedIn', error: null });
    } catch (e) {
      if (!alive.current || mine !== seq.current) return;
      if (isStorefrontError(e) && e.status === 401) {
        setState({ account: null, status: 'signedOut', error: null });
        return;
      }
      const error =
        e instanceof Error ? (e as StorefrontHookError) : new Error(String(e));
      setState((s) => ({
        account: s.account,
        status: s.account ? 'signedIn' : 'signedOut',
        error,
      }));
    }
  }, [client]);

  useEffect(() => {
    alive.current = true;
    void refresh();
    return () => {
      alive.current = false;
    };
  }, [refresh]);

  return { ...state, refresh };
}
