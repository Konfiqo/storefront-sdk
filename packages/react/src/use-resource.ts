import { useCallback, useEffect, useRef, useState } from 'react';
import type { StorefrontHookError } from './cart-store';

/** What a read hook returns. */
export interface ResourceResult<T> {
  /** The data, or null before it arrives (and after an error). */
  data: T | null;
  /** The error of the last read, or null. */
  error: StorefrontHookError | null;
  /** A read is in progress. */
  isLoading: boolean;
  /** Reads again. */
  refetch: () => void;
}

interface State<T> {
  key: string | null;
  data: T | null;
  error: StorefrontHookError | null;
  isLoading: boolean;
}

const toError = (e: unknown): StorefrontHookError =>
  e instanceof Error ? (e as StorefrontHookError) : new Error(String(e));

/**
 * Reads `fetcher` whenever `key` changes (null = nothing to read). Each
 * read has its own AbortSignal, aborted when the key changes or the
 * component unmounts, so a stale answer never replaces a newer one.
 * Internal.
 */
export function useResource<T>(
  key: string | null,
  deps: unknown,
  fetcher: (signal: AbortSignal) => Promise<T>,
): ResourceResult<T> {
  const [state, setState] = useState<State<T>>({
    key: null,
    data: null,
    error: null,
    isLoading: key !== null,
  });
  const [nonce, setNonce] = useState(0);
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });

  useEffect(() => {
    if (key === null) {
      setState({ key, data: null, error: null, isLoading: false });
      return;
    }
    const controller = new AbortController();
    setState((s) =>
      s.key === key
        ? { ...s, isLoading: true }
        : { key, data: null, error: null, isLoading: true },
    );
    fetcherRef.current(controller.signal).then(
      (data) => {
        if (!controller.signal.aborted)
          setState({ key, data, error: null, isLoading: false });
      },
      (e: unknown) => {
        if (!controller.signal.aborted)
          setState({ key, data: null, error: toError(e), isLoading: false });
      },
    );
    return () => controller.abort();
  }, [key, deps, nonce]);

  const refetch = useCallback(() => setNonce((n) => n + 1), []);
  // Until the effect runs for a new key, do not show the old key's data.
  if (state.key !== key) {
    return { data: null, error: null, isLoading: key !== null, refetch };
  }
  return {
    data: state.data,
    error: state.error,
    isLoading: state.isLoading,
    refetch,
  };
}
