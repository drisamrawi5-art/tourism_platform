import { Badge, statusTone } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { t, type Dictionary } from '@/i18n';
import { intlLocale, type Locale } from '@/i18n/config';
import { cn } from '@/lib/cn';
import { defaultCurrency, formatMoney, formatNumber, isCurrencyCode } from '@/lib/currency';
import type { PriceFrom } from '@/lib/data/businesses';

/**
 * Small shared presentation bits for the discovery pages.
 *
 * Every string comes from the dictionary and every number/price/label is
 * either data from the data layer or formatted with Intl — nothing is
 * invented here.
 */

/** Localised label for a VerificationStatus value (fallback: pending copy). */
export function verificationLabel(status: string, dict: Dictionary): string {
  const found = Object.entries(dict.common.verification).find(([key]) => key === status);
  return found ? found[1] : dict.common.pendingVerification;
}

export function VerificationBadge({
  status,
  dict,
  className,
}: {
  status: string;
  dict: Dictionary;
  className?: string;
}) {
  return (
    <Badge tone={statusTone(status)} className={className}>
      {verificationLabel(status, dict)}
    </Badge>
  );
}

/** Endonym/localised name for a language code (falls back to the raw code). */
export function languageLabel(code: string, locale: Locale): string {
  try {
    const names = new Intl.DisplayNames([intlLocale(locale)], {
      type: 'language',
    });
    return names.of(code) ?? code;
  } catch {
    return code;
  }
}

/** Public copy for a PricingUnit value from the data layer; null when unknown. */
export function pricingUnitLabel(unit: string | null, dict: Dictionary): string | null {
  switch (unit) {
    case 'NIGHT':
      return dict.stay.perNight;
    case 'PERSON':
      return dict.guides.perPerson;
    case 'DAY':
      return dict.guides.perDay;
    case 'SERVICE':
      return dict.guides.flatService;
    default:
      return null;
  }
}

/** Format a "from" price with its real currency; null while price is unknown. */
export function formatPrice(price: PriceFrom, locale: Locale): string | null {
  if (!price) return null;
  const currency = isCurrencyCode(price.currency) ? price.currency : defaultCurrency;
  return formatMoney(price.amount, currency, locale);
}

/** "From {price}" when known, honest pending copy otherwise (never a fake fee). */
export function PriceText({
  price,
  locale,
  dict,
  className,
}: {
  price: PriceFrom;
  locale: Locale;
  dict: Dictionary;
  className?: string;
}) {
  const formatted = formatPrice(price, locale);
  if (!formatted) {
    return (
      <span className={cn('text-sm text-rocky-500', className)}>{dict.stay.detailsPending}</span>
    );
  }
  return (
    <span className={cn('text-sm font-semibold tabular-nums text-rocky-900', className)}>
      {t(dict, 'stay.from', { price: formatted })}
    </span>
  );
}

/** Star rating badge — rendered only when the data layer reports a rating. */
export function RatingBadge({
  rating,
  reviewCount,
  locale,
  dict,
  className,
}: {
  rating: number;
  reviewCount: number;
  locale: Locale;
  dict: Dictionary;
  className?: string;
}) {
  return (
    <Badge
      tone="outline"
      className={className}
      aria-label={t(dict, 'reviews.stars', { n: rating })}
    >
      <span aria-hidden="true">{'★'}</span>
      <span className="tabular-nums">{formatNumber(rating, locale)}</span>
      <span className="tabular-nums opacity-70">{`(${reviewCount})`}</span>
    </Badge>
  );
}

/**
 * CMS body copy rendered as plain paragraphs (the body is data, not dict
 * copy — no markup is executed).
 */
export function CmsBody({ body, className }: { body: string | null; className?: string }) {
  if (!body?.trim()) return null;
  const paragraphs = body.trim().split(/\n{2,}/);
  return (
    <div className={cn('cms-body', className)}>
      {paragraphs.map((paragraph, index) => (
        <p key={index}>{paragraph}</p>
      ))}
    </div>
  );
}

/** "Back" link used at the top of every detail page. */
export function BackLink({
  href,
  label,
  className,
}: {
  href: string;
  label: string;
  className?: string;
}) {
  return (
    <ButtonLink href={href} variant="ghost" size="sm" className={className}>
      {label}
    </ButtonLink>
  );
}
