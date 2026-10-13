import { Prisma, type BookableCategory } from '@prisma/client';
import { db } from '@/lib/db';

/**
 * Homepage editorial copy — one flat object per locale (Phase 3 CMS).
 * Every field defaults to '' which means "inherit the built-in dictionary
 * copy": overrides only ever replace text an editor explicitly supplied,
 * never inventing translations. Edited via the Homepage editor
 * (settings.manage) and rendered by `getHomeView` on the public homepage.
 */
export const HOMEPAGE_CONTENT_DEFAULT = {
  heroEyebrow: '',
  /** '' → the official slogan for the locale (i18n/config slogans). */
  heroHeading: '',
  heroSubtitle: '',
  /** Hero call-to-action labels ('' → dict.nav.places / nav.bookNow / nav.plan). */
  ctaPlacesLabel: '',
  ctaBookLabel: '',
  ctaPlanLabel: '',
  introEyebrow: '',
  introTitle: '',
  introBody: '',
  discoverKicker: '',
  discoverTitle: '',
  exploreLabel: '',
  stayKicker: '',
  stayTitle: '',
  stayBody: '',
  guidesTitle: '',
  guidesBody: '',
  storyEyebrow: '',
  storyTitle: '',
  storyBody: '',
  storyCtaLabel: '',
  planTitle: '',
  planSubtitle: '',
  planVisitLabel: '',
  galleryLabel: '',
} as const;

export type HomepageContentField = keyof typeof HOMEPAGE_CONTENT_DEFAULT;

/**
 * Centralised business configuration (spec sections 34, 39, 69–70).
 *
 * All tunable business numbers live in the `settings` table (with code-level
 * defaults documented here) — commissions, deposits, hold windows, review
 * eligibility, media limits, SEO defaults. No magic numbers in components.
 *
 * Resolution hierarchy for deposit rules:
 *   service (Bookable.config) → provider (Business.config) → category → global
 * Commission is platform-controlled:
 *   category → global
 */

export const SETTING_DEFAULTS = {
  /** Platform commission rate in percent. Neutral default — configure per launch. */
  'commission.default.ratePercent': 0,
  /** Commission override for a category (key: `commission.<CATEGORY>.ratePercent`). */
  'commission.ACCOMMODATION.ratePercent': null as number | null,
  'commission.GUIDE.ratePercent': null as number | null,

  'deposit.default.enabled': false,
  'deposit.default.percent': 0,
  'deposit.ACCOMMODATION.enabled': null as boolean | null,
  'deposit.ACCOMMODATION.percent': null as number | null,
  'deposit.GUIDE.enabled': null as boolean | null,
  'deposit.GUIDE.percent': null as number | null,

  /** How long a PENDING unpaid booking holds inventory. */
  'booking.holdMinutes': 30,
  /** Days after completion during which a customer may review. */
  'review.eligibility.windowDays': 90,
  /** Days after completion after which a booking auto-completes (job). */
  'booking.autoCompleteDays': 7,

  'media.maxImageBytes': 10 * 1024 * 1024,
  'media.maxVideoBytes': 100 * 1024 * 1024,
  'media.allowedImageTypes': ['image/jpeg', 'image/png', 'image/webp', 'image/avif'],
  'media.allowedVideoTypes': ['video/mp4', 'video/webm'],

  'seo.titleTemplate': '%s · Visit Imedwan',
  'seo.defaultOgAlt': 'Visit Imedwan',

  /** Default currency for new bookings (V1: MAD). */
  'currency.default': 'MAD',

  /** Homepage copy overrides per locale ('' field = inherit built-in copy). */
  'homepage.content.en': HOMEPAGE_CONTENT_DEFAULT,
  'homepage.content.fr': HOMEPAGE_CONTENT_DEFAULT,
  'homepage.content.ar': HOMEPAGE_CONTENT_DEFAULT,
  /** Media id shown as the homepage hero image ('' = built-in gradient). */
  'homepage.heroImageId': '',
  /** Section keys hidden from the public homepage (empty = all visible). */
  'homepage.hiddenSections': [] as string[],
} as const;

export type SettingKey = keyof typeof SETTING_DEFAULTS;

const CACHE_TTL_MS = 30_000;
type CacheEntry = { value: unknown; expires: number };
const cache = new Map<string, CacheEntry>();

export function invalidateSettingCache(): void {
  cache.clear();
}

/**
 * Read a setting. `fresh: true` skips the in-memory cache and re-reads the
 * database (still refreshing the cache afterwards). Needed where immediate
 * consistency matters — e.g. the homepage CMS overlay, where an editor's
 * save must be visible on the next render. Reason: this cache is
 * module-instance-local; route handlers and pages can live in separate
 * bundles (and separate server processes in production), so an API write's
 * invalidateSettingCache() cannot reach another bundle's cache.
 */
export async function getSetting<K extends SettingKey>(
  key: K,
  options?: { fresh?: boolean },
): Promise<(typeof SETTING_DEFAULTS)[K]>;
export async function getSetting(key: string, options?: { fresh?: boolean }): Promise<unknown>;
export async function getSetting(key: string, options?: { fresh?: boolean }): Promise<unknown> {
  if (options?.fresh !== true) {
    const cached = cache.get(key);
    if (cached && cached.expires > Date.now()) return cached.value;
  }

  let value: unknown;
  try {
    const row = await db.setting.findUnique({ where: { key } });
    value = row ? row.value : (SETTING_DEFAULTS as Record<string, unknown>)[key];
  } catch {
    value = (SETTING_DEFAULTS as Record<string, unknown>)[key];
  }
  if (value === undefined) value = null;
  cache.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  return value;
}

export async function setSetting(key: string, value: unknown, updatedById?: string): Promise<void> {
  const json = value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue);
  await db.setting.upsert({
    where: { key },
    create: { key, value: json, updatedById },
    update: { value: json, updatedById },
  });
  invalidateSettingCache();
}

export async function getAllSettings(): Promise<Record<string, unknown>> {
  const rows = await db.setting.findMany({ orderBy: { key: 'asc' } });
  const out: Record<string, unknown> = { ...SETTING_DEFAULTS };
  for (const r of rows) out[r.key] = r.value;
  return out;
}

// ---------------------------------------------------------------------------
// Feature flags (spec section 70)
// ---------------------------------------------------------------------------

export const FEATURE_FLAG_KEYS = [
  'AI_CONCIERGE',
  'RESTAURANTS',
  'EXPERIENCES',
  'EVENTS',
  'TRANSPORT',
  'MULTI_DESTINATION',
  'PROMOTED_LISTINGS',
  'MOBILE_APP',
] as const;
export type FeatureFlagKey = (typeof FEATURE_FLAG_KEYS)[number];

/** Flags default to false — nothing fake is ever surfaced. */
export async function isFeatureEnabled(flag: FeatureFlagKey): Promise<boolean> {
  const cached = cache.get(`flag:${flag}`);
  if (cached && cached.expires > Date.now()) return cached.value === true;
  let enabled = false;
  try {
    const row = await db.featureFlag.findUnique({ where: { key: flag } });
    enabled = row?.enabled ?? false;
  } catch {
    enabled = false;
  }
  cache.set(`flag:${flag}`, { value: enabled, expires: Date.now() + CACHE_TTL_MS });
  return enabled;
}

export async function setFeatureFlag(flag: FeatureFlagKey, enabled: boolean): Promise<void> {
  await db.featureFlag.upsert({
    where: { key: flag },
    create: { key: flag, enabled },
    update: { enabled },
  });
  invalidateSettingCache();
}

// ---------------------------------------------------------------------------
// Business rule resolution
// ---------------------------------------------------------------------------

type ProviderConfig = {
  depositEnabled?: unknown;
  depositPercent?: unknown;
  freeCancellationHours?: unknown;
  cancellationPolicyText?: unknown;
} | null;

function asBool(v: unknown): boolean | null {
  return typeof v === 'boolean' ? v : null;
}
function asNumber(v: unknown): number | null {
  return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null;
}

export type DepositConfig = {
  enabled: boolean;
  percent: number;
  /** Where the effective value came from (for transparency in admin UI). */
  source: 'service' | 'provider' | 'category' | 'global';
};

/**
 * Deposit resolution: service → provider → category → global (field-wise).
 * `percent` is normalised to (0, 100]; an enabled deposit with an invalid
 * percent is disabled rather than charging a wrong amount.
 */
export async function resolveDepositConfig(input: {
  category: BookableCategory;
  businessConfig?: ProviderConfig;
  bookableConfig?: ProviderConfig;
}): Promise<DepositConfig> {
  const category = input.category;

  const globalEnabled = asBool(await getSetting('deposit.default.enabled')) ?? false;
  const globalPercent = asNumber(await getSetting('deposit.default.percent')) ?? 0;

  const categoryEnabled = asBool(await getSetting(`deposit.${category}.enabled` as SettingKey));
  const categoryPercent = asNumber(await getSetting(`deposit.${category}.percent` as SettingKey));

  const providerEnabled = asBool(input.businessConfig?.depositEnabled);
  const providerPercent = asNumber(input.businessConfig?.depositPercent);

  const serviceEnabled = asBool(input.bookableConfig?.depositEnabled);
  const servicePercent = asNumber(input.bookableConfig?.depositPercent);

  let enabled = serviceEnabled ?? providerEnabled ?? categoryEnabled ?? globalEnabled;
  let percent = servicePercent ?? providerPercent ?? categoryPercent ?? globalPercent;

  const source: DepositConfig['source'] =
    serviceEnabled !== null || servicePercent !== null
      ? 'service'
      : providerEnabled !== null || providerPercent !== null
        ? 'provider'
        : categoryEnabled !== null || categoryPercent !== null
          ? 'category'
          : 'global';

  if (percent <= 0 || percent > 100) {
    if (enabled) enabled = false;
    percent = 0;
  }

  return { enabled, percent, source };
}

/**
 * Commission rate: category → global. Platform-controlled only.
 */
export async function resolveCommissionRate(category: BookableCategory): Promise<number> {
  const cat = asNumber(await getSetting(`commission.${category}.ratePercent` as SettingKey));
  if (cat !== null) return Math.min(Math.max(cat, 0), 100);
  const global = asNumber(await getSetting('commission.default.ratePercent'));
  return global !== null ? Math.min(Math.max(global, 0), 100) : 0;
}

export async function getHoldMinutes(): Promise<number> {
  const v = Number(await getSetting('booking.holdMinutes'));
  return Number.isFinite(v) && v > 0 ? v : 30;
}

export async function getReviewWindowDays(): Promise<number> {
  const v = Number(await getSetting('review.eligibility.windowDays'));
  return Number.isFinite(v) && v > 0 ? v : 90;
}

export type CancellationInfo = {
  text: string | null;
  freeCancellationHours: number | null;
};

/** Cancellation policy: service → provider → default (platform-configured text). */
export function resolveCancellation(
  businessConfig: ProviderConfig,
  bookableConfig: ProviderConfig,
): CancellationInfo {
  const svcText =
    typeof bookableConfig?.cancellationPolicyText === 'string'
      ? bookableConfig.cancellationPolicyText
      : null;
  const svcHours = asNumber(bookableConfig?.freeCancellationHours);
  if (svcText !== null || svcHours !== null) {
    return { text: svcText, freeCancellationHours: svcHours };
  }
  const prvText =
    typeof businessConfig?.cancellationPolicyText === 'string'
      ? businessConfig.cancellationPolicyText
      : null;
  const prvHours = asNumber(businessConfig?.freeCancellationHours);
  if (prvText !== null || prvHours !== null) {
    return { text: prvText, freeCancellationHours: prvHours };
  }
  return { text: null, freeCancellationHours: null };
}
