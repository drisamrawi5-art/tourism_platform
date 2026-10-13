/**
 * Locale configuration for Visit Imedwan.
 *
 * V1 locales: English, French, Arabic. Arabic is a first-class RTL locale —
 * layouts use logical properties and the document direction switches
 * (see src/app/[locale]/layout.tsx).
 */

export const locales = ['en', 'fr', 'ar'] as const;
export type Locale = (typeof locales)[number];

export const defaultLocale: Locale = 'en';

export const localeNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
};

/** Native script label for each locale (used in the language switcher). */
export const localeNativeNames: Record<Locale, string> = {
  en: 'English',
  fr: 'Français',
  ar: 'العربية',
};

export function isLocale(value: unknown): value is Locale {
  return typeof value === 'string' && (locales as readonly string[]).includes(value);
}

export function isRtl(locale: Locale): boolean {
  return locale === 'ar';
}

export function direction(locale: Locale): 'ltr' | 'rtl' {
  return isRtl(locale) ? 'rtl' : 'ltr';
}

/**
 * Official slogan system (spec section 9).
 * Only one version is shown per language context — never all at once.
 *
 * FR note: no official French slogan was provided by the project, so French
 * intentionally falls back to the English slogan until one is approved
 * (never inventing content).
 */
export const slogans: Record<Locale, string> = {
  en: 'Imedwan — Where Water Meets the Mountain',
  fr: 'Imedwan — Where Water Meets the Mountain', // pending official FR slogan
  ar: 'إمدوان — حيث يلتقي الماء بالجبل',
};

/** Shown in the Amazigh (future) locale context and brand assets. */
export const sloganAmazighLatin = 'Imedwan — Aman d Udrar';
export const sloganTifinagh = 'ⵉⵎⴷⵡⴰⵏ — ⴰⵎⴰⵏ ⴷ ⵓⴷⵔⴰⵔ';

/**
 * Map a UI locale to an Intl locale tag for number/date/currency formatting.
 */
export function intlLocale(locale: Locale): string {
  switch (locale) {
    case 'fr':
      return 'fr-MA';
    case 'ar':
      return 'ar-MA';
    default:
      return 'en-MA';
  }
}
