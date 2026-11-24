import Markdoc from '@markdoc/markdoc';
import * as React from 'react';
import { useEffect } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { formatMoney, type ContentNode } from '@konfiqo/storefront-sdk';
import { useProduct, useProducts } from './catalog';
import { useStorefrontContext } from './provider';
import { useResource } from './use-resource';

/** Components by tag name (`ProductGrid`, `Button`, …), e.g. to replace a default. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ContentComponents = Record<string, ComponentType<any>>;

// ---------------------------------------------------------------- safety

/** Plain tags content may use. Everything else is dropped with its children. */
const HTML_TAGS = new Set(
  (
    'article section div span p h1 h2 h3 h4 h5 h6 ul ol li strong em s del ' +
    'code pre blockquote hr br a table thead tbody tr th td figure figcaption ' +
    'small sub sup mark'
  ).split(' '),
);
/** The attributes a plain tag keeps (`href` only on `a`, and only if safe). */
const HTML_ATTRS = new Set([
  'class',
  'title',
  'align',
  'colspan',
  'rowspan',
  'start',
]);
const MAX_DEPTH = 40;
const MAX_NODES = 5000;

const hasControl = (s: string): boolean =>
  Array.from(s).some((c) => {
    const n = c.charCodeAt(0);
    return n < 0x20 || n === 0x7f;
  });

/** A link target a page may follow: relative, http(s), mailto or tel. */
function safeHref(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const href = v.trim();
  // No whitespace or control characters inside (`java\nscript:` tricks).
  if (href === '' || /\s/.test(href) || hasControl(href)) return null;
  // Browsers read `\` like `/`: `/\host` is protocol-relative. Refuse any
  // backslash, also percent-encoded.
  if (href.includes('\\') || /%5c/i.test(href)) return null;
  if (href.startsWith('#')) return href;
  if (href.startsWith('/')) return href[1] === '/' ? null : href;
  return /^(https?:|mailto:|tel:)/i.test(href) ? href : null;
}

type Prop = string | number | boolean;
const isProp = (v: unknown): v is Prop =>
  typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

interface Walk {
  nodes: number;
  components: ContentComponents;
}

function clean(node: unknown, w: Walk, depth: number): ContentNode | null {
  if (typeof node === 'string') return node;
  if (node === null || typeof node !== 'object') return null;
  const n = node as Partial<Exclude<ContentNode, string>>;
  if (
    n.$$mdtype !== 'Tag' ||
    typeof n.name !== 'string' ||
    depth > MAX_DEPTH ||
    ++w.nodes > MAX_NODES
  ) {
    return null;
  }
  const name = n.name;
  const raw =
    n.attributes && typeof n.attributes === 'object' ? n.attributes : {};
  const attributes: Record<string, Prop> = {};
  if (name === '') return null;
  const isHtml = name[0] === name[0]!.toLowerCase();
  if (isHtml) {
    if (!HTML_TAGS.has(name)) return null;
    for (const [k, v] of Object.entries(raw)) {
      if (name === 'a' && k === 'href') {
        const href = safeHref(v);
        if (href !== null) attributes.href = href;
      } else if (HTML_ATTRS.has(k) && isProp(v)) {
        attributes[k] = v;
      }
    }
  } else {
    if (!Object.hasOwn(w.components, name)) return null;
    for (const [k, v] of Object.entries(raw)) {
      if (!isProp(v)) continue;
      if (k === 'ref' || k === 'children' || /^on/i.test(k)) continue;
      if (k === 'dangerouslySetInnerHTML') continue;
      // `key` would be swallowed by React as the element key.
      if (k === 'key') attributes.contentKey = v;
      else attributes[k] = v;
    }
  }
  const children: ContentNode[] = [];
  for (const c of Array.isArray(n.children) ? n.children : []) {
    const cleaned = clean(c, w, depth + 1);
    if (cleaned !== null) children.push(cleaned);
  }
  return { $$mdtype: 'Tag', name, attributes, children };
}

// ------------------------------------------------------ default components

const text = (v: unknown): string | undefined =>
  typeof v === 'string' && v !== '' ? v : undefined;
const slugOf = (v: unknown): string | null => {
  const s = text(v);
  return s && !/[/\\?#]/.test(s) && s !== '.' && s !== '..' ? s : null;
};

function ProductCard({
  product,
}: {
  product: import('@konfiqo/storefront-sdk').Product;
}) {
  const { client } = useStorefrontContext();
  const variant = product.variants[0];
  let price: string | null = null;
  try {
    price = variant ? formatMoney(variant.priceMinor, variant.currency) : null;
  } catch {
    price = null;
  }
  let image: string | null = null;
  try {
    image = product.image ? client.media.url(product.image) : null;
  } catch {
    image = null;
  }
  return (
    <a href={`/p/${encodeURIComponent(product.slug)}`}>
      {image ? <img src={image} alt="" /> : null}
      <span>{product.name}</span>
      {price ? <span> {price}</span> : null}
    </a>
  );
}

function ProductGrid(props: { category?: unknown; limit?: unknown }) {
  const category = text(props.category);
  const limit = Number(props.limit);
  const cap = Number.isInteger(limit) && limit > 0 ? Math.min(limit, 48) : 12;
  const { data } = useProducts({ category, pageSize: cap });
  if (!data) return null;
  return (
    <ul className="content-product-grid">
      {data.items.slice(0, cap).map((p) => (
        <li key={p.id}>
          <ProductCard product={p} />
        </li>
      ))}
    </ul>
  );
}

function ProductTag(props: { slug?: unknown }) {
  const { data } = useProduct(slugOf(props.slug));
  return data ? <ProductCard product={data} /> : null;
}

function CategoryLink(props: { slug?: unknown; children?: ReactNode }) {
  const slug = slugOf(props.slug);
  if (!slug) return null;
  return (
    <a href={`/c/${encodeURIComponent(slug)}`}>{props.children ?? slug}</a>
  );
}

function ImageTag(props: { contentKey?: unknown; alt?: unknown }) {
  const { client } = useStorefrontContext();
  const key = text(props.contentKey);
  if (!key) return null;
  let src: string;
  try {
    // Always through the media path, never a URL taken from the content.
    src = client.media.url(key);
  } catch {
    return null;
  }
  return <img src={src} alt={text(props.alt) ?? ''} />;
}

function ButtonTag(props: { href?: unknown; label?: unknown }) {
  const href = safeHref(props.href);
  const label = text(props.label);
  if (!href || !label) return null;
  return (
    <a className="button" href={href}>
      {label}
    </a>
  );
}

const DEFAULT_COMPONENTS: ContentComponents = {
  ProductGrid,
  Product: ProductTag,
  CategoryLink,
  Image: ImageTag,
  Button: ButtonTag,
};

// ------------------------------------------------------------------ render

/**
 * Renders a store-content tree (`StoreContent.tree`) with React. Only
 * plain text tags and the known components are rendered (raw images,
 * unknown tags, ids, styles and event handlers are dropped); output goes
 * through `Markdoc.renderers.react`, never as HTML. The default components
 * (`ProductGrid`, `Product`, `CategoryLink`, `Image`, `Button`) need a
 * `<StorefrontProvider>`; `components` replaces or adds components. A
 * component gets an `Image` / custom tag's `key` attribute as `contentKey`.
 */
export function renderContent(
  tree: ContentNode,
  components: ContentComponents = {},
): ReactNode {
  try {
    const merged = { ...DEFAULT_COMPONENTS, ...components };
    const cleaned = clean(tree, { nodes: 0, components: merged }, 0);
    if (cleaned === null) return null;
    return Markdoc.renderers.react(
      cleaned as unknown as Parameters<typeof Markdoc.renderers.react>[0],
      React,
      { components: merged },
    );
  } catch {
    return null;
  }
}

/** Props of {@link Content}. */
export interface ContentProps {
  /** The content key (`home.hero`, `about-us`, …). */
  contentKey: string;
  /** Components by tag name, replacing or adding to the defaults. */
  components?: ContentComponents;
}

/**
 * A piece of store content (Markdoc written in the console), read by key
 * from the store. Renders nothing while loading, or when the key does not
 * exist or cannot be read (a warning in development only).
 */
export function Content({ contentKey, components }: ContentProps): ReactNode {
  const { client } = useStorefrontContext();
  const { data, error } = useResource(
    `content:${contentKey}`,
    client,
    (signal) => client.getContent(contentKey, { signal }),
  );
  useEffect(() => {
    if (
      error &&
      typeof process !== 'undefined' &&
      process.env?.NODE_ENV !== 'production'
    ) {
      console.warn(
        `<Content contentKey="${contentKey}">: ${error.message || 'could not be read'}`,
      );
    }
  }, [error, contentKey]);
  if (!data) return null;
  return <>{renderContent(data.tree, components)}</>;
}
