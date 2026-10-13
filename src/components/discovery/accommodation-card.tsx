import Link from 'next/link';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { SmartImage } from '@/components/ui/image';
import { t, type Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { cn } from '@/lib/cn';
import type { AccommodationCard as AccommodationData } from '@/lib/data/businesses';
import { PriceText, RatingBadge, VerificationBadge } from './bits';

/**
 * Accommodation tile (server-safe). Price, rating and capacity are rendered
 * only when the data layer actually has them — null stays visibly honest.
 */
export function AccommodationCard({
  item,
  locale,
  dict,
  className,
  imageRatio = 'aspect-[4/3]',
}: {
  item: AccommodationData;
  locale: Locale;
  dict: Dictionary;
  className?: string;
  imageRatio?: string;
}) {
  const href = `/${locale}/stay/${item.slug}`;
  const hasMeta = item.capacity !== null || Boolean(item.address);

  return (
    <Card
      className={cn(
        'flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md',
        className,
      )}
    >
      <Link href={href} className="block bg-rocky-100">
        <SmartImage image={item.hero} alt={item.name} ratio={imageRatio} />
      </Link>
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status={item.verificationStatus} dict={dict} />
          {item.rating !== null ? (
            <RatingBadge
              rating={item.rating}
              reviewCount={item.reviewCount}
              locale={locale}
              dict={dict}
            />
          ) : null}
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-rocky-900">
            <Link href={href} className="transition-colors hover:text-forest-700">
              {item.name}
            </Link>
          </h3>
          {item.description ? (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-rocky-600">
              {item.description}
            </p>
          ) : (
            <p className="mt-1 text-sm text-rocky-500">{dict.stay.noDescription}</p>
          )}
        </div>
        {hasMeta ? (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-rocky-500">
            {item.capacity !== null ? (
              <span>{t(dict, 'stay.capacity', { n: item.capacity })}</span>
            ) : null}
            {item.address ? <span>{item.address}</span> : null}
          </div>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-rocky-100 pt-3">
          <PriceText price={item.priceFrom} locale={locale} dict={dict} />
          <ButtonLink href={href} variant="secondary" size="sm">
            {dict.stay.viewAccommodation}
          </ButtonLink>
        </div>
      </CardBody>
    </Card>
  );
}
