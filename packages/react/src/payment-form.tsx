import { useEffect, useRef, type HTMLAttributes } from 'react';
import {
  mountPayment,
  type CheckoutResult,
  type ClosedCheckoutPage,
  type PaymentPresentation,
} from '@konfiqo/storefront-sdk';

/** Props of {@link PaymentForm}. */
export interface PaymentFormProps extends Omit<
  HTMLAttributes<HTMLDivElement>,
  'children' | 'onError'
> {
  /**
   * The **unmodified** result of `checkout()` (or its presentation part).
   * Never build it from user input, URL parameters or storage: embedded
   * content runs as script.
   */
  presentation: PaymentPresentation | CheckoutResult;
  /**
   * Payment cannot be (re)opened (`presentation: "closed"`): show the
   * order status page for `page` (`paid`, `cancelled`, `processing`, …).
   */
  onClosed?: (page: ClosedCheckoutPage) => void;
  /** The embed is of a kind this SDK cannot render: show a fallback. */
  onUnsupported?: (embedKind: string) => void;
  /** Presenting failed (e.g. a redirect URL that is not http(s)). */
  onError?: (error: Error) => void;
}

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  content: string | null;
  unmount: () => void;
}

const embeddedContent = (p: PaymentPresentation | CheckoutResult) =>
  p.presentation === 'embedded' && typeof p.embed.content === 'string'
    ? p.embed.content
    : null;

/**
 * Presents payment with the SDK's `mountPayment`: renders the provider's
 * embedded form inside a `<div>` (its scripts run once), sends the browser
 * to a `redirect` URL, or calls `onClosed`. The form is removed on
 * unmount. Card data never passes through your code. Unstyled: pass
 * `className` / `style` for the wrapper.
 */
export function PaymentForm({
  presentation,
  onClosed,
  onUnsupported,
  onError,
  ...divProps
}: PaymentFormProps) {
  const ref = useRef<HTMLDivElement>(null);
  const callbacks = useRef({ onClosed, onUnsupported, onError });
  useEffect(() => {
    callbacks.current = { onClosed, onUnsupported, onError };
  });
  const pending = useRef<Pending | null>(null);
  const navigated = useRef<unknown>(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;
    // A removal deferred by the previous cleanup: skip it when the same
    // form is mounted again (React Strict Mode re-runs effects), so the
    // provider's scripts are not injected twice.
    const prev = pending.current;
    pending.current = null;
    if (prev) {
      clearTimeout(prev.timer);
      if (
        prev.content === null ||
        prev.content !== embeddedContent(presentation)
      )
        prev.unmount();
    }
    // A redirect / closed result is acted on once, even if the effect
    // re-runs (Strict Mode): one navigation, one `onClosed`.
    if (presentation.presentation !== 'embedded') {
      if (navigated.current === presentation) return;
      navigated.current = presentation;
    }

    let unmount: (() => void) | null = null;
    try {
      const mount = mountPayment(element, presentation, {
        onClosed: (page) => callbacks.current.onClosed?.(page),
      });
      if (mount.kind === 'embedded') unmount = mount.unmount;
      else if (mount.kind === 'unsupported')
        callbacks.current.onUnsupported?.(mount.embedKind);
    } catch (e) {
      callbacks.current.onError?.(
        e instanceof Error ? e : new Error(String(e)),
      );
    }
    if (!unmount) return;
    const remove = unmount;
    return () => {
      const entry: Pending = {
        content: embeddedContent(presentation),
        unmount: remove,
        timer: setTimeout(() => {
          if (pending.current === entry) pending.current = null;
          remove();
        }, 0),
      };
      pending.current = entry;
    };
  }, [presentation]);

  return <div {...divProps} ref={ref} />;
}
