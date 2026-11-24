import type { ThemeV1 } from './theme';

/*
 * Response and request shapes of the Storefront API (`/v1`). Money is always
 * an integer number of minor units (kuruş for `TRY`). Dates are ISO 8601
 * strings. Fields the API may add later are not described here.
 */

// ---------------------------------------------------------------- store

/** Shipping price rules of the store (minor units). */
export interface ShippingRules {
  /** Price when no other rule applies; `0` = free shipping. */
  flatMinor?: number;
  /** A subtotal of at least this ships free. */
  freeAboveMinor?: number;
  /**
   * Weight bands, ascending by `maxGrams`: the parcel pays the first band
   * it fits; heavier than every band, it pays `flatMinor`.
   */
  weightBands?: { maxGrams: number; priceMinor: number }[];
}

/** Store contact details. */
export interface StoreContact {
  /** Contact e-mail address. */
  email: string | null;
  /** Contact phone number. */
  phone: string | null;
}

/** Legal texts the storefront must show. Plain text as the seller wrote it. */
export interface StoreLegal {
  /** KVKK (personal data) notice. */
  kvkk: string | null;
  /** Distance sales agreement. */
  distanceSales: string | null;
  /** Returns policy. */
  returns: string | null;
  /**
   * Cookie policy: the seller's text, or the platform default. (Absent from
   * API versions before cookie consent existed.)
   */
  cookies?: string | null;
}

/** What a cookie is for: necessary ones need no consent. */
export type CookieCategory = 'necessary' | 'analytics' | 'marketing';

/** A cookie the store uses, for the consent banner and the cookie policy. */
export interface CookieInfo {
  /** Cookie name. */
  name: string;
  category: CookieCategory;
  /** What it is for, in the store's language. */
  purpose: string;
  /** How long it is kept, in days. */
  durationDays: number;
  /**
   * True for a cookie its library writes to the registrable domain with no
   * host-only option (Meta, TikTok): on a host under
   * {@link Store.defaultDomainSuffix} that pixel does not run, so leave
   * the cookie out of the list there. (Absent otherwise.)
   */
  customDomainOnly?: boolean;
}

/**
 * The bot challenge checkout requires: render a Cloudflare Turnstile widget
 * with `siteKey` and pass its token to `carts.checkout`.
 */
export interface CheckoutChallenge {
  /** Challenge provider. */
  provider: 'turnstile';
  /** The public Turnstile site key of the store. */
  siteKey: string;
}

/** A node of a Markdoc render tree: a string, or a tag with attributes and children. */
export type ContentNode =
  | string
  | {
      $$mdtype: 'Tag';
      name: string;
      attributes: Record<string, unknown>;
      children: ContentNode[];
    };

/** `GET /v1/content/:key`: store content (Markdoc) as a renderable tree. */
export interface StoreContent {
  key: string;
  title: string;
  /** `Markdoc.transform` output (plain objects). Render with `<Content>`. */
  tree: ContentNode;
}

/** The ad pixels a store configured (ids are validated by the API). */
export interface AdPixels {
  /** Meta Pixel. */
  meta?: { pixelId: string };
  /** TikTok Pixel. */
  tiktok?: { pixelId: string };
  /** Google tag: GA4 and/or Google Ads. */
  google?: { ga4Id?: string; adsId?: string; adsConversionLabel?: string };
}

/** `GET /v1/store`. */
export interface Store {
  /** Store name. */
  name: string;
  /** Default language (`tr`, `en`, …), or null when not set. */
  defaultLanguage: string | null;
  /** ISO 4217 currency of every price in this store. */
  currency: string;
  /** Storage key of the logo. */
  logo: string | null;
  /**
   * Media URL of the logo, **relative** (`/v1/media/<key>?pk=<key>`): prefix
   * the API origin, or use `client.media.url(store.logo)`.
   */
  logoUrl: string | null;
  /** The theme as stored (not validated); null when the store has none. */
  theme: ThemeV1 | null;
  /** Contact details. */
  contact: StoreContact;
  /** Legal texts. */
  legal: StoreLegal;
  /** Shipping rules, or null when the store has no shipping configured. */
  shipping: ShippingRules | null;
  /**
   * The challenge checkout requires, or null when none. (Absent from API
   * versions before the challenge existed: treat as null.)
   */
  checkoutChallenge?: CheckoutChallenge | null;
  /**
   * The cookies the store uses; empty when it uses no optional cookie (then
   * nothing needs consent). (Absent from older API versions: treat as [].)
   */
  cookies?: CookieInfo[];
  /**
   * Version of the optional cookie set: a stored consent for another
   * version is void. '' when the store uses no optional cookie.
   */
  consentVersion?: string;
  /**
   * The store's ad pixels; load them only after the shopper granted
   * `marketing`. (Absent from older API versions: treat as none.)
   */
  adPixels?: AdPixels;
  /**
   * The suffix of the stores' default domains (`<slug>.<suffix>`). On a
   * host under it Meta and TikTok are not loaded and the
   * `customDomainOnly` cookies are not listed. (Absent from older API
   * versions: treat every host as a custom domain.)
   */
  defaultDomainSuffix?: string;
}

// ---------------------------------------------------------------- catalog

/** A node of the active category tree. */
export interface Category {
  /** Category id. */
  id: string;
  /** URL slug; the `category` filter of `products.list`. */
  slug: string;
  /** Display name. */
  name: string;
  /** Sort key within its parent (already applied to `children`). */
  sortOrder: number;
  /** Active child categories, sorted. */
  children: Category[];
}

/** `GET /v1/categories`. */
export interface CategoryList {
  /** Root categories, sorted. */
  items: Category[];
}

/** A sellable product variant. */
export interface ProductVariant {
  /** Variant id: what a cart line references. */
  id: string;
  /** Stock-keeping unit. */
  sku: string;
  /** Variant title (`S`, `Red / M`, …), or null for a single-variant product. */
  title: string | null;
  /**
   * The variant's option values as stored (a JSON field; typically an
   * object such as `{ "size": "M" }`), or null.
   */
  optionValues: unknown;
  /** Price, minor units. */
  priceMinor: number;
  /** "Was" price for display, minor units, or null. */
  compareAtPriceMinor: number | null;
  /** ISO 4217 currency of the prices. */
  currency: string;
  /** Units available now (stock minus reservations); never negative. */
  available: number;
}

/** A product. Only products with at least one sellable variant are listed. */
export interface Product {
  /** Product id. */
  id: string;
  /** URL slug; the argument of `products.get`. */
  slug: string;
  /** Display name. */
  name: string;
  /** Description as the seller wrote it, or null. */
  description: string | null;
  /** Storage key of the product image, or null. */
  image: string | null;
  /**
   * Media URL of `image`, **relative** (`/v1/media/<key>?pk=<key>`): prefix
   * the API origin, or use `client.media.url(product.image)`.
   */
  imageUrl: string | null;
  /** SEO title override, or null (use `name`). */
  seoTitle: string | null;
  /** SEO description, or null. */
  seoDescription: string | null;
  /** The product's (live) category, or null. */
  category: { slug: string; name: string } | null;
  /** Sellable variants. */
  variants: ProductVariant[];
}

/** Paging information of a list. */
export interface Pagination {
  /** 1-based page number. */
  page: number;
  /** Items per page. */
  pageSize: number;
  /** Items matching the query. */
  totalItems: number;
  /** Pages for the query (`0` when nothing matches). */
  totalPages: number;
}

/** `GET /v1/products`. */
export interface ProductPage {
  /** The page's products, sorted by name. */
  items: Product[];
  /** Paging information. */
  pagination: Pagination;
}

/** Filters and paging of `products.list`. All optional. */
export interface ProductListQuery {
  /** Category slug; includes the category's descendants. */
  category?: string;
  /** Search text (name, description, SKU), at most 200 characters. */
  q?: string;
  /** 1-based page (default 1, at most 10 000). */
  page?: number;
  /** Items per page (default 20, 1–100). */
  pageSize?: number;
}

// ---------------------------------------------------------------- carts

/** Cart status. Only an `open` cart can change. */
export type CartStatus = 'open' | 'ordered' | 'expired';

/** A priced cart line. Prices are always computed server-side. */
export interface CartLine {
  /** The variant this line holds. */
  variantId: string;
  /** Units, 1–99. */
  quantity: number;
  /** False when the variant is no longer sold. Checkout refuses the cart. */
  purchasable: boolean;
  /** False when fewer units are available than the line asks for. Checkout refuses the cart. */
  inStock: boolean;
  /** Product id; null when not purchasable. */
  productId: string | null;
  /** Product slug; null when not purchasable. */
  productSlug: string | null;
  /** Product name; null when not purchasable. */
  productName: string | null;
  /** Variant title; null when not purchasable or untitled. */
  variantTitle: string | null;
  /** SKU; null when not purchasable. */
  sku: string | null;
  /** Unit price, minor units; null when not purchasable. */
  unitPriceMinor: number | null;
  /** Line total, minor units (`0` when not purchasable). */
  lineTotalMinor: number;
}

/**
 * The module address shape. Either `address` or `line1` is required;
 * `name` / `phone` / `email` fall back to the customer's. Only `TR` in 0.1.0.
 */
export interface Address {
  /** Recipient name. */
  name?: string;
  /** Recipient phone. */
  phone?: string;
  /** Recipient e-mail. */
  email?: string;
  /** Full street address (alternative to `line1` + `line2`). */
  address?: string;
  /** Street address, first line. */
  line1?: string;
  /** Street address, second line. */
  line2?: string;
  /** District (ilçe). */
  district: string;
  /** City (il). */
  city: string;
  /** Postal code (or `postalCode`). */
  zipCode?: string;
  /** Postal code (or `zipCode`). */
  postalCode?: string;
  /** Country; `TR` only. */
  country: 'TR';
}

/** The buyer as stored on a cart. The identity number is never returned. */
export interface CartCustomer {
  /** E-mail address. */
  email: string;
  /** First name. */
  name: string;
  /** Surname. */
  surname: string;
  /** Turkish mobile number, normalised to `90XXXXXXXXXX`. */
  phone: string;
  /** Whether an identity number (TC kimlik no) is on file. */
  identityNumberProvided: boolean;
}

/** The cart view every cart route answers. */
export interface Cart {
  /** Cart id: a bearer capability, keep it private to the buyer. */
  id: string;
  /** Cart status. */
  status: CartStatus;
  /** ISO 4217 currency. */
  currency: string;
  /** Priced lines. */
  lines: CartLine[];
  /** Sum of line totals, minor units. */
  subtotalMinor: number;
  /** Shipping price, minor units. */
  shippingMinor: number;
  /** Total to pay, minor units. */
  totalMinor: number;
  /** The selected shipping option id, or null when none (or no longer offered). */
  shippingOption: string | null;
  /** The buyer, or null before `setCustomer`. */
  customer: CartCustomer | null;
  /** Shipping address, or null. */
  shippingAddress: Address | null;
  /** Billing address, or null (= the shipping address). */
  billingAddress: Address | null;
  /** When the cart expires (ISO date). */
  expiresAt: string;
}

/** Body of `carts.addLine`. */
export interface AddLineInput {
  /** Variant id from the catalog. */
  variantId: string;
  /** Units to add, 1–99 (added to an existing line of the same variant). */
  quantity: number;
}

/** Body of `carts.updateLine`. */
export interface UpdateLineInput {
  /** New quantity, 1–99. */
  quantity: number;
}

/** Body of `carts.setCustomer`. */
export interface CustomerInput {
  /** E-mail address. */
  email: string;
  /** First name. */
  name: string;
  /** Surname. */
  surname: string;
  /**
   * A **Turkish mobile number**: `05XX…`, `5XX…`, `+90…`, `0090…` (spaces,
   * dashes and parentheses allowed). Anything else is `invalid_request`
   * with `path: "phone"`.
   */
  phone: string;
  /**
   * TC kimlik no, exactly 11 digits. Sealed, never returned. Omitted, the
   * one already on the cart is kept.
   */
  identityNumber?: string;
}

/** Body of `carts.setAddress`. */
export interface AddressInput {
  /** Shipping address. */
  shipping: Address;
  /** Billing address; omitted or null = same as shipping. */
  billing?: Address | null;
}

/** A shipping option offered for a cart. */
export interface ShippingOption {
  /** Option id (`standard` in 0.1.0). */
  id: string;
  /** Price for this cart, minor units. */
  priceMinor: number;
}

/** `GET /v1/carts/:id/shipping-options`. */
export interface ShippingOptionList {
  /** The options this cart can use. */
  items: ShippingOption[];
}

// ---------------------------------------------------------------- checkout

/** The known embed kinds. */
export type CheckoutEmbedKind = 'iyzico-checkout-form';

/**
 * The payment provider's checkout form, passed through from the payments
 * service. Render it as its `kind` says; `iyzico-checkout-form` carries the
 * provider's HTML + scripts in `content`.
 */
export interface CheckoutEmbed {
  /** How to render the form. */
  kind: CheckoutEmbedKind | (string & {});
  /** For `iyzico-checkout-form`: the HTML (with scripts) to inject. */
  content?: string;
  /** Other provider fields. */
  [key: string]: unknown;
}

/**
 * Why payment cannot be (re)opened: `paid` (paid or later), `cancelled`,
 * `processing` (being finalised), or from the payments service `expired`,
 * `failed`, `not_found`.
 */
export type ClosedCheckoutPage =
  | 'paid'
  | 'cancelled'
  | 'processing'
  | 'expired'
  | 'failed'
  | 'not_found'
  | (string & {});

/** Fields every checkout result has. */
export interface CheckoutResultBase {
  /** The order id. */
  orderId: string;
  /** Human-readable order number (`261115-ABCDEF`). */
  orderNumber: string;
  /**
   * The buyer's order-status token, returned **once**, by the checkout that
   * placed the order. Keep it: it is the only key to `orders.get`.
   */
  token?: string;
  /** The order's status, when the service read it (re-opened orders). */
  orderStatus?: OrderStatus;
}

/** Render the provider's form in the page. */
export interface EmbeddedCheckoutResult extends CheckoutResultBase {
  /** Discriminator. */
  presentation: 'embedded';
  /** The form to render. */
  embed: CheckoutEmbed;
}

/** Send the buyer's browser to `url` (top-level navigation, not an iframe). */
export interface RedirectCheckoutResult extends CheckoutResultBase {
  /** Discriminator. */
  presentation: 'redirect';
  /** The provider's payment page. */
  url: string;
}

/** Payment cannot be (re)opened: show the order status page. */
export interface ClosedCheckoutResult extends CheckoutResultBase {
  /** Discriminator. */
  presentation: 'closed';
  /** Which state to show. */
  page: ClosedCheckoutPage;
}

/** `POST /v1/carts/:id/checkout`, discriminated by `presentation`. */
export type CheckoutResult =
  EmbeddedCheckoutResult | RedirectCheckoutResult | ClosedCheckoutResult;

// ---------------------------------------------------------------- orders

/** Order status (the commerce module's values; future values pass through). */
export type OrderStatus =
  | 'pendingPayment'
  | 'paid'
  | 'fulfilling'
  | 'shipped'
  | 'delivered'
  | 'cancelled'
  | 'refunded'
  | 'partiallyRefunded'
  | (string & {});

/**
 * Payment status. `processing` = the payment succeeded and the order is
 * being updated (poll again).
 */
export type PaymentStatus =
  | 'none'
  | 'pending'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'expired'
  | 'refunded'
  | 'partiallyRefunded'
  | (string & {});

/** Shipment status (the commerce module's values; future values pass through). */
export type ShipmentStatus =
  | 'requested'
  | 'created'
  | 'picked_up'
  | 'in_transit'
  | 'out_for_delivery'
  | 'delivered'
  | 'returned'
  | 'cancelled'
  | 'exception'
  | 'failed'
  | (string & {});

/** A line of a placed order. */
export interface OrderLine {
  /** Product id (what ad pixels and analytics use as item id). */
  productId?: string | null;
  /** Product name at order time. */
  productName: string;
  /** SKU at order time. */
  sku: string;
  /** Unit price, minor units. */
  unitPriceMinor: number;
  /** Units. */
  quantity: number;
  /** Line total, minor units. */
  lineTotalMinor: number;
}

/** A shipment of an order. */
export interface OrderShipment {
  /** Shipment status. */
  status: ShipmentStatus;
  /** Carrier name, or null. */
  carrier: string | null;
  /** Tracking number, or null. */
  trackingNumber: string | null;
  /** Carrier tracking page, or null. */
  trackingUrl: string | null;
}

/** `GET /v1/orders/:id?token=` — what a buyer sees of an order. */
export interface Order {
  /** Order id. */
  id: string;
  /** Human-readable order number. */
  orderNumber: string;
  /** Order status. */
  status: OrderStatus;
  /** Payment status. */
  paymentStatus: PaymentStatus;
  /** ISO 4217 currency. */
  currency: string;
  /** Subtotal, minor units. */
  subtotalMinor: number;
  /** Shipping, minor units. */
  shippingMinor: number;
  /** Total, minor units. */
  totalMinor: number;
  /** When the order was placed (ISO date), or null. */
  placedAt: string | null;
  /** Shipping address as entered (string fields of the address shape). */
  shippingAddress: Record<string, string> | null;
  /** Billing address as entered, or null. */
  billingAddress: Record<string, string> | null;
  /** Order lines. */
  lines: OrderLine[];
  /** Shipments. */
  shipments: OrderShipment[];
}

// ----------------------------------------------------------------- account

/** `POST /v1/account/session`: the signed-in buyer. */
export interface AccountSession {
  customer: { email: string };
}

/** `PUT /v1/account/profile` body. */
export interface AccountProfileInput {
  /** First name (1-100 characters). */
  name: string;
  /** Surname (1-100 characters). */
  surname: string;
  /** Turkish mobile number in any common format; stored as `90XXXXXXXXXX`. */
  phone: string;
}

/** A saved address as the API stores it. */
export interface SavedAddress extends Address {
  /** Server-assigned id. */
  id: string;
  /** Whether this is the default address (exactly one is, when any exist). */
  isDefault: boolean;
}

/** A saved address to send: `id` is filled in by the server when absent. */
export interface SavedAddressInput extends Address {
  id?: string;
  isDefault?: boolean;
}

/** One order in the account's order list. */
export interface AccountOrder {
  /** Order number shown to the buyer. */
  number: string;
  /** ISO time the order was placed, or null. */
  placedAt: string | null;
  /** Order status (see {@link OrderStatus}). */
  status: string;
  totalMinor: number;
  currency: string;
  /** Link to the order status page, or null when none exists yet. */
  statusUrl: string | null;
}

/** `GET /v1/account`. Name, surname and phone are null until a profile is saved. */
export interface Account {
  email: string;
  name: string | null;
  surname: string | null;
  phone: string | null;
  savedAddresses: SavedAddress[];
  /** One page of orders, newest first. */
  orders: AccountOrder[];
}
