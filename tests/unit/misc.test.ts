import { describe, expect, it } from 'vitest';
import { cn } from '@/lib/cn';
import { defaultLocale, direction, isLocale, isRtl, localeNames, locales } from '@/i18n/config';
import { formatMoney, formatNumber, isCurrencyCode } from '@/lib/currency';

describe('cn()', () => {
  it('joins strings and drops falsy values', () => {
    expect(cn('a', null, undefined, false, 'b')).toBe('a b');
    expect(cn()).toBe('');
  });

  it('unwraps arrays and condition objects', () => {
    expect(cn(['a', ['b', 'c']], { d: true, e: false })).toBe('a b c d');
  });

  it('keeps numeric zero', () => {
    expect(cn(0, 'x')).toBe('0 x');
  });
});

describe('locale configuration', () => {
  it('exposes exactly the three V1 locales', () => {
    expect([...locales].sort()).toEqual(['ar', 'en', 'fr']);
    expect(defaultLocale).toBe('en');
  });

  it('validates locale codes', () => {
    expect(isLocale('en')).toBe(true);
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('de')).toBe(false);
    expect(isLocale(42)).toBe(false);
  });

  it('switches direction only for Arabic', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('fr')).toBe(false);
    expect(direction('ar')).toBe('rtl');
    expect(direction('en')).toBe('ltr');
    expect(direction('fr')).toBe('ltr');
  });

  it('names every locale natively', () => {
    for (const locale of locales) {
      expect(localeNames[locale].length).toBeGreaterThan(0);
    }
    expect(localeNames.ar).toBe('العربية');
    expect(localeNames.fr).toBe('Français');
  });
});

describe('currency formatting', () => {
  it('formats valid amounts with grouping and the currency code', () => {
    const usd = formatMoney(1234.5, 'MAD', 'en');
    expect(usd).toContain('1,234.5');
    expect(usd).toContain('MAD');
    expect(formatMoney('99.9', 'EUR', 'fr')).toContain('99,9');
    expect(formatMoney(2000000, 'USD', 'en')).toContain('2,000,000');
  });

  it('returns an em dash for invalid amounts (never NaN in the UI)', () => {
    expect(formatMoney('not-a-number', 'MAD', 'en')).toBe('—');
    expect(formatMoney(Number.NaN, 'MAD', 'en')).toBe('—');
  });

  it('validates currency codes', () => {
    expect(isCurrencyCode('MAD')).toBe(true);
    expect(isCurrencyCode('BTC')).toBe(false);
    expect(isCurrencyCode(7)).toBe(false);
  });

  it('formats numbers per locale', () => {
    expect(formatNumber(1234.5, 'en')).toBe('1,234.5');
  });
});
