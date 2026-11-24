/**
 * Store theme, `schemaVersion: 1` (the commerce module's "Store settings
 * JSON"). The Storefront API passes the theme through **as stored**: it is
 * not validated, so every field is optional and a renderer must tolerate
 * missing values, wrong types and keys it does not know. Image fields are
 * tenant storage keys — turn them into URLs with `client.media.url(key)`.
 */
export interface ThemeV1 {
  /** `1` for this shape. Anything else: render defaults. */
  schemaVersion?: number;
  /** Storage key of the logo (the same key as the store's `logo`). */
  logo?: string | null;
  /** Storage key of the favicon. */
  favicon?: string | null;
  /** Theme colors, CSS color strings (normally `#rrggbb`). */
  colors?: ThemeColors;
  /** One of {@link THEME_FONTS}; an unknown value means "use the default font". */
  font?: ThemeFont | (string & {});
  /** The homepage, as ordered sections. */
  homepage?: ThemeHomepage;
  /** Footer links and social profiles. */
  footer?: ThemeFooter;
  /** Keys this SDK version does not know are kept as stored. */
  [key: string]: unknown;
}

/** Theme colors. Each is a CSS color string; any may be missing. */
export interface ThemeColors {
  /** Primary brand color. */
  primary?: string;
  /** Accent (links, highlights). */
  accent?: string;
  /** Page background. */
  background?: string;
  /** Body text. */
  text?: string;
  /** Unknown color keys are kept as stored. */
  [key: string]: unknown;
}

/** The fonts a v1 theme may name. */
export const THEME_FONTS = [
  'inter',
  'roboto',
  'open-sans',
  'lato',
  'poppins',
] as const;

/** A font a v1 theme may name. */
export type ThemeFont = (typeof THEME_FONTS)[number];

/** The homepage: sections in display order. */
export interface ThemeHomepage {
  /**
   * Sections in display order. May contain section types this SDK does not
   * know (skip them) — narrow with {@link isKnownThemeSection}.
   */
  sections?: ThemeSection[];
  /** Unknown homepage keys are kept as stored. */
  [key: string]: unknown;
}

/** A call-to-action link. */
export interface ThemeLink {
  /** Visible text. */
  label?: string;
  /** Target URL or path. */
  href?: string;
}

/** `hero`: a large banner with an optional image and call to action. */
export interface HeroSection {
  /** Discriminator. */
  type: 'hero';
  /** Storage key of the banner image. */
  image?: string | null;
  /** Headline. */
  title?: string;
  /** Sub-headline. */
  subtitle?: string;
  /** Optional call-to-action button. */
  cta?: ThemeLink;
}

/** `featuredProducts`: a hand-picked list of products. */
export interface FeaturedProductsSection {
  /** Discriminator. */
  type: 'featuredProducts';
  /** Section heading. */
  title?: string;
  /** Product slugs, in display order. Slugs no longer sold are skipped. */
  productSlugs?: string[];
}

/** `categoryGrid`: a grid of category tiles. */
export interface CategoryGridSection {
  /** Discriminator. */
  type: 'categoryGrid';
  /** Category slugs, in display order. Unknown slugs are skipped. */
  categorySlugs?: string[];
}

/**
 * `richText`: seller-written text. Render it as text or sanitized
 * markdown — never as raw HTML.
 */
export interface RichTextSection {
  /** Discriminator. */
  type: 'richText';
  /** The text. */
  content?: string;
}

/** A section type this SDK knows how to describe. */
export type KnownThemeSection =
  HeroSection | FeaturedProductsSection | CategoryGridSection | RichTextSection;

/** A section of a type this SDK version does not know; renderers skip it. */
export interface UnknownThemeSection {
  /** The stored type. */
  type: string;
  /** Other stored keys. */
  [key: string]: unknown;
}

/** A homepage section as stored: a known section or an unknown one. */
export type ThemeSection = KnownThemeSection | UnknownThemeSection;

const KNOWN_SECTION_TYPES: ReadonlySet<string> = new Set([
  'hero',
  'featuredProducts',
  'categoryGrid',
  'richText',
]);

/**
 * Whether a stored section is one of the known types. After this guard a
 * `switch (section.type)` narrows to the exact section shape.
 */
export function isKnownThemeSection(
  section: unknown,
): section is KnownThemeSection {
  return (
    typeof section === 'object' &&
    section !== null &&
    typeof (section as { type?: unknown }).type === 'string' &&
    KNOWN_SECTION_TYPES.has((section as { type: string }).type)
  );
}

/** Social profile URLs; only filled ones are stored. */
export interface ThemeSocial {
  /** Instagram profile URL. */
  instagram?: string;
  /** Facebook page URL. */
  facebook?: string;
  /** X profile URL. */
  x?: string;
  /** TikTok profile URL. */
  tiktok?: string;
  /** YouTube channel URL. */
  youtube?: string;
  /** Unknown networks are kept as stored. */
  [key: string]: unknown;
}

/** Footer configuration. */
export interface ThemeFooter {
  /** Footer links, in display order. */
  links?: ThemeLink[];
  /** Social profiles. */
  social?: ThemeSocial;
  /** Unknown footer keys are kept as stored. */
  [key: string]: unknown;
}
