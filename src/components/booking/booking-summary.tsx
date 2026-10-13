'use client';

import type { BookingQuote } from '@/lib/booking/service';
import { formatMoney, formatDate, defaultCurrency, isCurrencyCode } from '@/lib/currency';
import { t, type Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';

/**
 * Authoritative quote breakdown. Every amount is a string returned by the
 * server — this component only formats, it never computes money.
 */
export function BookingSummary({
  quote,
  dict,
  locale,
}: {
  quote: BookingQuote;
  dict: Dictionary;
  locale: Locale;
}) {
  const currency = isCurrencyCode(quote.currency) ? quote.currency : defaultCurrency;
  const money = (amount: string) => formatMoney(amount, currency, locale);
  const p = quote.pricing;

  const quantityLabel = (() => {
    switch (p.unit) {
      case 'NIGHT':
        return p.quantity === 1
          ? `${money(p.unitPrice)} × ${t(dict, 'booking.nightsOne')}`
          : t(dict, 'booking.pricePerNight', { price: money(p.unitPrice), n: p.quantity });
      case 'PERSON':
        return p.quantity === 1
          ? `${money(p.unitPrice)} × ${t(dict, 'booking.guestsOne')}`
          : t(dict, 'booking.pricePerPerson', { price: money(p.unitPrice), n: p.quantity });
      case 'DAY':
        return t(dict, 'booking.pricePerDay', { price: money(p.unitPrice), n: p.quantity });
      default:
        return t(dict, 'booking.priceFlat');
    }
  })();

  const duration =
    quote.nights !== null
      ? quote.nights === 1
        ? t(dict, 'booking.nightsOne')
        : t(dict, 'booking.nights', { n: quote.nights })
      : t(dict, 'booking.days', { n: quote.days });

  const guests =
    quote.guests === 1
      ? t(dict, 'booking.guestsOne')
      : t(dict, 'booking.guestsMany', { n: quote.guests });

  return (
    <div className="space-y-4">
      <div>
        <p className="text-base font-semibold text-rocky-900">{quote.bookable.name}</p>
        <p className="mt-0.5 text-sm text-rocky-600">{quote.bookable.businessName}</p>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
            {t(dict, 'booking.startDate')}
          </dt>
          <dd className="text-rocky-800">{formatDate(quote.startDate, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
            {t(dict, 'booking.endDate')}
          </dt>
          <dd className="text-rocky-800">{formatDate(quote.endDate, locale)}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
            {t(dict, 'booking.steps.dates')}
          </dt>
          <dd className="text-rocky-800">{duration}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
            {t(dict, 'booking.guests')}
          </dt>
          <dd className="text-rocky-800">{guests}</dd>
        </div>
      </dl>

      <div className="border-t border-rocky-200 pt-4">
        <p className="text-sm font-medium text-rocky-800">{quantityLabel}</p>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex items-baseline justify-between gap-3">
            <dt className="text-rocky-600">{t(dict, 'booking.subtotal')}</dt>
            <dd className="font-medium tabular-nums text-rocky-900">{money(p.subtotal)}</dd>
          </div>
          <div className="flex items-baseline justify-between gap-3 border-t border-rocky-200 pt-2">
            <dt className="font-semibold text-rocky-900">{t(dict, 'booking.total')}</dt>
            <dd className="text-base font-semibold tabular-nums text-rocky-900">
              {money(quote.total)}
            </dd>
          </div>
        </dl>
        {quote.deposit && quote.deposit.enabled ? (
          <p className="mt-3 rounded-lg bg-water-50 px-3 py-2 text-xs leading-relaxed text-water-900">
            {t(dict, 'booking.depositNote', {
              percent: quote.deposit.percent,
              amount: money(quote.deposit.amount),
            })}
          </p>
        ) : null}
      </div>
    </div>
  );
}
