import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type HTMLAttributes,
} from 'react';
import { renderTurnstile, type TurnstileWidget } from '@konfiqo/storefront-sdk';
import { useCheckoutAttempts } from './use-checkout';

/** Props of {@link CheckoutChallenge}. */
export interface CheckoutChallengeProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onError'
> {
  /**
   * The store's Turnstile site key (`store.checkoutChallenge?.siteKey`).
   * Null / empty renders an empty `<div>` (the store has no challenge).
   */
  siteKey: string | null | undefined;
  /** A token is ready: pass it to `checkout({ agreementsHash, turnstileToken })`. */
  onToken: (token: string) => void;
  /**
   * The current token can no longer be used: it expired, or a checkout
   * consumed it and the widget was reset. Drop it; a new one follows.
   */
  onExpired?: () => void;
  /** The widget failed to load or render. */
  onError?: (error: Error | string | undefined) => void;
}

/** Imperative handle of {@link CheckoutChallenge} (via `ref`). */
export interface CheckoutChallengeHandle {
  /** Gets a new token (the current one is dropped: `onExpired` is called). */
  reset(): void;
}

/**
 * Renders the store's checkout challenge (Cloudflare Turnstile) with the
 * SDK's `renderTurnstile`. Tokens are single-use: under a
 * `StorefrontProvider` the widget resets itself after every checkout
 * attempt of `useCheckout()`; call `ref.current.reset()` to reset it
 * yourself. The widget is removed on unmount.
 */
export const CheckoutChallenge = forwardRef<
  CheckoutChallengeHandle,
  CheckoutChallengeProps
>(function CheckoutChallenge(
  { siteKey, onToken, onExpired, onError, ...divProps },
  handle,
) {
  const ref = useRef<HTMLDivElement>(null);
  const widget = useRef<TurnstileWidget | null>(null);
  const callbacks = useRef({ onToken, onExpired, onError });
  useEffect(() => {
    callbacks.current = { onToken, onExpired, onError };
  });

  useEffect(() => {
    const element = ref.current;
    if (!element || !siteKey) return;
    let active = true;
    let rendered: TurnstileWidget | null = null;
    renderTurnstile(element, siteKey, {
      onToken: (t) => callbacks.current.onToken(t),
      onExpired: () => callbacks.current.onExpired?.(),
      onError: (code) => callbacks.current.onError?.(code),
    }).then(
      (w) => {
        if (!active) {
          w.remove();
          return;
        }
        rendered = w;
        widget.current = w;
      },
      (e: unknown) => {
        if (active)
          callbacks.current.onError?.(
            e instanceof Error ? e : new Error(String(e)),
          );
      },
    );
    return () => {
      active = false;
      if (rendered) {
        rendered.remove();
        if (widget.current === rendered) widget.current = null;
      }
    };
  }, [siteKey]);

  const reset = () => {
    if (!widget.current) return;
    callbacks.current.onExpired?.();
    widget.current.reset();
  };
  useImperativeHandle(handle, () => ({ reset }), []);

  // Tokens are single-use: every settled checkout consumed (or rejected)
  // the current one.
  const attempts = useCheckoutAttempts();
  const seen = useRef(attempts);
  useEffect(() => {
    if (attempts === seen.current) return;
    seen.current = attempts;
    reset();
  });

  return <div {...divProps} ref={ref} />;
});
