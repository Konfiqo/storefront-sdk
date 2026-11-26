import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import type { CookieInfo } from '@konfiqo/storefront-sdk';
import {
  configureConsent,
  consentFor,
  OPTIONAL_CATEGORIES,
  rawConsent,
  subscribeConsent,
  writeConsent,
  type ConsentRecord,
  type OptionalCookieCategory,
  type StoredConsent,
} from './consent';

/** The consent state the banner, the panel and the footer button share. */
export interface ConsentState {
  /** Whether the store uses an optional cookie (so consent applies). */
  needed: boolean;
  /**
   * Opens the preferences panel; focus returns to `opener` (default: the
   * focused element) on close. When the opener is gone, focus moves to the
   * element with id `main`.
   */
  open: (opener?: HTMLElement | null) => void;
  /** The store's cookies (necessary and optional). */
  cookies: CookieInfo[];
  /** The optional categories the store uses, in display order. */
  categories: OptionalCookieCategory[];
  /** The stored choice for the current version; null when none. */
  stored: StoredConsent | null;
  /**
   * Whether the browser's choice has been read (false on the server and
   * during hydration, when `stored` is null without meaning "no choice").
   */
  known: boolean;
  /** Whether to show the bar: needed and no choice yet (never on the server). */
  showBar: boolean;
  /** Whether the preferences panel is open. */
  panelOpen: boolean;
  /** Closes the panel without a decision. */
  close: () => void;
  /** Stores a decision, passes it to `onDecision`, then closes the panel. */
  decide: (granted: OptionalCookieCategory[]) => void;
}

const noop = () => undefined;

const ConsentContext = createContext<ConsentState>({
  needed: false,
  open: noop,
  cookies: [],
  categories: [],
  known: false,
  stored: null,
  showBar: false,
  panelOpen: false,
  close: noop,
  decide: noop,
});

/** Props of {@link ConsentProvider}: the store's public cookie list. */
export interface ConsentProviderProps {
  cookies: CookieInfo[];
  /** The store's category version ('' when no optional cookie). */
  version: string;
  /**
   * Called after every stored decision, for example to record it with
   * commerce (`recordConsent`). An error it throws is ignored.
   */
  onDecision?: (record: ConsentRecord) => void;
  children?: ReactNode;
}

/** `undefined` on the server and during hydration: the choice is unknown. */
const serverSnapshot = () => undefined;

/**
 * Holds the shopper's cookie choice for the banner and the footer button.
 *
 * When the panel closes, focus returns to the element that opened it. When
 * there is none (it was removed, or the decision was made in the bar),
 * focus moves to the element with id `main`: give your main content
 * `id="main"` and `tabIndex={-1}`.
 */
export function ConsentProvider({
  cookies,
  version,
  onDecision,
  children,
}: ConsentProviderProps) {
  // Done during render so that analytics in effects below already sees it.
  configureConsent(version);
  const raw = useSyncExternalStore(
    subscribeConsent,
    rawConsent,
    serverSnapshot,
  );
  const [panelOpen, setPanelOpen] = useState(false);
  // A choice made on this page, for when cookies are blocked.
  const [decidedVersion, setDecidedVersion] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  // Read at decision time, so a new callback each render changes nothing.
  const onDecisionRef = useRef(onDecision);
  onDecisionRef.current = onDecision;

  const categories = useMemo(
    () =>
      OPTIONAL_CATEGORIES.filter((c) => cookies.some((k) => k.category === c)),
    [cookies],
  );
  const needed = categories.length > 0;
  const stored = useMemo(
    () => (raw === undefined ? null : consentFor(raw, version)),
    [raw, version],
  );
  const known = raw !== undefined;
  const showBar = needed && known && !stored && decidedVersion !== version;

  // Focus goes back to the opener once the panel has closed; to the main
  // content when the opener has gone or the decision was made in the bar
  // (which then closes).
  const restorePending = useRef(false);
  useEffect(() => {
    if (panelOpen || !restorePending.current) return;
    restorePending.current = false;
    const target = opener.current;
    opener.current = null;
    if (target?.isConnected) target.focus();
    else document.getElementById('main')?.focus({ preventScroll: true });
  }, [panelOpen, showBar]);

  const open = useCallback((from?: HTMLElement | null) => {
    // Some browsers do not focus a clicked button: prefer the one passed.
    const active = from ?? document.activeElement;
    opener.current =
      active instanceof HTMLElement && active !== document.body ? active : null;
    setPanelOpen(true);
  }, []);

  const close = useCallback(() => {
    if (panelOpen) restorePending.current = true;
    setPanelOpen(false);
  }, [panelOpen]);

  const decide = useCallback(
    (granted: OptionalCookieCategory[]) => {
      const allowed = categories.filter((c) => granted.includes(c));
      const consentId = writeConsent(version, allowed);
      try {
        onDecisionRef.current?.({ consentId, granted: allowed, version });
      } catch {
        // A failing callback must not keep the panel open or lose focus.
      }
      setDecidedVersion(version);
      if (!panelOpen) opener.current = null;
      restorePending.current = true;
      setPanelOpen(false);
    },
    [categories, version, panelOpen],
  );

  const value = useMemo<ConsentState>(
    () => ({
      needed,
      open,
      cookies,
      categories,
      stored,
      known,
      showBar,
      panelOpen,
      close,
      decide,
    }),
    [
      needed,
      open,
      cookies,
      categories,
      stored,
      known,
      showBar,
      panelOpen,
      close,
      decide,
    ],
  );
  return (
    <ConsentContext.Provider value={value}>{children}</ConsentContext.Provider>
  );
}

/** The shared consent state (inert outside a {@link ConsentProvider}). */
export function useConsent(): ConsentState {
  return useContext(ConsentContext);
}
