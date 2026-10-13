import { en, type Dictionary } from './dictionaries/en';
import { fr } from './dictionaries/fr';
import { ar } from './dictionaries/ar';
import { defaultLocale, type Locale } from './config';

export type { Dictionary };

const dictionaries: Record<Locale, Dictionary> = { en, fr, ar };

/** Resolve a dictionary for a locale (always complete — enforced by types). */
export function getDictionary(locale: Locale): Dictionary {
  return dictionaries[locale] ?? dictionaries[defaultLocale];
}

/** Locale-aware string interpolation: t("booking.nights", { n: 3 }). */
export function t(
  dictionary: Dictionary,
  key: string,
  vars?: Record<string, string | number>,
): string {
  const value = key.split('.').reduce<unknown>((acc, part) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[part];
    return undefined;
  }, dictionary);

  let str = typeof value === 'string' ? value : key;
  if (vars) {
    for (const [k, v] of Object.entries(vars)) {
      str = str.replaceAll(`{${k}}`, String(v));
    }
  }
  return str;
}
