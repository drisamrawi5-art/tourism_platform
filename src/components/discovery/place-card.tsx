import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { ButtonLink } from '@/components/ui/button';
import { Card, CardBody } from '@/components/ui/card';
import { SmartImage } from '@/components/ui/image';
import { t, type Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { cn } from '@/lib/cn';
import type { PlaceCard as PlaceData } from '@/lib/data/places';
import { VerificationBadge } from './bits';

/**
 * Place tile (server-safe). Placeholder art shows until a moderated hero
 * image exists — the layout is built for both states.
 */
export function PlaceCard({
  place,
  locale,
  dict,
  className,
  imageRatio = 'aspect-[4/3]',
}: {
  place: PlaceData;
  locale: Locale;
  dict: Dictionary;
  className?: string;
  imageRatio?: string;
}) {
  const href = `/${locale}/places/${place.slug}`;
  const linkLabel = t(dict, 'places.viewPlace', { name: place.name });

  return (
    <Card
      className={cn(
        'flex h-full flex-col overflow-hidden transition-shadow hover:shadow-md',
        className,
      )}
    >
      <Link href={href} className="block bg-rocky-100">
        <SmartImage image={place.hero} alt={place.name} ratio={imageRatio} />
      </Link>
      <CardBody className="flex flex-1 flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {place.typeLabel ? <Badge tone="info">{place.typeLabel}</Badge> : null}
          <VerificationBadge status={place.verificationStatus} dict={dict} />
        </div>
        <div>
          <h3 className="font-display text-lg font-semibold text-rocky-900">
            <Link href={href} className="transition-colors hover:text-forest-700">
              {place.name}
            </Link>
          </h3>
          {place.summary ? (
            <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-rocky-600">
              {place.summary}
            </p>
          ) : null}
        </div>
        <div className="mt-auto pt-1">
          <ButtonLink href={href} variant="link" size="sm">
            {linkLabel}
          </ButtonLink>
        </div>
      </CardBody>
    </Card>
  );
}
