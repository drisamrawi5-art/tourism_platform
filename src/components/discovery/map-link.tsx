import { ButtonLink } from '@/components/ui/button';
import type { Dictionary } from '@/i18n';
import { cn } from '@/lib/cn';

/**
 * Coordinates → map link (or the honest "pending" state).
 *
 * Coordinates are only rendered from verified data; when either value is
 * null the component states that the map location is pending instead of
 * guessing a position.
 */
export function PlaceMapLink({
  lat,
  lng,
  dict,
  size = 'md',
  className,
}: {
  lat: number | null;
  lng: number | null;
  dict: Dictionary;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  if (lat === null || lng === null) {
    return (
      <p className={cn('text-sm leading-relaxed text-rocky-500', className)}>
        {dict.common.coordinatesPending}
      </p>
    );
  }

  const href = `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}#map=15/${lat}/${lng}`;

  return (
    <ButtonLink href={href} external variant="secondary" size={size} className={className}>
      {dict.map.openMap}
    </ButtonLink>
  );
}
