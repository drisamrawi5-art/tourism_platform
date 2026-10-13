import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { SmartImage } from '@/components/ui/image';
import { type Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { cn } from '@/lib/cn';
import type { GuideCard as GuideData } from '@/lib/data/businesses';
import { languageLabel, PriceText, RatingBadge, VerificationBadge } from './bits';

/**
 * Guide tile (server-safe). `compact` renders the horizontal editorial row
 * used in previews; languages come from the provider's data (BCP-47 codes),
 * rendered with Intl.DisplayNames.
 */
export function GuideCard({
  item,
  locale,
  dict,
  className,
  compact = false,
}: {
  item: GuideData;
  locale: Locale;
  dict: Dictionary;
  className?: string;
  compact?: boolean;
}) {
  const href = `/${locale}/guides/${item.slug}`;

  return (
    <Card
      className={cn(
        'overflow-hidden transition-shadow hover:shadow-md',
        compact ? 'flex flex-row items-stretch' : 'flex h-full flex-col',
        className,
      )}
    >
      <Link href={href} className={cn('block shrink-0 bg-rocky-100', compact && 'w-28 sm:w-40')}>
        <SmartImage
          image={item.hero}
          alt={item.name}
          ratio={compact ? 'aspect-square' : 'aspect-[4/3]'}
          className={compact ? 'h-full w-full' : undefined}
        />
      </Link>
      <CardBody className={cn('flex flex-col gap-3', compact ? 'flex-1 p-4 sm:p-5' : 'flex-1')}>
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
            <p
              className={cn(
                'mt-1 text-sm leading-relaxed text-rocky-600',
                compact ? 'line-clamp-2' : 'line-clamp-3',
              )}
            >
              {item.description}
            </p>
          ) : null}
        </div>
        {item.languages.length > 0 ? (
          <div className="flex flex-wrap items-center gap-1.5">
            {item.languages.map((code) => (
              <Badge key={code} tone="neutral">
                {languageLabel(code, locale)}
              </Badge>
            ))}
          </div>
        ) : null}
        {!compact && item.areasCovered ? (
          <p className="text-sm text-rocky-500">{item.areasCovered}</p>
        ) : null}
        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-rocky-100 pt-3">
          <PriceText price={item.priceFrom} locale={locale} dict={dict} />
          <ButtonLink href={href} variant="secondary" size="sm">
            {dict.guides.viewGuide}
          </ButtonLink>
        </div>
      </CardBody>
    </Card>
  );
}
