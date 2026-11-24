import { createRef } from 'react';
import { act, render, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cartIdKey, type TurnstileApi } from '@konfiqo/storefront-sdk';
import {
  CheckoutChallenge,
  type CheckoutChallengeHandle,
} from './checkout-challenge';
import { useCheckout } from './use-checkout';
import {
  apiError,
  makeCart,
  memoryStorage,
  mockClient,
  wrapper,
} from './test-utils';

type Win = Window & { turnstile?: TurnstileApi };
const win = window as Win;
let fake: {
  render: ReturnType<typeof vi.fn>;
  reset: ReturnType<typeof vi.fn>;
  remove: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  fake = {
    render: vi.fn(() => 'w-1'),
    reset: vi.fn(),
    remove: vi.fn(),
  };
  win.turnstile = fake as unknown as TurnstileApi;
});
afterEach(() => {
  delete win.turnstile;
});

const flush = () => act(async () => {});
const params = () =>
  fake.render.mock.calls[0]![1] as {
    sitekey: string;
    callback: (t: string) => void;
    'expired-callback': () => void;
  };

describe('CheckoutChallenge', () => {
  it('renders the widget with the site key and passes tokens on', async () => {
    const onToken = vi.fn();
    const onExpired = vi.fn();
    const { container, unmount } = render(
      <CheckoutChallenge
        siteKey="0x4AAA"
        onToken={onToken}
        onExpired={onExpired}
      />,
    );
    await flush();
    expect(fake.render).toHaveBeenCalledOnce();
    expect(fake.render.mock.calls[0]![0]).toBe(container.firstElementChild);
    expect(params().sitekey).toBe('0x4AAA');
    params().callback('tok-1');
    expect(onToken).toHaveBeenCalledWith('tok-1');
    params()['expired-callback']();
    expect(onExpired).toHaveBeenCalledOnce();
    unmount();
    expect(fake.remove).toHaveBeenCalledWith('w-1');
  });

  it('renders nothing without a site key', async () => {
    render(<CheckoutChallenge siteKey={null} onToken={() => {}} />);
    await flush();
    expect(fake.render).not.toHaveBeenCalled();
  });

  it('reset() through the ref gets a new token and drops the old one', async () => {
    const ref = createRef<CheckoutChallengeHandle>();
    const onExpired = vi.fn();
    render(
      <CheckoutChallenge
        ref={ref}
        siteKey="k"
        onToken={() => {}}
        onExpired={onExpired}
      />,
    );
    await flush();
    act(() => ref.current!.reset());
    expect(fake.reset).toHaveBeenCalledWith('w-1');
    expect(onExpired).toHaveBeenCalledOnce();
  });

  it('resets itself after every checkout attempt (tokens are single-use)', async () => {
    const client = mockClient();
    client.carts.get.mockResolvedValue(makeCart('c1'));
    client.carts.checkout
      .mockRejectedValueOnce(apiError('challenge_failed', 403, undefined))
      .mockResolvedValueOnce({
        presentation: 'closed',
        page: 'paid',
        orderId: 'o1',
        orderNumber: 'n',
      });
    const Wrapper = wrapper(
      client,
      memoryStorage({ [cartIdKey('store-1')]: 'c1' }),
    );
    const onExpired = vi.fn();
    const { result } = renderHook(() => useCheckout(), {
      wrapper: ({ children }) => (
        <Wrapper>
          <CheckoutChallenge
            siteKey="k"
            onToken={() => {}}
            onExpired={onExpired}
          />
          {children}
        </Wrapper>
      ),
    });
    await flush();
    expect(fake.reset).not.toHaveBeenCalled();
    await act(async () => {
      await result.current.checkout({ turnstileToken: 't1' }).catch(() => {});
    });
    expect(fake.reset).toHaveBeenCalledTimes(1);
    await act(async () => {
      await result.current.checkout({ turnstileToken: 't2' });
    });
    expect(fake.reset).toHaveBeenCalledTimes(2);
    expect(onExpired).toHaveBeenCalledTimes(2);
  });

  it('reports a script that fails to load', async () => {
    delete win.turnstile;
    const onError = vi.fn();
    render(
      <CheckoutChallenge siteKey="k" onToken={() => {}} onError={onError} />,
    );
    const script = document.querySelector('script[src*="turnstile"]')!;
    expect(script).not.toBeNull();
    act(() => {
      script.dispatchEvent(new Event('error'));
    });
    await flush();
    expect(onError).toHaveBeenCalledOnce();
    expect(document.querySelector('script[src*="turnstile"]')).toBeNull();
  });
});
