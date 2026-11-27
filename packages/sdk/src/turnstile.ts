/**
 * Cloudflare's official Turnstile script, explicit-render mode. The only
 * URL {@link loadTurnstile} ever injects.
 */
export const TURNSTILE_SCRIPT_URL =
  'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

/** The subset of Cloudflare's `window.turnstile` API the SDK uses. */
export interface TurnstileApi {
  /** Renders a widget into `container`; returns its widget id. */
  render(
    container: HTMLElement | string,
    params: {
      sitekey: string;
      callback?: (token: string) => void;
      'expired-callback'?: () => void;
      'error-callback'?: (code?: string) => void;
      [key: string]: unknown;
    },
  ): string | null | undefined;
  /** Resets a widget so it produces a new token. */
  reset(widgetId?: string): void;
  /** Removes a widget. */
  remove(widgetId?: string): void;
}

type TurnstileWindow = Window & { turnstile?: TurnstileApi };

const loading = new WeakMap<Document, Promise<TurnstileApi>>();

/**
 * Loads Cloudflare Turnstile into `document` (once: the script is injected
 * at most once per document, concurrent calls share one load) and resolves
 * with `window.turnstile`. Rejects when the script fails to load; the
 * failed `<script>` is removed, so calling again injects a fresh one.
 */
export function loadTurnstile(document: Document): Promise<TurnstileApi> {
  const view = document.defaultView as TurnstileWindow | null;
  if (!view)
    return Promise.reject(
      new TypeError('loadTurnstile: document has no window'),
    );
  if (view.turnstile) return Promise.resolve(view.turnstile);
  const pending = loading.get(document);
  if (pending) return pending;

  const promise = new Promise<TurnstileApi>((resolve, reject) => {
    let script = Array.from(document.scripts).find(
      (s) => s.src === TURNSTILE_SCRIPT_URL,
    );
    if (!script) {
      script = document.createElement('script');
      script.src = TURNSTILE_SCRIPT_URL;
      script.async = true;
      (document.head ?? document.documentElement).appendChild(script);
    }
    script.addEventListener('load', () => {
      if (view.turnstile) resolve(view.turnstile);
      else
        reject(
          new Error('loadTurnstile: script loaded without window.turnstile'),
        );
    });
    const tag = script;
    tag.addEventListener('error', () => {
      // A failed tag never loads again: remove it so a retry injects a
      // fresh one instead of waiting on the dead tag forever.
      tag.remove();
      reject(new Error('loadTurnstile: script failed to load'));
    });
  });
  loading.set(document, promise);
  // A failed load can be retried by calling again.
  promise.catch(() => {
    if (loading.get(document) === promise) loading.delete(document);
  });
  return promise;
}

/** Callbacks of {@link renderTurnstile}. */
export interface RenderTurnstileOptions {
  /** A token is ready: keep it for the next `carts.checkout` call. */
  onToken: (token: string) => void;
  /** The token expired unused (about 5 minutes): drop it; the widget refreshes. */
  onExpired?: () => void;
  /** The widget failed (network, unsupported browser, …). */
  onError?: (code?: string) => void;
}

/** A rendered Turnstile widget. */
export interface TurnstileWidget {
  /** The widget id. */
  readonly widgetId: string;
  /**
   * Gets a new token. Call it after every `carts.checkout` that used the
   * current token: tokens are **single-use**.
   */
  reset(): void;
  /** Removes the widget. */
  remove(): void;
}

/**
 * Renders a Turnstile widget with the store's `siteKey`
 * (`store.checkoutChallenge.siteKey`) into `element`, loading the script
 * first if needed. Pass each token from `onToken` to
 * `carts.checkout(id, { agreementsHash, turnstileToken })`, then `reset()`.
 */
export async function renderTurnstile(
  element: HTMLElement,
  siteKey: string,
  options: RenderTurnstileOptions,
): Promise<TurnstileWidget> {
  if (!siteKey) throw new TypeError('renderTurnstile: siteKey is required');
  const turnstile = await loadTurnstile(element.ownerDocument);
  const params: Parameters<TurnstileApi['render']>[1] = {
    sitekey: siteKey,
    callback: (token: string) => options.onToken(token),
    'expired-callback': () => options.onExpired?.(),
    'error-callback': (code?: string) => options.onError?.(code),
  };
  const widgetId = turnstile.render(element, params);
  if (!widgetId) throw new Error('renderTurnstile: the widget did not render');
  return {
    widgetId,
    reset: () => turnstile.reset(widgetId),
    remove: () => turnstile.remove(widgetId),
  };
}
