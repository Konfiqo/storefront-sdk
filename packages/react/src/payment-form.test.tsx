import { StrictMode } from 'react';
import { act, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PaymentPresentation } from '@konfiqo/storefront-sdk';
import { PaymentForm } from './payment-form';

// The fake provider script counts its runs on <html> (scripts run in
// jsdom's own global, not the test's).
const runs = () => Number(document.documentElement.dataset.paymentRuns ?? 0);

const form = (marker = 'iyzipay-checkout-form'): PaymentPresentation => ({
  presentation: 'embedded',
  embed: {
    kind: 'iyzico-checkout-form',
    content: `<div id="${marker}"></div><script>var d = document.documentElement.dataset; d.paymentRuns = String(Number(d.paymentRuns || 0) + 1);</script>`,
  },
});

/** Lets the deferred form removal (setTimeout 0) run. */
const tick = () => act(() => new Promise((r) => setTimeout(r, 0)));

afterEach(() => {
  delete document.documentElement.dataset.paymentRuns;
});

describe('PaymentForm', () => {
  it('mounts the embedded form, runs its script, removes it on unmount', async () => {
    const { container, unmount } = render(
      <PaymentForm presentation={form()} data-testid="pay" />,
    );
    const host = container.querySelector('[data-testid="pay"]')!;
    expect(host.querySelector('#iyzipay-checkout-form')).not.toBeNull();
    expect(runs()).toBe(1);
    unmount();
    await tick();
    expect(host.childNodes).toHaveLength(0);
  });

  it('runs the provider script once under Strict Mode and on re-render', async () => {
    const presentation = form();
    const { rerender, container } = render(
      <StrictMode>
        <PaymentForm presentation={presentation} />
      </StrictMode>,
    );
    await tick();
    rerender(
      <StrictMode>
        <PaymentForm presentation={presentation} className="x" />
      </StrictMode>,
    );
    await tick();
    expect(runs()).toBe(1);
    expect(container.querySelectorAll('#iyzipay-checkout-form')).toHaveLength(
      1,
    );
  });

  it('replaces the form when the presentation changes', async () => {
    const { rerender, container } = render(
      <PaymentForm presentation={form('a')} />,
    );
    rerender(<PaymentForm presentation={form('b')} />);
    await tick();
    expect(container.querySelector('#a')).toBeNull();
    expect(container.querySelector('#b')).not.toBeNull();
    expect(runs()).toBe(2);
  });

  it('calls onClosed once for a closed result (Strict Mode)', () => {
    const onClosed = vi.fn();
    render(
      <StrictMode>
        <PaymentForm
          presentation={{ presentation: 'closed', page: 'paid' }}
          onClosed={onClosed}
        />
      </StrictMode>,
    );
    expect(onClosed).toHaveBeenCalledOnce();
    expect(onClosed).toHaveBeenCalledWith('paid');
  });

  it('reports an embed kind it cannot render', () => {
    const onUnsupported = vi.fn();
    const { container } = render(
      <PaymentForm
        presentation={{
          presentation: 'embedded',
          embed: { kind: 'other-provider' },
        }}
        onUnsupported={onUnsupported}
      />,
    );
    expect(onUnsupported).toHaveBeenCalledWith('other-provider');
    expect(container.firstElementChild!.childNodes).toHaveLength(0);
  });

  it('reports a redirect it refuses instead of throwing', () => {
    const onError = vi.fn();
    render(
      <PaymentForm
        presentation={{ presentation: 'redirect', url: 'javascript:alert(1)' }}
        onError={onError}
      />,
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0]![0]).toBeInstanceOf(TypeError);
  });
});
