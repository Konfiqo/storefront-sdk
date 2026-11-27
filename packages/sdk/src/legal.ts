/**
 * Content keys of the legal texts. A store keeps each one as content: load
 * it with `getContent(key)` and render it with `<Content>`. The `legal.`
 * prefix is reserved for these six keys.
 */
export const LEGAL_KEYS = [
  'legal.kvkk',
  'legal.privacy',
  'legal.preliminary-information',
  'legal.distance-sales',
  'legal.returns',
  'legal.cookies',
] as const;

/** One of {@link LEGAL_KEYS}. */
export type LegalKey = (typeof LEGAL_KEYS)[number];
