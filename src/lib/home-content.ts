import { getDictionary, type Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';
import { db } from '@/lib/db';
import { getSetting } from '@/lib/settings';

/**
 * Homepage editorial overrides (Phase 3 CMS).
 *
 * The public homepage is dictionary-driven; this module layers the
 * database-backed `homepage.*` settings over that built-in copy. An empty
 * or absent override always falls back to the dictionary — translations are
 * never silently replaced with invented text, and an editor can clear an
 * override simply by emptying the field.
 */

/** Homepage sections an editor can hide (array order = render order). */
export const HOME_SECTION_KEYS = [
  'intro',
  'discover',
  'stay',
  'guides',
  'story',
  'plan',
] as const;
export type HomeSectionKey = (typeof HOME_SECTION_KEYS)[number];

export type HomeView = {
  /** Dictionary `home` with editor overrides applied. */
  home: Dictionary['home'];
  /** Hero heading override — '' means "use the official slogan". */
  heroHeading: string;
  /** Hero CTA labels (already resolved against dict.nav fallbacks). */
  heroCtas: { places: string; book: string; plan: string };
  /** Plan-section gallery button label (resolved against dict.nav.gallery). */
  planGalleryLabel: string;
  /** Sections an editor hid from the public homepage. */
  hidden: ReadonlySet<HomeSectionKey>;
  /** Approved/published hero image, or null → built-in gradient. */
  heroImage: { storageKey: string; alt: string } | null;
};

/** Keep non-empty strings only — '' always means "inherit built-in copy". */
function readContent(value: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    for (const [field, raw] of Object.entries(value as Record<string, unknown>)) {
      if (typeof raw === 'string' && raw.trim() !== '') out[field] = raw;
    }
  }
  return out;
}

export async function getHomeView(locale: Locale): Promise<HomeView> {
  // `fresh: true` — the homepage overlay must reflect an editor's save on the
  // very next render (the settings cache is per-bundle and cannot be
  // invalidated cross-bundle by the admin API write).
  const [content, hiddenRaw, heroImageIdRaw] = await Promise.all([
    getSetting(`homepage.content.${locale}`, { fresh: true }),
    getSetting('homepage.hiddenSections', { fresh: true }),
    getSetting('homepage.heroImageId', { fresh: true }),
  ]);

  const c = readContent(content);
  const dict = getDictionary(locale);
  const base = dict.home;
  const pick = (field: string, fallback: string): string => c[field] ?? fallback;

  const hidden = new Set<HomeSectionKey>();
  if (Array.isArray(hiddenRaw)) {
    for (const key of hiddenRaw) {
      if (typeof key === 'string' && (HOME_SECTION_KEYS as readonly string[]).includes(key)) {
        hidden.add(key as HomeSectionKey);
      }
    }
  }

  // Hero image: must exist and be publicly servable (APPROVED/PUBLISHED —
  // the same statuses the media file endpoint serves to anonymous visitors).
  const heroImageId = typeof heroImageIdRaw === 'string' ? heroImageIdRaw : '';
  let heroImage: HomeView['heroImage'] = null;
  if (heroImageId) {
    const media = await db.media
      .findUnique({
        where: { id: heroImageId },
        select: { storageKey: true, alt: true, status: true },
      })
      .catch(() => null);
    if (media && (media.status === 'APPROVED' || media.status === 'PUBLISHED')) {
      heroImage = { storageKey: media.storageKey, alt: media.alt };
    }
  }

  return {
    home: {
      ...base,
      heroEyebrow: pick('heroEyebrow', base.heroEyebrow),
      heroSubtitle: pick('heroSubtitle', base.heroSubtitle),
      explore: pick('exploreLabel', base.explore),
      planVisit: pick('planVisitLabel', base.planVisit),
      intro: {
        ...base.intro,
        eyebrow: pick('introEyebrow', base.intro.eyebrow),
        title: pick('introTitle', base.intro.title),
        body: pick('introBody', base.intro.body),
      },
      discoverTitle: pick('discoverTitle', base.discoverTitle),
      discoverSubtitle: pick('discoverKicker', base.discoverSubtitle),
      stayTitle: pick('stayTitle', base.stayTitle),
      staySubtitle: pick('stayBody', base.staySubtitle),
      placesSubtitle: pick('stayKicker', base.placesSubtitle),
      guidesTitle: pick('guidesTitle', base.guidesTitle),
      guidesSubtitle: pick('guidesBody', base.guidesSubtitle),
      story: {
        ...base.story,
        eyebrow: pick('storyEyebrow', base.story.eyebrow),
        title: pick('storyTitle', base.story.title),
        body: pick('storyBody', base.story.body),
        cta: pick('storyCtaLabel', base.story.cta),
      },
      planTitle: pick('planTitle', base.planTitle),
      planSubtitle: pick('planSubtitle', base.planSubtitle),
    },
    heroHeading: c.heroHeading ?? '',
    heroCtas: {
      places: pick('ctaPlacesLabel', dict.nav.places),
      book: pick('ctaBookLabel', dict.nav.bookNow),
      plan: pick('ctaPlanLabel', dict.nav.plan),
    },
    planGalleryLabel: pick('galleryLabel', dict.nav.gallery),
    hidden,
    heroImage,
  };
}
