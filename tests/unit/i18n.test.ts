import { describe, expect, it } from 'vitest';
import { en } from '@/i18n/dictionaries/en';
import { fr } from '@/i18n/dictionaries/fr';
import { ar } from '@/i18n/dictionaries/ar';
import { getDictionary, t, type Dictionary } from '@/i18n';
import { locales, slogans } from '@/i18n/config';

/** Flatten a nested dictionary to "parent.child" → string leaves. */
function flatten(value: unknown, prefix = ''): Record<string, string> {
  const out: Record<string, string> = {};
  if (value === null || typeof value !== 'object') return out;
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === 'string') out[path] = entry;
    else if (typeof entry === 'object' && entry !== null) {
      Object.assign(out, flatten(entry, path));
    }
  }
  return out;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1] as string).sort();
}

const enFlat = flatten(en);
const dictionaries: Array<[string, Dictionary]> = [
  ['fr', fr],
  ['ar', ar],
];

describe('dictionary parity (en is canonical)', () => {
  it('has a substantial key set (guards against a broken flatten)', () => {
    expect(Object.keys(enFlat).length).toBeGreaterThan(300);
  });

  it.each(dictionaries)('%s has exactly the same keys as en', (name, dict) => {
    const flat = flatten(dict);
    const enKeys = Object.keys(enFlat).sort();
    const otherKeys = Object.keys(flat).sort();

    const missing = enKeys.filter((k) => !(k in flat));
    const extra = otherKeys.filter((k) => !(k in enFlat));

    expect(missing, `missing keys in ${name}`).toEqual([]);
    expect(extra, `extra keys in ${name}`).toEqual([]);
  });

  it.each(dictionaries)('%s preserves interpolation placeholders from en', (name, dict) => {
    const flat = flatten(dict);
    const drift: string[] = [];
    for (const [key, value] of Object.entries(enFlat)) {
      const expected = placeholders(value);
      const actual = placeholders(flat[key] ?? '');
      if (expected.join(',') !== actual.join(',')) {
        drift.push(`${key}: en{${expected}} vs ${name}{${actual}}`);
      }
    }
    expect(drift, `placeholder drift in ${name}`).toEqual([]);
  });

  it.each(dictionaries)('%s never leaves empty strings', (name, dict) => {
    const flat = flatten(dict);
    const empties = Object.entries(flat)
      .filter(([, value]) => value.trim() === '')
      .map(([key]) => key);
    expect(empties, `empty values in ${name}`).toEqual([]);
  });
});

describe('brand rules (spec section 9)', () => {
  it('keeps "Visit Imedwan" untranslated in every locale', () => {
    for (const locale of locales) {
      expect(getDictionary(locale).brand.name).toBe('Visit Imedwan');
    }
  });

  it('keeps the destination name scripts per spec', () => {
    // Latin script in en/fr; Arabic script in ar. Only the "Visit Imedwan"
    // brand name above is never translated.
    expect(getDictionary('en').brand.destinationName).toBe('Imedwan');
    expect(getDictionary('fr').brand.destinationName).toBe('Imedwan');
    expect(getDictionary('ar').brand.destinationName).toBe('إمدوان');
    expect(en.brand.destinationNameAr).toBe('إمدوان');
    expect(ar.brand.destinationNameAr).toBe('إمدوان');
  });

  it('uses the official slogans (FR falls back to EN, AR is Arabic)', () => {
    expect(en.brand.slogan).toBe('Imedwan — Where Water Meets the Mountain');
    expect(fr.brand.slogan).toBe(en.brand.slogan);
    expect(ar.brand.slogan).toBe('إمدوان — حيث يلتقي الماء بالجبل');

    expect(slogans.en).toBe(en.brand.slogan);
    expect(slogans.fr).toBe(en.brand.slogan);
    expect(slogans.ar).toBe(ar.brand.slogan);
  });
});

describe('t() interpolation', () => {
  it('resolves nested keys and substitutes variables', () => {
    expect(t(en, 'brand.name')).toBe('Visit Imedwan');
    expect(t(en, 'missing.path')).toBe('missing.path');
  });

  it('substitutes {placeholders} without touching others', () => {
    const dict = { demo: { count: 'Showing {n} of {total} items' } } as unknown as Dictionary;
    expect(t(dict, 'demo.count', { n: 3, total: 10 })).toBe('Showing 3 of 10 items');
  });
});
