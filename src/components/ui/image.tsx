import Image from 'next/image';
import type { PublicImage } from '@/lib/data/common';
import { cn } from '@/lib/cn';
import { Monogram } from '@/components/layout/logo';

/**
 * Media-aware image with an honest empty state.
 *
 * Seed content ships without moderated media, so EVERY image slot must look
 * intentional when no image exists — no broken frames, no fake stock photos.
 */
export function SmartImage({
  image,
  alt,
  className,
  /** Tailwind aspect utility, default 4/3. */
  ratio = 'aspect-[4/3]',
  priority,
  sizes,
}: {
  image: PublicImage | null | undefined;
  alt?: string;
  className?: string;
  ratio?: string;
  priority?: boolean;
  sizes?: string;
}) {
  if (!image?.url) {
    return <ImagePlaceholder className={cn(ratio, className)} label={alt} />;
  }

  return (
    <div className={cn('relative overflow-hidden bg-rocky-100', ratio, className)}>
      <Image
        src={image.url}
        alt={image.alt || alt || ''}
        fill
        unoptimized
        priority={priority}
        sizes={sizes ?? '(max-width: 768px) 100vw, 33vw'}
        className="object-cover"
      />
    </div>
  );
}

/**
 * Brand placeholder used wherever media is absent (pending moderation or
 * simply not provided yet). Decorative unless `label` is given.
 */
export function ImagePlaceholder({ className, label }: { className?: string; label?: string }) {
  return (
    <div
      role={label ? 'img' : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      className={cn(
        'relative flex flex-col items-center justify-center overflow-hidden',
        'bg-gradient-to-br from-forest-100 via-water-50 to-peach-50',
        'aspect-[4/3]',
        className,
      )}
    >
      {/* Rocky silhouette band — a neutral abstract shape, not a real place. */}
      <svg
        viewBox="0 0 120 40"
        preserveAspectRatio="none"
        className="absolute inset-x-0 bottom-0 h-1/3 w-full text-forest-200/70"
        aria-hidden="true"
      >
        <path d="M0 40 L22 14 L38 26 L54 8 L76 30 L92 18 L120 40 Z" fill="currentColor" />
      </svg>
      <div className="relative -translate-y-1 opacity-80">
        <Monogram className="size-7" />
      </div>
      {label ? (
        <span className="relative mt-1 max-w-[85%] truncate px-2 text-xs font-medium text-forest-800">
          {label}
        </span>
      ) : null}
    </div>
  );
}
