// @vitest-environment node
import { renderToString } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { StorefrontClient } from '@konfiqo/storefront-sdk';
import {
  CheckoutChallenge,
  PaymentForm,
  StorefrontProvider,
  useCart,
  useCategories,
  useCheckout,
  useOrder,
  useProduct,
  useProducts,
  useStore,
} from './index';
import { mockClient } from './test-utils';

describe('server rendering (no window)', () => {
  it('renders every hook and component without touching browser globals', () => {
    expect(typeof window).toBe('undefined');
    const client = mockClient();
    function Page() {
      const store = useStore();
      useCategories();
      useProducts({ page: 1 });
      useProduct('tee');
      const cart = useCart();
      const checkout = useCheckout();
      const order = useOrder('o1', 'secret', { pollUntilFinal: true });
      return (
        <main>
          <p>{`${String(store.isLoading)}|${cart.status}|${String(checkout.isPending)}|${String(order.isLoading)}`}</p>
          <PaymentForm
            presentation={{ presentation: 'closed', page: 'paid' }}
          />
          <CheckoutChallenge siteKey="0x4" onToken={() => {}} />
        </main>
      );
    }
    const html = renderToString(
      <StorefrontProvider
        storeId="s"
        client={client as unknown as StorefrontClient}
      >
        <Page />
      </StorefrontProvider>,
    );
    expect(html).toContain('true|idle|false|true');
    // Effects do not run on the server: nothing was requested.
    expect(client.getContent).not.toHaveBeenCalled();
    for (const ns of Object.values({ ...client, getContent: {} })) {
      for (const fn of Object.values(ns)) {
        if (fn !== client.media.url) expect(fn).not.toHaveBeenCalled();
      }
    }
  });
});

describe('provider refuses secret options', () => {
  it.each(['serverKey', 'trustedStorefrontKey', 'buyerIp'])(
    'throws when config.%s is passed',
    (key) => {
      const config = {
        baseUrl: '/api',
        publishableKey: 'pk_live_x',
        [key]: 'secret',
      };
      expect(() =>
        renderToString(
          <StorefrontProvider storeId="s" config={config}>
            <p />
          </StorefrontProvider>,
        ),
      ).toThrow(new RegExp(`config\\.${key}`));
    },
  );
});
