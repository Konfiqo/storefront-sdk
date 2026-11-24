import type {
  CheckoutEmbed,
  CheckoutResult,
  ClosedCheckoutPage,
  EmbeddedCheckoutResult,
  RedirectCheckoutResult,
  ClosedCheckoutResult,
} from './models';

/**
 * What {@link mountPayment} renders: a checkout result, or just its
 * presentation part.
 */
export type PaymentPresentation =
  | Pick<EmbeddedCheckoutResult, 'presentation' | 'embed'>
  | Pick<RedirectCheckoutResult, 'presentation' | 'url'>
  | Pick<ClosedCheckoutResult, 'presentation' | 'page'>;

/** Options of {@link mountPayment}. */
export interface MountPaymentOptions {
  /**
   * Called for `presentation: "closed"` with the page to show (`paid`,
   * `cancelled`, `processing`, …). Typically: go to the order status page.
   */
  onClosed?: (page: ClosedCheckoutPage) => void;
}

/** The provider form is in the element. */
export interface EmbeddedPaymentMount {
  /** Discriminator. */
  kind: 'embedded';
  /** Removes the form from the element. */
  unmount(): void;
}

/** The browser is navigating to the provider's payment page. */
export interface RedirectPaymentMount {
  /** Discriminator. */
  kind: 'redirect';
  /** Where the browser was sent. */
  url: string;
}

/** Payment cannot be opened; `onClosed` was called. */
export interface ClosedPaymentMount {
  /** Discriminator. */
  kind: 'closed';
  /** The page to show. */
  page: ClosedCheckoutPage;
}

/**
 * The embed has a `kind` this SDK version cannot render. Nothing was put
 * in the element; show a fallback (e.g. "payment unavailable").
 */
export interface UnsupportedPaymentMount {
  /** Discriminator. */
  kind: 'unsupported';
  /** The embed kind that was not understood. */
  embedKind: string;
}

/** The result of {@link mountPayment}, discriminated by `kind`. */
export type PaymentMount =
  | EmbeddedPaymentMount
  | RedirectPaymentMount
  | ClosedPaymentMount
  | UnsupportedPaymentMount;

interface MountedForm {
  content: string;
  nodes: Node[];
  unmount: () => void;
}

/** What each element currently holds, so a repeat mount is a no-op. */
const mounted = new WeakMap<Element, MountedForm>();

/**
 * Presents payment from a checkout result. Card data never touches your
 * page's code: the form is the provider's own, or a redirect.
 *
 * - `embedded` (`iyzico-checkout-form`): puts the provider's HTML into
 *   `element` and re-creates every `<script>` in it so it executes
 *   (`innerHTML` alone never runs scripts). Idempotent per element:
 *   mounting the same content again does nothing, other content replaces
 *   the previous form — scripts are never injected twice.
 * - `redirect`: top-level navigation to the provider page
 *   (`location.assign`). Only `http:` / `https:` URLs are followed.
 * - `closed`: calls `onClosed(page)`.
 *
 * Browser only (needs a DOM).
 *
 * @throws TypeError for a redirect URL that is not `http(s)`.
 */
export function mountPayment(
  element: HTMLElement,
  presentation: PaymentPresentation | CheckoutResult,
  options: MountPaymentOptions = {},
): PaymentMount {
  switch (presentation.presentation) {
    case 'embedded':
      return mountEmbedded(element, presentation.embed);
    case 'redirect': {
      const url = presentation.url;
      let protocol: string;
      try {
        protocol = new URL(url).protocol;
      } catch {
        protocol = '';
      }
      if (protocol !== 'https:' && protocol !== 'http:') {
        throw new TypeError('mountPayment: redirect URL must be http(s)');
      }
      const view = element.ownerDocument.defaultView;
      if (!view) throw new TypeError('mountPayment: element has no window');
      view.location.assign(url);
      return { kind: 'redirect', url };
    }
    case 'closed':
      options.onClosed?.(presentation.page);
      return { kind: 'closed', page: presentation.page };
  }
}

function mountEmbedded(
  element: HTMLElement,
  embed: CheckoutEmbed,
): EmbeddedPaymentMount | UnsupportedPaymentMount {
  if (
    embed.kind !== 'iyzico-checkout-form' ||
    typeof embed.content !== 'string'
  ) {
    return { kind: 'unsupported', embedKind: String(embed.kind) };
  }
  const content = embed.content;
  const current = mounted.get(element);
  if (
    current &&
    current.content === content &&
    current.nodes.every((n) => n.parentNode === element)
  ) {
    return { kind: 'embedded', unmount: current.unmount };
  }

  element.replaceChildren();
  // The provider's own checkout form (from the payments service). It must
  // run its scripts, so it cannot be sanitised; it is the only HTML this
  // SDK ever injects.
  element.innerHTML = content;
  const doc = element.ownerDocument;
  for (const inert of Array.from(element.querySelectorAll('script'))) {
    const live = doc.createElement('script');
    for (const attr of Array.from(inert.attributes)) {
      live.setAttribute(attr.name, attr.value);
    }
    // Dynamically inserted external scripts are async by default; keep
    // document order like the provider's markup expects.
    if (live.hasAttribute('src')) live.async = false;
    live.text = inert.text;
    inert.replaceWith(live);
  }
  const entry: MountedForm = {
    content,
    nodes: Array.from(element.childNodes),
    unmount: () => {
      // A stale handle never removes a newer form.
      if (mounted.get(element) !== entry) return;
      for (const node of entry.nodes) node.parentNode?.removeChild(node);
      mounted.delete(element);
    },
  };
  mounted.set(element, entry);
  return { kind: 'embedded', unmount: entry.unmount };
}
