import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createStorefrontClient,
  isStorefrontError,
  StorefrontError,
  type AnyStorefrontError,
  type StorefrontClientOptions,
} from './index';

const BASE = 'https://api.example.test';
const PK = 'pk_live_abc';

interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string | undefined;
}

function json(
  status: number,
  body: unknown,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

function setup(
  respond: () => Response | Promise<Response> = () => json(200, { ok: true }),
  options: Partial<StorefrontClientOptions> = {},
) {
  const calls: Call[] = [];
  const fetchMock = vi.fn(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({
        url: String(input),
        method: init?.method ?? 'GET',
        headers: { ...(init?.headers as Record<string, string>) },
        body: init?.body as string | undefined,
      });
      return respond();
    },
  );
  const client = createStorefrontClient({
    baseUrl: `${BASE}/`,
    publishableKey: PK,
    fetch: fetchMock as unknown as typeof fetch,
    ...options,
  });
  return { client, calls, fetchMock };
}

async function rejection(p: Promise<unknown>): Promise<AnyStorefrontError> {
  try {
    await p;
  } catch (e) {
    if (isStorefrontError(e)) return e;
    throw e;
  }
  throw new Error('expected a rejection');
}

describe('routes', () => {
  type RouteCase = {
    name: string;
    call: (c: ReturnType<typeof setup>['client']) => Promise<unknown>;
    method: string;
    path: string;
    body?: unknown;
  };
  const address = {
    line1: 'Atatürk Cd. 1',
    district: 'Kadıköy',
    city: 'İstanbul',
    country: 'TR' as const,
  };
  const routes: RouteCase[] = [
    {
      name: 'store.get',
      call: (c) => c.store.get(),
      method: 'GET',
      path: '/v1/store',
    },
    {
      name: 'categories.list',
      call: (c) => c.categories.list(),
      method: 'GET',
      path: '/v1/categories',
    },
    {
      name: 'products.list (no query)',
      call: (c) => c.products.list(),
      method: 'GET',
      path: '/v1/products',
    },
    {
      name: 'products.list (query)',
      call: (c) =>
        c.products.list({
          category: 'kadın giyim',
          q: 'a&b',
          page: 2,
          pageSize: 50,
        }),
      method: 'GET',
      path: '/v1/products?category=kad%C4%B1n+giyim&q=a%26b&page=2&pageSize=50',
    },
    {
      name: 'products.get',
      call: (c) => c.products.get('t-shirt/ü'),
      method: 'GET',
      path: '/v1/products/t-shirt%2F%C3%BC',
    },
    {
      name: 'getContent',
      call: (c) => c.getContent('home.hero'),
      method: 'GET',
      path: '/v1/content/home.hero',
    },
    {
      name: 'carts.create',
      call: (c) => c.carts.create(),
      method: 'POST',
      path: '/v1/carts',
    },
    {
      name: 'carts.get',
      call: (c) => c.carts.get('c1'),
      method: 'GET',
      path: '/v1/carts/c1',
    },
    {
      name: 'carts.addLine',
      call: (c) => c.carts.addLine('c1', { variantId: 'v1', quantity: 2 }),
      method: 'POST',
      path: '/v1/carts/c1/lines',
      body: { variantId: 'v1', quantity: 2 },
    },
    {
      name: 'carts.addLine (personalization)',
      call: (c) =>
        c.carts.addLine('c1', {
          variantId: 'v1',
          quantity: 1,
          personalization: 'Sarı',
        }),
      method: 'POST',
      path: '/v1/carts/c1/lines',
      body: { variantId: 'v1', quantity: 1, personalization: 'Sarı' },
    },
    {
      name: 'carts.updateLine (personalized line id)',
      call: (c) => c.carts.updateLine('c1', 'v1~abc', { quantity: 3 }),
      method: 'PATCH',
      path: '/v1/carts/c1/lines/v1~abc',
      body: { quantity: 3 },
    },
    {
      name: 'carts.removeLine (personalized line id)',
      call: (c) => c.carts.removeLine('c1', 'v1~a/b'),
      method: 'DELETE',
      path: '/v1/carts/c1/lines/v1~a%2Fb',
    },
    {
      name: 'carts.updateLine',
      call: (c) => c.carts.updateLine('c1', 'v/1', { quantity: 3 }),
      method: 'PATCH',
      path: '/v1/carts/c1/lines/v%2F1',
      body: { quantity: 3 },
    },
    {
      name: 'carts.removeLine',
      call: (c) => c.carts.removeLine('c1', 'v1'),
      method: 'DELETE',
      path: '/v1/carts/c1/lines/v1',
    },
    {
      name: 'carts.setCustomer',
      call: (c) =>
        c.carts.setCustomer('c1', {
          email: 'a@b.co',
          name: 'Ayşe',
          surname: 'Yılmaz',
          phone: '0532 123 45 67',
          identityNumber: '12345678901',
        }),
      method: 'PUT',
      path: '/v1/carts/c1/customer',
      body: {
        email: 'a@b.co',
        name: 'Ayşe',
        surname: 'Yılmaz',
        phone: '0532 123 45 67',
        identityNumber: '12345678901',
      },
    },
    {
      name: 'carts.setAddress',
      call: (c) =>
        c.carts.setAddress('c1', { shipping: address, billing: null }),
      method: 'PUT',
      path: '/v1/carts/c1/address',
      body: { shipping: address, billing: null },
    },
    {
      name: 'carts.shippingOptions',
      call: (c) => c.carts.shippingOptions('c1'),
      method: 'GET',
      path: '/v1/carts/c1/shipping-options',
    },
    {
      name: 'carts.setShippingOption',
      call: (c) => c.carts.setShippingOption('c1', 'standard'),
      method: 'PUT',
      path: '/v1/carts/c1/shipping-option',
      body: { id: 'standard' },
    },
    {
      name: 'carts.checkout',
      call: (c) => c.carts.checkout('c1'),
      method: 'POST',
      path: '/v1/carts/c1/checkout',
    },
    {
      name: 'orders.get',
      call: (c) => c.orders.get('o1', 'tok+/=&x'),
      method: 'GET',
      path: '/v1/orders/o1?token=tok%2B%2F%3D%26x',
    },
  ];

  it.each(routes)(
    '$name → $method $path',
    async ({ call, method, path, body }) => {
      const { client, calls } = setup();
      await expect(call(client)).resolves.toEqual({ ok: true });
      expect(calls).toHaveLength(1);
      const [c] = calls;
      expect(c!.method).toBe(method);
      expect(c!.url).toBe(`${BASE}${path}`);
      expect(c!.headers['x-konfiqo-publishable-key']).toBe(PK);
      expect(c!.headers).not.toHaveProperty('x-konfiqo-storefront-key');
      expect(c!.headers).not.toHaveProperty('x-konfiqo-buyer-ip');
      if (body === undefined) {
        expect(c!.body).toBeUndefined();
        expect(c!.headers).not.toHaveProperty('content-type');
      } else {
        expect(c!.headers['content-type']).toBe('application/json');
        expect(JSON.parse(c!.body!)).toEqual(body);
      }
    },
  );

  it('returns the parsed body as is', async () => {
    const cart = { id: 'c1', status: 'open', lines: [], totalMinor: 0 };
    const { client } = setup(() => json(200, cart));
    await expect(client.carts.create()).resolves.toEqual(cart);
  });

  it('returns each checkout presentation, discriminated', async () => {
    const results = [
      {
        orderId: 'o',
        orderNumber: 'n',
        token: 't',
        presentation: 'embedded',
        embed: { kind: 'iyzico-checkout-form', content: '<div/>' },
      },
      {
        orderId: 'o',
        orderNumber: 'n',
        presentation: 'redirect',
        url: 'https://pay.example/x',
      },
      {
        orderId: 'o',
        orderNumber: 'n',
        orderStatus: 'paid',
        presentation: 'closed',
        page: 'paid',
      },
    ];
    for (const r of results) {
      const { client } = setup(() => json(200, r));
      const out = await client.carts.checkout('c1');
      switch (out.presentation) {
        case 'embedded':
          expect(out.embed.kind).toBe('iyzico-checkout-form');
          break;
        case 'redirect':
          expect(out.url).toBe('https://pay.example/x');
          break;
        case 'closed':
          expect(out.page).toBe('paid');
          break;
      }
      expect(out).toEqual(r);
    }
  });

  it('uses the global fetch when none is given, called detached', async () => {
    const seen: unknown[] = [];
    const globalFetch = vi.fn(function (this: unknown) {
      seen.push(this);
      return Promise.resolve(json(200, { ok: true }));
    });
    vi.stubGlobal('fetch', globalFetch);
    try {
      const client = createStorefrontClient({
        baseUrl: BASE,
        publishableKey: PK,
      });
      await client.store.get();
      expect(globalFetch).toHaveBeenCalledOnce();
      expect(seen[0]).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('trusted storefront key', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the storefront key and buyer IP only when configured', async () => {
    const { client, calls } = setup(undefined, {
      trustedStorefrontKey: 'sk_trusted',
      buyerIp: ' 203.0.113.9 ',
    });
    await client.carts.checkout('c1');
    expect(calls[0]!.headers).toMatchObject({
      'x-konfiqo-publishable-key': PK,
      'x-konfiqo-storefront-key': 'sk_trusted',
      'x-konfiqo-buyer-ip': '203.0.113.9',
    });
  });

  it('never sends buyerIp without the trusted key', async () => {
    const { client, calls } = setup(undefined, { buyerIp: '203.0.113.9' });
    await client.store.get();
    expect(calls[0]!.headers).not.toHaveProperty('x-konfiqo-buyer-ip');
    expect(calls[0]!.headers).not.toHaveProperty('x-konfiqo-storefront-key');
  });

  it('throws when used where window exists (a browser)', () => {
    vi.stubGlobal('window', {});
    expect(() =>
      createStorefrontClient({
        baseUrl: BASE,
        publishableKey: PK,
        trustedStorefrontKey: 'sk',
        buyerIp: '1.2.3.4',
      }),
    ).toThrow(/server-only/);
    // The publishable-key client still works in a browser.
    expect(() =>
      createStorefrontClient({ baseUrl: BASE, publishableKey: PK }),
    ).not.toThrow();
  });

  it('requires buyerIp with the trusted key', () => {
    expect(() =>
      createStorefrontClient({
        baseUrl: BASE,
        publishableKey: PK,
        trustedStorefrontKey: 'sk',
      }),
    ).toThrow(/buyerIp is required/);
  });
});

describe('server key', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends the server key, the publishable key and the buyer IP', async () => {
    const { client, calls } = setup(undefined, {
      serverKey: 'sk_store',
      buyerIp: ' 203.0.113.9 ',
    });
    await client.carts.checkout('c1');
    expect(calls[0]!.headers).toMatchObject({
      'x-konfiqo-publishable-key': PK,
      'x-konfiqo-server-key': 'sk_store',
      'x-konfiqo-buyer-ip': '203.0.113.9',
    });
    expect(calls[0]!.headers).not.toHaveProperty('x-konfiqo-storefront-key');
  });

  it('requires buyerIp with the server key', () => {
    expect(() =>
      createStorefrontClient({
        baseUrl: BASE,
        publishableKey: PK,
        serverKey: 'sk',
      }),
    ).toThrow(/buyerIp is required/);
  });

  it('throws where window exists (a browser)', () => {
    vi.stubGlobal('window', {});
    expect(() =>
      createStorefrontClient({
        baseUrl: BASE,
        publishableKey: PK,
        serverKey: 'sk',
        buyerIp: '1.2.3.4',
      }),
    ).toThrow(/serverKey must never be used in a browser/);
  });

  it('throws where only document exists', () => {
    vi.stubGlobal('document', {});
    expect(() =>
      createStorefrontClient({
        baseUrl: BASE,
        publishableKey: PK,
        serverKey: 'sk',
        buyerIp: '1.2.3.4',
      }),
    ).toThrow(/serverKey must never be used in a browser/);
  });

  it('throws when given together with trustedStorefrontKey', () => {
    expect(() =>
      createStorefrontClient({
        baseUrl: BASE,
        publishableKey: PK,
        serverKey: 'sk',
        trustedStorefrontKey: 'tk',
        buyerIp: '1.2.3.4',
      }),
    ).toThrow(TypeError);
  });
});

describe('relative /api base URL', () => {
  it('builds /api/v1 request URLs', async () => {
    const { client, calls } = setup(undefined, { baseUrl: '/api' });
    await client.store.get();
    expect(calls[0]!.url).toBe('/api/v1/store');
  });

  it('builds /api/v1/media URLs', () => {
    const client = createStorefrontClient({
      baseUrl: '/api/',
      publishableKey: PK,
    });
    expect(client.media.url('products/a.jpg')).toBe(
      `/api/v1/media/products/a.jpg?pk=${PK}`,
    );
  });
});

describe('options', () => {
  it('rejects an empty baseUrl, publishableKey or a bad timeout', () => {
    expect(() =>
      createStorefrontClient({ baseUrl: ' ', publishableKey: PK }),
    ).toThrow(TypeError);
    expect(() =>
      createStorefrontClient({ baseUrl: BASE, publishableKey: '' }),
    ).toThrow(TypeError);
    expect(() =>
      createStorefrontClient({
        baseUrl: BASE,
        publishableKey: PK,
        timeoutMs: 0,
      }),
    ).toThrow(TypeError);
  });
});

describe('media.url', () => {
  const client = createStorefrontClient({
    baseUrl: `${BASE}//`,
    publishableKey: 'pk_test_a+b',
  });

  it('encodes each key segment and keeps the slashes', () => {
    expect(client.media.url('tenants/t 1/ürün #1?.png')).toBe(
      `${BASE}/v1/media/tenants/t%201/%C3%BCr%C3%BCn%20%231%3F.png?pk=pk_test_a%2Bb`,
    );
  });

  it('matches the API-built relative URL for a plain key', () => {
    expect(client.media.url('products/a.jpg')).toBe(
      `${BASE}/v1/media/products/a.jpg?pk=pk_test_a%2Bb`,
    );
  });
});

describe('errors', () => {
  const lines = [
    {
      variantId: 'v1',
      quantity: 2,
      purchasable: true,
      inStock: true,
      productId: 'p1',
      productSlug: 's',
      productName: 'n',
      variantTitle: 'S',
      sku: 'k',
      unitPriceMinor: 100,
      lineTotalMinor: 200,
    },
  ];
  const documented: {
    error: string;
    status: number;
    extra?: Record<string, unknown>;
    details?: unknown;
  }[] = [
    { error: 'store_not_found', status: 404 },
    { error: 'origin_not_allowed', status: 403 },
    { error: 'cart_not_found', status: 404 },
    { error: 'catalog_unavailable', status: 503 },
    { error: 'product_not_found', status: 404 },
    { error: 'variant_not_found', status: 404 },
    {
      error: 'insufficient_stock',
      status: 409,
      extra: { available: 3 },
      details: { available: 3 },
    },
    { error: 'quantity_out_of_range', status: 400 },
    { error: 'too_many_lines', status: 400 },
    { error: 'line_not_found', status: 404 },
    {
      error: 'invalid_request',
      status: 400,
      extra: {
        issues: [{ path: 'phone', message: 'must be a Turkish mobile number' }],
      },
      details: {
        issues: [{ path: 'phone', message: 'must be a Turkish mobile number' }],
      },
    },
    { error: 'invalid_shipping_option', status: 400 },
    {
      error: 'cart_read_only',
      status: 409,
      extra: { status: 'ordered' },
      details: { status: 'ordered' },
    },
    {
      error: 'cart_read_only',
      status: 409,
      extra: { status: 'expired' },
      details: { status: 'expired' },
    },
    { error: 'checkout_in_progress', status: 409 },
    {
      error: 'checkout_incomplete',
      status: 400,
      extra: { missing: ['customer', 'identityNumber'] },
      details: { missing: ['customer', 'identityNumber'] },
    },
    {
      error: 'cart_changed',
      status: 409,
      extra: {
        lines,
        subtotalMinor: 200,
        shippingMinor: 4990,
        totalMinor: 5190,
        shippingOptions: [{ id: 'standard', priceMinor: 4990 }],
      },
      details: {
        lines,
        subtotalMinor: 200,
        shippingMinor: 4990,
        totalMinor: 5190,
        shippingOptions: [{ id: 'standard', priceMinor: 4990 }],
      },
    },
    {
      error: 'out_of_stock',
      status: 409,
      extra: { variantIds: ['v1', 'v2'] },
      details: { variantIds: ['v1', 'v2'] },
    },
    {
      error: 'invalid_personalization',
      status: 409,
      extra: { lineIds: ['v1~abc'] },
      details: { lineIds: ['v1~abc'] },
    },
    { error: 'invalid_personalization', status: 400, details: {} },
    { error: 'amount_out_of_range', status: 400 },
    { error: 'nothing_to_pay', status: 400 },
    {
      error: 'invalid_buyer_details',
      status: 422,
      extra: { field: 'shippingAddress.city' },
      details: { field: 'shippingAddress.city' },
    },
    { error: 'payment_unavailable', status: 502 },
    { error: 'checkout_unavailable', status: 503 },
    { error: 'order_not_found', status: 404 },
    { error: 'order_unavailable', status: 503 },
    { error: 'media_not_found', status: 404 },
    { error: 'media_unavailable', status: 503 },
    { error: 'invalid_buyer_ip', status: 400 },
  ];

  it.each(documented)(
    'maps $error ($status)',
    async ({ error, status, extra, details }) => {
      const { client } = setup(() =>
        json(status, {
          statusCode: status,
          error,
          message: `msg ${error}`,
          ...extra,
        }),
      );
      const e = await rejection(client.carts.checkout('c1'));
      expect(e).toBeInstanceOf(StorefrontError);
      expect(e).toBeInstanceOf(Error);
      expect(e.name).toBe('StorefrontError');
      expect(e.code).toBe(error);
      expect(e.status).toBe(status);
      expect(e.message).toBe(`msg ${error}`);
      expect(e.details).toEqual(details);
    },
  );

  it('narrows details by code (type-level and runtime)', async () => {
    const { client } = setup(() =>
      json(409, {
        statusCode: 409,
        error: 'out_of_stock',
        message: 'x',
        variantIds: ['v9'],
      }),
    );
    const e = await rejection(client.carts.checkout('c1'));
    switch (e.code) {
      case 'out_of_stock': {
        const ids: string[] = e.details.variantIds;
        expect(ids).toEqual(['v9']);
        break;
      }
      default:
        throw new Error('expected out_of_stock');
    }
    expect(e.is('out_of_stock') && e.details.variantIds).toEqual(['v9']);
    expect(e.is('cart_changed')).toBe(false);
  });

  it('maps an invalid_request without a message (the API omits it)', async () => {
    const { client } = setup(() =>
      json(400, {
        statusCode: 400,
        error: 'invalid_request',
        issues: [{ path: 'q', message: 'too long' }],
      }),
    );
    const e = await rejection(client.products.list({ q: 'x' }));
    expect(e.code).toBe('invalid_request');
    expect(e.message).toBe('Storefront API request failed (HTTP 400)');
    expect(e.details).toEqual({ issues: [{ path: 'q', message: 'too long' }] });
  });

  it('maps 429 to rate_limited with Retry-After seconds', async () => {
    const { client } = setup(() =>
      json(
        429,
        { statusCode: 429, message: 'ThrottlerException: Too Many Requests' },
        { 'retry-after': '42' },
      ),
    );
    const e = await rejection(client.carts.checkout('c1'));
    expect(e.code).toBe('rate_limited');
    expect(e.status).toBe(429);
    expect(e.details).toEqual({ retryAfter: 42 });
  });

  it('reads the per-IP throttler header too', async () => {
    const { client } = setup(() => json(429, {}, { 'retry-after-ip': '7' }));
    const e = await rejection(client.store.get());
    expect(e.details).toEqual({ retryAfter: 7 });
  });

  it('takes the larger of Retry-After and Retry-After-ip', async () => {
    const { client } = setup(() =>
      json(429, {}, { 'retry-after': '3', 'retry-after-ip': '40' }),
    );
    const e = await rejection(client.store.get());
    expect(e.details).toEqual({ retryAfter: 40 });
    const { client: c2 } = setup(() =>
      json(429, {}, { 'retry-after': '50', 'retry-after-ip': 'soon' }),
    );
    expect((await rejection(c2.store.get())).details).toEqual({
      retryAfter: 50,
    });
  });

  it('reads an HTTP-date Retry-After', async () => {
    const at = new Date(Date.now() + 30_000).toUTCString();
    const { client } = setup(() => json(429, {}, { 'retry-after': at }));
    const e = await rejection(client.store.get());
    expect(e.code).toBe('rate_limited');
    const retryAfter = e.is('rate_limited') ? e.details.retryAfter : undefined;
    expect(retryAfter).toBeGreaterThanOrEqual(28);
    expect(retryAfter).toBeLessThanOrEqual(30);
  });

  it('maps 429 without Retry-After to rate_limited with no retryAfter', async () => {
    const { client } = setup(
      () => new Response('Too Many Requests', { status: 429 }),
    );
    const e = await rejection(client.store.get());
    expect(e.code).toBe('rate_limited');
    expect(e.details).toEqual({});
  });

  it('maps a 401 without a code to unauthorized', async () => {
    const { client } = setup(() =>
      json(401, { statusCode: 401, message: 'Unauthorized' }),
    );
    const e = await rejection(client.store.get());
    expect(e.code).toBe('unauthorized');
    expect(e.status).toBe(401);
    expect(e.details).toBeUndefined();
  });

  it('maps an uncoded or non-JSON error response to http_error', async () => {
    const { client } = setup(
      () => new Response('<html>bad gateway</html>', { status: 502 }),
    );
    const e = await rejection(client.store.get());
    expect(e.code).toBe('http_error');
    expect(e.status).toBe(502);
  });

  it('maps an unknown error code to unknown_error, keeping the code', async () => {
    const { client } = setup(() =>
      json(418, { statusCode: 418, error: 'brand_new_code', message: 'm' }),
    );
    const e = await rejection(client.store.get());
    expect(e.code).toBe('unknown_error');
    expect(e.details).toEqual({ error: 'brand_new_code' });
  });

  it('maps a non-JSON 2xx to invalid_response', async () => {
    const { client } = setup(() => new Response('ok', { status: 200 }));
    const e = await rejection(client.store.get());
    expect(e.code).toBe('invalid_response');
  });

  it('maps a fetch failure to network_error with the cause', async () => {
    const cause = new TypeError('Failed to fetch');
    const { client } = setup(() => Promise.reject(cause));
    const e = await rejection(client.store.get());
    expect(e.code).toBe('network_error');
    expect(e.status).toBe(0);
    expect(e.cause).toBe(cause);
  });

  it('never puts the order token in the error message', async () => {
    const { client } = setup(() => Promise.reject(new TypeError('x')));
    const e = await rejection(client.orders.get('o1', 'secret-token'));
    expect(e.message).not.toContain('secret-token');
  });

  it('does not retry', async () => {
    const { client, fetchMock } = setup(() =>
      json(503, {
        statusCode: 503,
        error: 'checkout_unavailable',
        message: 'm',
      }),
    );
    await rejection(client.carts.checkout('c1'));
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

describe('timeout', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('aborts and rejects with timeout after timeoutMs', async () => {
    vi.useFakeTimers();
    let signal: AbortSignal | undefined;
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      signal = init?.signal ?? undefined;
      return new Promise<Response>(() => {});
    });
    const client = createStorefrontClient({
      baseUrl: BASE,
      publishableKey: PK,
      timeoutMs: 1000,
      fetch: fetchMock as unknown as typeof fetch,
    });
    const p = rejection(client.store.get());
    await vi.advanceTimersByTimeAsync(999);
    expect(signal?.aborted).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    const e = await p;
    expect(e.code).toBe('timeout');
    expect(e.status).toBe(0);
    expect(e.details).toEqual({ timeoutMs: 1000 });
    expect(signal?.aborted).toBe(true);
  });

  it('defaults to 15 s', async () => {
    vi.useFakeTimers();
    const client = createStorefrontClient({
      baseUrl: BASE,
      publishableKey: PK,
      fetch: (() => new Promise<Response>(() => {})) as typeof fetch,
    });
    const p = rejection(client.store.get());
    await vi.advanceTimersByTimeAsync(14_999);
    let settled = false;
    void p.then(() => (settled = true));
    await Promise.resolve();
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect((await p).code).toBe('timeout');
  });

  it('maps a fetch that honours the abort signal to timeout', async () => {
    const client = createStorefrontClient({
      baseUrl: BASE,
      publishableKey: PK,
      timeoutMs: 5,
      fetch: ((_u: string, init?: RequestInit) =>
        new Promise<Response>((_, reject) => {
          init?.signal?.addEventListener('abort', () =>
            reject(new DOMException('aborted', 'AbortError')),
          );
        })) as typeof fetch,
    });
    const e = await rejection(client.store.get());
    expect(e.code).toBe('timeout');
  });
});

describe('per-call signal', () => {
  it('passes a combined signal and rejects with aborted when the caller aborts', async () => {
    let seen: AbortSignal | undefined;
    const client = createStorefrontClient({
      baseUrl: BASE,
      publishableKey: PK,
      fetch: ((_u: string, init?: RequestInit) => {
        seen = init?.signal ?? undefined;
        return new Promise<Response>(() => {});
      }) as typeof fetch,
    });
    const ac = new AbortController();
    const p = rejection(client.carts.get('c1', { signal: ac.signal }));
    await Promise.resolve();
    expect(seen?.aborted).toBe(false);
    ac.abort(new Error('route change'));
    const e = await p;
    expect(e.code).toBe('aborted');
    expect(e.status).toBe(0);
    expect(seen?.aborted).toBe(true);
    expect((e.cause as Error).message).toBe('route change');
  });

  it('does not call fetch with an already aborted signal', async () => {
    const { client, fetchMock } = setup();
    const e = await rejection(
      client.store.get({ signal: AbortSignal.abort() }),
    );
    expect(e.code).toBe('aborted');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('is accepted by every method', async () => {
    const { client, calls } = setup();
    const o = { signal: new AbortController().signal };
    await client.store.get(o);
    await client.categories.list(o);
    await client.products.list({ q: 'x' }, o);
    await client.products.get('p', o);
    await client.getContent('k', o);
    await client.carts.create(o);
    await client.carts.get('c', o);
    await client.carts.addLine('c', { variantId: 'v', quantity: 1 }, o);
    await client.carts.updateLine('c', 'v', { quantity: 1 }, o);
    await client.carts.removeLine('c', 'v', o);
    await client.carts.setCustomer(
      'c',
      { email: 'e', name: 'n', surname: 's', phone: 'p' },
      o,
    );
    await client.carts.setAddress(
      'c',
      { shipping: { district: 'd', city: 'c', line1: 'l', country: 'TR' } },
      o,
    );
    await client.carts.shippingOptions('c', o);
    await client.carts.setShippingOption('c', 'standard', o);
    await client.carts.checkout('c', o);
    await client.orders.get('o', 't', o);
    expect(calls).toHaveLength(16);
  });

  it('still times out when the caller signal never fires', async () => {
    const client = createStorefrontClient({
      baseUrl: BASE,
      publishableKey: PK,
      timeoutMs: 5,
      fetch: (() => new Promise<Response>(() => {})) as typeof fetch,
    });
    const e = await rejection(
      client.store.get({ signal: new AbortController().signal }),
    );
    expect(e.code).toBe('timeout');
  });
});

describe('path segments', () => {
  const bad = ['', '.', '..'];

  it.each(bad)('rejects %j as a slug or id, without a request', async (v) => {
    const { client, fetchMock } = setup();
    const calls: Promise<unknown>[] = [
      client.products.get(v),
      client.getContent(v),
      client.carts.get(v),
      client.carts.addLine(v, { variantId: 'v', quantity: 1 }),
      client.carts.updateLine('c', v, { quantity: 1 }),
      client.carts.removeLine('c', v),
      client.carts.checkout(v),
      client.orders.get(v, 't'),
    ];
    for (const p of calls)
      await expect(p).rejects.toThrow(/invalid_path_segment/);
    for (const p of calls) await expect(p).rejects.toBeInstanceOf(TypeError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows dots inside a segment', async () => {
    const { client, calls } = setup();
    await client.products.get('v1.2..x');
    expect(calls[0]!.url).toBe(`${BASE}/v1/products/v1.2..x`);
  });

  it.each(['a/../b', './a', 'a//b', '/a', 'a/', '', '..'])(
    'media.url rejects key %j',
    (key) => {
      const client = createStorefrontClient({
        baseUrl: BASE,
        publishableKey: PK,
      });
      expect(() => client.media.url(key)).toThrow(/invalid_path_segment/);
    },
  );
});

describe('trusted key guard: other browser-like hosts', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });
  const make = () =>
    createStorefrontClient({
      baseUrl: BASE,
      publishableKey: PK,
      trustedStorefrontKey: 'sk',
      buyerIp: '1.2.3.4',
    });

  it('refuses when document exists', () => {
    vi.stubGlobal('document', {});
    expect(make).toThrow(/server-only/);
  });

  it('refuses in a web worker (self.importScripts)', () => {
    vi.stubGlobal('self', globalThis);
    vi.stubGlobal('importScripts', () => {});
    expect(make).toThrow(/server-only/);
  });

  it('allows a plain server process', () => {
    expect(make).not.toThrow();
  });
});

describe('checkout challenge', () => {
  it('sends the turnstile token on checkout only', async () => {
    const { client, calls } = setup();
    await client.carts.checkout('c1', { turnstileToken: 'tok-1' });
    await client.carts.checkout('c1');
    await client.carts.checkout('c1', { turnstileToken: '' });
    expect(calls[0]!.headers['x-konfiqo-turnstile-token']).toBe('tok-1');
    expect(calls[1]!.headers).not.toHaveProperty('x-konfiqo-turnstile-token');
    expect(calls[2]!.headers).not.toHaveProperty('x-konfiqo-turnstile-token');
    expect(calls[0]!.headers['x-konfiqo-publishable-key']).toBe(PK);
    expect(calls[0]!.body).toBeUndefined();
  });

  it('types store.checkoutChallenge', async () => {
    const { client } = setup(() =>
      json(200, {
        name: 's',
        checkoutChallenge: { provider: 'turnstile', siteKey: '0x4AAA' },
      }),
    );
    const store = await client.store.get();
    expect(store.checkoutChallenge?.siteKey).toBe('0x4AAA');
  });

  it.each([
    ['challenge_required', 400],
    ['challenge_failed', 403],
    ['challenge_unavailable', 503],
    ['too_many_open_orders', 429],
  ])('maps %s (%i) by its code', async (error, status) => {
    const { client } = setup(() =>
      json(
        status,
        { statusCode: status, error, message: 'm' },
        { 'retry-after': '9' },
      ),
    );
    const e = await rejection(
      client.carts.checkout('c1', { turnstileToken: 't' }),
    );
    expect(e.code).toBe(error);
    expect(e.status).toBe(status);
    expect(e.details).toBeUndefined();
  });

  it('keeps an uncoded or unknown-code 429 as rate_limited', async () => {
    const { client } = setup(() =>
      json(
        429,
        { statusCode: 429, error: 'future_thing' },
        { 'retry-after': '3' },
      ),
    );
    const e = await rejection(client.store.get());
    expect(e.code).toBe('rate_limited');
    expect(e.details).toEqual({ retryAfter: 3 });
  });
});

describe('account and cart recovery', () => {
  const credentialsOf = (fetchMock: ReturnType<typeof setup>['fetchMock']) =>
    (fetchMock.mock.calls as unknown as [unknown, RequestInit][]).map(
      ([, init]) => init.credentials,
    );

  it('requestCode: POST /v1/account/code with the email, resolves without a body', async () => {
    const { client, calls, fetchMock } = setup(
      () => new Response(null, { status: 202 }),
    );
    await expect(client.account.requestCode('a@b.co')).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      url: `${BASE}/v1/account/code`,
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.co' }),
    });
    expect(calls[0]?.headers['x-konfiqo-publishable-key']).toBe(PK);
    expect(credentialsOf(fetchMock)).toEqual(['include']);
  });

  it('requestCode: sends the challenge token header', async () => {
    const { client, calls } = setup(() => new Response(null, { status: 202 }));
    await client.account.requestCode('a@b.co', { turnstileToken: 'tok' });
    expect(calls[0]?.headers['x-konfiqo-turnstile-token']).toBe('tok');
  });

  it('signIn: POST /v1/account/session, include credentials', async () => {
    const { client, calls, fetchMock } = setup(() =>
      json(200, { customer: { email: 'a@b.co' } }),
    );
    const out = await client.account.signIn('a@b.co', '123456');
    expect(out).toEqual({ customer: { email: 'a@b.co' } });
    expect(calls[0]).toMatchObject({
      url: `${BASE}/v1/account/session`,
      method: 'POST',
      body: JSON.stringify({ email: 'a@b.co', code: '123456' }),
    });
    expect(credentialsOf(fetchMock)).toEqual(['include']);
  });

  it('signIn: a wrong code is a StorefrontError invalid_code', async () => {
    const { client } = setup(() => json(401, { error: 'invalid_code' }));
    const e = await rejection(client.account.signIn('a@b.co', '000000'));
    expect(e.code).toBe('invalid_code');
    expect(e.status).toBe(401);
  });

  it('signOut: DELETE /v1/account/session answering 204', async () => {
    const { client, calls, fetchMock } = setup(
      () => new Response(null, { status: 204 }),
    );
    await expect(client.account.signOut()).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      url: `${BASE}/v1/account/session`,
      method: 'DELETE',
    });
    expect(credentialsOf(fetchMock)).toEqual(['include']);
  });

  it('get: GET /v1/account, with ?page= when asked', async () => {
    const { client, calls, fetchMock } = setup(() =>
      json(200, { email: 'a@b.co', orders: [] }),
    );
    await client.account.get();
    await client.account.get(2);
    expect(calls.map((c) => [c.method, c.url])).toEqual([
      ['GET', `${BASE}/v1/account`],
      ['GET', `${BASE}/v1/account?page=2`],
    ]);
    expect(credentialsOf(fetchMock)).toEqual(['include', 'include']);
  });

  it('get: 401 not_signed_in is a StorefrontError', async () => {
    const { client } = setup(() => json(401, { error: 'not_signed_in' }));
    const e = await rejection(client.account.get());
    expect(e.code).toBe('not_signed_in');
  });

  it('updateProfile: PUT /v1/account/profile answering 204', async () => {
    const { client, calls } = setup(() => new Response(null, { status: 204 }));
    const p = { name: 'Ada', surname: 'Y', phone: '05551112233' };
    await expect(client.account.updateProfile(p)).resolves.toBeUndefined();
    expect(calls[0]).toMatchObject({
      url: `${BASE}/v1/account/profile`,
      method: 'PUT',
      body: JSON.stringify(p),
    });
  });

  it('saveAddresses: PUT /v1/account/addresses wraps the list, returns it', async () => {
    const { client, calls } = setup(() =>
      json(200, { addresses: [{ id: 'x', isDefault: true }] }),
    );
    const list = [
      {
        line1: 'a',
        district: 'd',
        city: 'c',
        country: 'TR' as const,
        isDefault: true,
      },
    ];
    const out = await client.account.saveAddresses(list);
    expect(out).toEqual([{ id: 'x', isDefault: true }]);
    expect(calls[0]).toMatchObject({
      url: `${BASE}/v1/account/addresses`,
      method: 'PUT',
      body: JSON.stringify({ addresses: list }),
    });
  });

  it('saveAddresses: 409 profile_required', async () => {
    const { client } = setup(() => json(409, { error: 'profile_required' }));
    const e = await rejection(client.account.saveAddresses([]));
    expect(e.code).toBe('profile_required');
  });

  it('carts.recover: POST /v1/carts/recover { token } -> { cartId }', async () => {
    const { client, calls } = setup(() => json(200, { cartId: 'new1' }));
    await expect(client.carts.recover('t.s')).resolves.toEqual({
      cartId: 'new1',
    });
    expect(calls[0]).toMatchObject({
      url: `${BASE}/v1/carts/recover`,
      method: 'POST',
      body: JSON.stringify({ token: 't.s' }),
    });
  });

  it('carts.recover: maps 400 and 410 codes', async () => {
    const bad = setup(() => json(400, { error: 'invalid_recovery_token' }));
    expect((await rejection(bad.client.carts.recover('x'))).code).toBe(
      'invalid_recovery_token',
    );
    const gone = setup(() => json(410, { error: 'cart_not_recoverable' }));
    expect((await rejection(gone.client.carts.recover('x'))).code).toBe(
      'cart_not_recoverable',
    );
  });

  it('requestCode: 429 too_many_code_requests', async () => {
    const { client } = setup(() =>
      json(429, { error: 'too_many_code_requests' }),
    );
    expect((await rejection(client.account.requestCode('a@b.co'))).code).toBe(
      'too_many_code_requests',
    );
  });

  it('forwards a cookie option as the cookie header (server side)', async () => {
    const { client, calls } = setup(() => json(200, { email: 'a@b.co' }));
    await client.account.get(undefined, { cookie: 'konfiqo_session=abc' });
    expect(calls[0]?.headers.cookie).toBe('konfiqo_session=abc');
  });

  it('sends no cookie header without the option', async () => {
    const { client, calls } = setup(() => json(200, { email: 'a@b.co' }));
    await client.account.get();
    expect(calls[0]?.headers.cookie).toBeUndefined();
  });
});
