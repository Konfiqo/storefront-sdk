'use client';

// Every export is a hook or a client component (React Server Components /
// Next.js App Router). esbuild keeps this entry directive in the build.
export { StorefrontProvider, useStorefrontClient } from './provider';
export type { ClientConfig, StorefrontProviderProps } from './provider';
export { useStore, useCategories, useProducts, useProduct } from './catalog';
export type { ResourceResult } from './use-resource';
export { useCart, useCartStorage } from './use-cart';
export type { UseCartResult } from './use-cart';
export { isDeadCartError, defaultCartStorage } from './cart-store';
export type {
  CartSnapshot,
  CheckoutSnapshot,
  StorefrontHookError,
} from './cart-store';
export { useAccount } from './use-account';
export type { UseAccountResult } from './use-account';
export { useCheckout } from './use-checkout';
export type { CheckoutCallOptions, UseCheckoutResult } from './use-checkout';
export {
  useOrder,
  isOrderSettled,
  orderPollDelay,
  ORDER_POLL_MIN_MS,
  ORDER_POLL_MAX_MS,
} from './use-order';
export type { UseOrderOptions, UseOrderResult } from './use-order';
export { PaymentForm } from './payment-form';
export type { PaymentFormProps } from './payment-form';
export { CheckoutChallenge } from './checkout-challenge';
export type {
  CheckoutChallengeHandle,
  CheckoutChallengeProps,
} from './checkout-challenge';
export { Content, renderContent } from './content';
export type { ContentComponents, ContentProps } from './content';
export { ConsentProvider, useConsent } from './consent-provider';
export type { ConsentProviderProps, ConsentState } from './consent-provider';
export { OPTIONAL_CATEGORIES } from './consent';
export type {
  ConsentRecord,
  OptionalCookieCategory,
  StoredConsent,
} from './consent';
