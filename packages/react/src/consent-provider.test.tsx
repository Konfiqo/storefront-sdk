import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CookieInfo } from '@konfiqo/storefront-sdk';
import { analyticsConsent, readConsent } from './consent';
import { ConsentProvider, useConsent } from './consent-provider';
import type { ConsentRecord } from './consent';

const NECESSARY: CookieInfo = {
  name: '_consent',
  category: 'necessary',
  purpose: 'Remembers your cookie choice.',
  durationDays: 365,
};
const VID: CookieInfo = {
  name: '_vid',
  category: 'analytics',
  purpose: 'Recognises a returning visitor for store statistics.',
  durationDays: 395,
};
const COOKIES = [NECESSARY, VID];

/** A bare consent UI: the state as text and one button per action. */
function Probe() {
  const consent = useConsent();
  return (
    <div>
      <output data-testid="state">
        {JSON.stringify({
          needed: consent.needed,
          known: consent.known,
          showBar: consent.showBar,
          panelOpen: consent.panelOpen,
          categories: consent.categories,
          granted: consent.stored?.granted ?? null,
          cookies: consent.cookies.map((c) => c.name),
        })}
      </output>
      <button type="button" onClick={() => consent.decide(['analytics'])}>
        accept
      </button>
      <button
        type="button"
        onClick={() => consent.decide(['analytics', 'marketing'])}
      >
        accept all
      </button>
      <button type="button" onClick={() => consent.decide([])}>
        reject
      </button>
      <button type="button" onClick={() => consent.open()}>
        open
      </button>
      <button type="button" onClick={consent.close}>
        close
      </button>
    </div>
  );
}

function ui(
  cookies: CookieInfo[],
  version: string,
  onDecision?: (record: ConsentRecord) => void,
) {
  return (
    <ConsentProvider
      cookies={cookies}
      version={version}
      onDecision={onDecision}
    >
      <main id="main" tabIndex={-1}>
        <Probe />
      </main>
    </ConsentProvider>
  );
}

const state = () =>
  JSON.parse(screen.getByTestId('state').textContent!) as {
    needed: boolean;
    known: boolean;
    showBar: boolean;
    panelOpen: boolean;
    categories: string[];
    granted: string[] | null;
    cookies: string[];
  };
const click = (name: string) =>
  fireEvent.click(screen.getByRole('button', { name }));

beforeEach(() => {
  document.cookie = '_consent=; Max-Age=0; Path=/; Secure';
});

describe('ConsentProvider', () => {
  it('accept stores the choice and hands one record to onDecision', () => {
    const onDecision = vi.fn();
    render(ui(COOKIES, 'v1', onDecision));
    expect(state()).toEqual({
      needed: true,
      known: true,
      showBar: true,
      panelOpen: false,
      categories: ['analytics'],
      granted: null,
      cookies: ['_consent', '_vid'],
    });
    expect(analyticsConsent()).toBe(false);

    // Only the categories the store uses are granted.
    click('accept all');

    expect(state().showBar).toBe(false);
    expect(state().granted).toEqual(['analytics']);
    expect(analyticsConsent()).toBe(true);
    const stored = readConsent('v1');
    expect(stored?.granted).toEqual(['analytics']);
    expect(onDecision).toHaveBeenCalledTimes(1);
    expect(onDecision).toHaveBeenCalledWith({
      consentId: stored!.id,
      granted: ['analytics'],
      version: 'v1',
    });
  });

  it('reject keeps analytics consent false and records an empty grant', () => {
    const onDecision = vi.fn();
    render(ui(COOKIES, 'v1', onDecision));
    click('reject');
    expect(state().showBar).toBe(false);
    expect(analyticsConsent()).toBe(false);
    expect(readConsent('v1')?.granted).toEqual([]);
    expect(onDecision.mock.calls[0]![0].granted).toEqual([]);
  });

  it('works without onDecision', () => {
    render(ui(COOKIES, 'v1'));
    click('accept');
    expect(readConsent('v1')?.granted).toEqual(['analytics']);
  });

  it('a later decision keeps the consent id', () => {
    const onDecision = vi.fn();
    render(ui(COOKIES, 'v1', onDecision));
    click('reject');
    click('accept');
    expect(onDecision).toHaveBeenCalledTimes(2);
    const [first, second] = onDecision.mock.calls.map(
      ([record]) => record as ConsentRecord,
    );
    expect(second!.consentId).toBe(first!.consentId);
  });

  it('a new consent version shows the bar again', () => {
    const { unmount } = render(ui(COOKIES, 'v1'));
    click('accept');
    unmount();

    // A later visit with the same version: no bar.
    const again = render(ui(COOKIES, 'v1'));
    expect(state().showBar).toBe(false);
    expect(analyticsConsent()).toBe(true);

    // The store's optional cookie set changed: ask again.
    act(() => again.rerender(ui(COOKIES, 'v2')));
    expect(state().showBar).toBe(true);
    expect(analyticsConsent()).toBe(false);
  });

  it('close ends the panel without a decision and returns focus', () => {
    const onDecision = vi.fn();
    render(ui(COOKIES, 'v1', onDecision));
    const opener = screen.getByRole('button', { name: 'open' });
    opener.focus();
    fireEvent.click(opener);
    expect(state().panelOpen).toBe(true);
    click('close');
    expect(state().panelOpen).toBe(false);
    expect(document.activeElement).toBe(opener);
    expect(onDecision).not.toHaveBeenCalled();
    expect(readConsent('v1')).toBeNull();
    expect(state().showBar).toBe(true);
  });

  it('a decision from the panel returns focus to the opener', () => {
    render(ui(COOKIES, 'v1'));
    click('reject');
    const opener = screen.getByRole('button', { name: 'open' });
    opener.focus();
    fireEvent.click(opener);
    click('accept');
    expect(state().panelOpen).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('a bar decision moves focus to the main content', () => {
    render(ui(COOKIES, 'v1'));
    const reject = screen.getByRole('button', { name: 'reject' });
    reject.focus();
    fireEvent.click(reject);
    expect(document.activeElement?.id).toBe('main');
  });

  it('no optional cookie: consent is not needed', () => {
    const onDecision = vi.fn();
    render(ui([NECESSARY], '', onDecision));
    expect(state()).toMatchObject({
      needed: false,
      showBar: false,
      categories: [],
    });
    expect(analyticsConsent()).toBe(false);
  });

  it('is inert outside a provider', () => {
    render(<Probe />);
    expect(state()).toEqual({
      needed: false,
      known: false,
      showBar: false,
      panelOpen: false,
      categories: [],
      granted: null,
      cookies: [],
    });
    click('accept');
    expect(readConsent('')).toBeNull();
  });
});
