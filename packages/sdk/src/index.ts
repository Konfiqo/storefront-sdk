/** Version of the Storefront SDK package. */
export const SDK_VERSION = '0.6.2';

export {
  createStorefrontClient,
  DEFAULT_TIMEOUT_MS,
  PUBLISHABLE_KEY_HEADER,
  STOREFRONT_KEY_HEADER,
  BUYER_IP_HEADER,
  TURNSTILE_TOKEN_HEADER,
} from './client';
export type {
  CheckoutOptions,
  RequestCodeOptions,
  RequestOptions,
  StorefrontClient,
  StorefrontClientOptions,
} from './client';
export { StorefrontError, isStorefrontError } from './errors';
export type {
  AnyStorefrontError,
  BuyerDetailField,
  CheckoutMissing,
  StorefrontApiErrorCode,
  StorefrontClientErrorCode,
  StorefrontErrorCode,
  StorefrontErrorDetails,
  StorefrontErrorDetailsMap,
  ValidationIssue,
} from './errors';
export type * from './models';
export { THEME_FONTS, isKnownThemeSection } from './theme';
export type {
  CategoryGridSection,
  FeaturedProductsSection,
  HeroSection,
  KnownThemeSection,
  RichTextSection,
  ThemeColors,
  ThemeFont,
  ThemeFooter,
  ThemeHomepage,
  ThemeLink,
  ThemeSection,
  ThemeSocial,
  ThemeV1,
  UnknownThemeSection,
} from './theme';
export { mountPayment } from './payment';
export type {
  ClosedPaymentMount,
  EmbeddedPaymentMount,
  MountPaymentOptions,
  PaymentMount,
  PaymentPresentation,
  RedirectPaymentMount,
  UnsupportedPaymentMount,
} from './payment';
export { formatMoney } from './money';
export { cookiesForHost, onDefaultDomain, pixelsForHost } from './host-pixels';
export {
  cartIdKey,
  clearCartId,
  cookieCartStorage,
  loadCartId,
  saveCartId,
} from './cart-storage';
export type { CartIdStorage, CookieJar } from './cart-storage';
export {
  TURNSTILE_SCRIPT_URL,
  loadTurnstile,
  renderTurnstile,
} from './turnstile';
export type {
  RenderTurnstileOptions,
  TurnstileApi,
  TurnstileWidget,
} from './turnstile';
