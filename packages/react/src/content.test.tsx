import { render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ContentNode, Product } from '@konfiqo/storefront-sdk';
import { Content, renderContent } from './content';
import { apiError, mockClient, wrapper } from './test-utils';

const tag = (
  name: string,
  attributes: Record<string, unknown> = {},
  children: ContentNode[] = [],
): ContentNode => ({ $$mdtype: 'Tag', name, attributes, children });

const product = (slug: string, name: string): Product => ({
  id: slug,
  slug,
  name,
  description: null,
  image: null,
  imageUrl: null,
  seoTitle: null,
  seoDescription: null,
  category: null,
  variants: [
    {
      id: `${slug}-v`,
      sku: slug,
      title: null,
      optionValues: null,
      priceMinor: 14990,
      compareAtPriceMinor: null,
      currency: 'TRY',
      available: 3,
    },
  ],
});

const article = (...children: ContentNode[]) => tag('article', {}, children);

function mount(tree: ContentNode, client = mockClient(), props = {}) {
  client.getContent.mockResolvedValue({ key: 'home', title: 'Home', tree });
  const W = wrapper(client);
  return {
    client,
    ...render(
      <W>
        <Content contentKey="home" {...props} />
      </W>,
    ),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe('<Content>', () => {
  it('renders headings and text from the tree', async () => {
    mount(
      article(
        tag('h1', {}, ['Welcome']),
        tag('p', { class: 'lead' }, ['Hello ', tag('strong', {}, ['you'])]),
      ),
    );
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Welcome' }),
    ).toBeTruthy();
    const p = screen.getByText(/Hello/);
    expect(p.tagName).toBe('P');
    expect(p.className).toBe('lead');
    expect(p.querySelector('strong')?.textContent).toBe('you');
  });

  it('renders a ProductGrid through a passed component, with its attributes', async () => {
    const ProductGrid = (p: { category?: string; limit?: number }) => (
      <div data-testid="grid">{`${p.category}:${p.limit}`}</div>
    );
    const { client } = mount(
      article(tag('ProductGrid', { category: 'shoes', limit: 4 })),
      mockClient(),
      { components: { ProductGrid } },
    );
    expect((await screen.findByTestId('grid')).textContent).toBe('shoes:4');
    expect(client.getContent).toHaveBeenCalledWith(
      'home',
      expect.objectContaining({ signal: expect.anything() }),
    );
  });

  it('the default ProductGrid lists products of the category', async () => {
    const client = mockClient();
    client.products.list.mockResolvedValue({
      items: [product('tee', 'Tee'), product('cap', 'Cap')],
      pagination: { page: 1, pageSize: 1, totalItems: 2, totalPages: 2 },
    });
    mount(article(tag('ProductGrid', { category: 'shoes', limit: 1 })), client);
    const link = await screen.findByRole('link', { name: /Tee/ });
    expect(link.getAttribute('href')).toBe('/p/tee');
    // `limit` caps what is shown.
    expect(screen.queryByText(/Cap/)).toBeNull();
    expect(client.products.list).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'shoes', pageSize: 1 }),
      expect.anything(),
    );
  });

  it('the default Product, CategoryLink, Image and Button', async () => {
    const client = mockClient();
    client.products.get.mockResolvedValue(product('tee', 'Tee'));
    mount(
      article(
        tag('Product', { slug: 'tee' }),
        tag('CategoryLink', { slug: 'shoes' }, ['Shoes']),
        tag('Image', { key: 'banners/a b.png', alt: 'Banner' }),
        tag('Button', { href: '/sale', label: 'Shop the sale' }),
      ),
      client,
    );
    expect(await screen.findByRole('link', { name: /Tee/ })).toBeTruthy();
    expect(
      screen.getByRole('link', { name: 'Shoes' }).getAttribute('href'),
    ).toBe('/c/shoes');
    const img = screen.getByRole('img', { name: 'Banner' });
    expect(client.media.url).toHaveBeenCalledWith('banners/a b.png');
    expect(img.getAttribute('src')).toBe(
      'https://api.test/v1/media/banners/a b.png',
    );
    expect(
      screen.getByRole('link', { name: 'Shop the sale' }).getAttribute('href'),
    ).toBe('/sale');
  });

  it('renders nothing for a missing key and warns only outside production', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const client = mockClient();
    client.getContent.mockRejectedValue(
      apiError('content_not_found', 404, undefined),
    );
    const W = wrapper(client);
    const { container } = render(
      <W>
        <Content contentKey="nope" />
      </W>,
    );
    await waitFor(() => expect(warn).toHaveBeenCalled());
    expect(container.innerHTML).toBe('');
    expect(String(warn.mock.calls[0]![0])).toContain('nope');

    warn.mockClear();
    vi.stubEnv('NODE_ENV', 'production');
    const { container: c2 } = render(
      <W>
        <Content contentKey="nope2" />
      </W>,
    );
    await waitFor(() => expect(client.getContent).toHaveBeenCalledTimes(2));
    await new Promise((r) => setTimeout(r, 20));
    expect(c2.innerHTML).toBe('');
    expect(warn).not.toHaveBeenCalled();
  });
});

describe('renderContent safety', () => {
  const html = (tree: ContentNode, components?: Record<string, never>) => {
    const { container } = render(<>{renderContent(tree, components)}</>);
    return container;
  };

  it('drops raw images, unknown tags, scripts and event handlers', () => {
    const c = html(
      article(
        tag('img', { src: 'https://evil.test/x.png', alt: 'x' }),
        tag('script', {}, ['alert(1)']),
        tag('iframe', { src: 'https://evil.test' }),
        tag('Evil', {}, ['boom']),
        tag('p', { onclick: 'x()', style: 'color:red', id: 'a' }, ['ok']),
      ),
    );
    expect(c.querySelector('img,script,iframe')).toBeNull();
    expect(c.textContent).toBe('ok');
    const p = c.querySelector('p')!;
    expect(p.getAttribute('onclick')).toBeNull();
    expect(p.getAttribute('style')).toBeNull();
    expect(p.getAttribute('id')).toBeNull();
  });

  it('keeps only safe link targets', () => {
    const c = html(
      article(
        tag('a', { href: 'javascript:alert(1)' }, ['a']),
        tag('a', { href: '//evil.test' }, ['b']),
        tag('a', { href: 'https://ok.test/x' }, ['c']),
        tag('a', { href: '/ok' }, ['d']),
        tag('Button', { href: 'data:text/html,x', label: 'e' }),
      ),
    );
    const hrefs = Array.from(c.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    // A Button with an unsafe href renders nothing at all.
    expect(hrefs).toEqual([null, null, 'https://ok.test/x', '/ok']);
  });

  it('refuses backslash and protocol-relative lookalike links', () => {
    const bad = [
      '/\\evil.com',
      '/\\/evil.com',
      '/%5Cevil.com',
      '/%5cevil.com',
      '\\evil.com',
      '//evil.com',
      '/ /evil.com',
    ];
    const c = html(
      article(
        ...bad.map((href) => tag('a', { href }, ['x'])),
        ...bad.map((href) => tag('Button', { href, label: 'b' })),
        tag('a', { href: '/ok/path?x=1#h' }, ['ok1']),
        tag('a', { href: '#top' }, ['ok2']),
        tag('a', { href: '/a%20b' }, ['ok3']),
        tag('Button', { href: '/sale', label: 'ok4' }),
      ),
    );
    const hrefs = Array.from(c.querySelectorAll('a')).map((a) =>
      a.getAttribute('href'),
    );
    expect(hrefs.filter((h) => h !== null)).toEqual([
      '/ok/path?x=1#h',
      '#top',
      '/a%20b',
      '/sale',
    ]);
  });

  it('an empty tag name drops that node, not the whole tree', () => {
    const c = html(article(tag('p', {}, ['keep']), tag('', {}, ['gone'])));
    expect(c.textContent).toBe('keep');
  });

  it('never throws on an invalid image key or a malformed tree', () => {
    const client = mockClient();
    const W = wrapper(client);
    const bad = article(
      tag('Image', { key: '../x', alt: 'x' }),
      tag('p', {}, [{ nope: 1 } as unknown as ContentNode]),
    );
    expect(() => render(<W>{renderContent(bad)}</W>)).not.toThrow();
    expect(() =>
      render(<>{renderContent(null as unknown as ContentNode)}</>),
    ).not.toThrow();
  });

  it('does not render an attribute named dangerouslySetInnerHTML', () => {
    const Box = (p: Record<string, unknown>) => (
      <div data-testid="box">{String(p.dangerouslySetInnerHTML)}</div>
    );
    const c = html(
      tag('Box', { dangerouslySetInnerHTML: { __html: '<b>x</b>' } }),
      { Box } as never,
    );
    expect(c.querySelector('b')).toBeNull();
  });
});
