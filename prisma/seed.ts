/**
 * Visit Imedwan — database seed.
 *
 * STRICT RULES (spec sections 13 & 75):
 * - Only project-provided destination facts are seeded (the five known places
 *   and the destination itself).
 * - NEVER seed fake providers, prices, coordinates, availability, reviews,
 *   bookings, amenities or historical claims.
 * - Unknown fields stay null / are not displayed.
 *
 * Operational data seeded here: settings, feature flags, RBAC matrix, and
 * (only when the ADMIN_PASSWORD env var is provided) the initial administrator.
 */
import { Prisma, PrismaClient, Role, VerificationStatus, PublicationStatus } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { ROLE_PERMISSIONS, ALL_PERMISSIONS } from "../src/lib/auth/permissions";
import { SETTING_DEFAULTS, FEATURE_FLAG_KEYS } from "../src/lib/settings";

// Load local `.env` when run outside the Next.js runtime (tsx / `prisma db
// seed`). Never overrides variables already provided by the environment.
try {
  process.loadEnvFile();
} catch {
  /* no .env present — rely on ambient environment */
}

const prisma = new PrismaClient();

type PlaceSeed = {
  slug: string;
  sortOrder: number;
  translations: Record<
    "en" | "fr" | "ar",
    { name: string; typeLabel: string; summary: string }
  >;
};

/**
 * The five destination places provided by the project specification.
 * Descriptions are exact translations of the project-provided copy —
 * nothing is expanded or embellished.
 */
const PLACES: PlaceSeed[] = [
  {
    slug: "amda",
    sortOrder: 1,
    translations: {
      en: { name: "Amda", typeLabel: "Natural water pool", summary: "Recreation and swimming." },
      fr: { name: "Amda", typeLabel: "Bassin d'eau naturel", summary: "Détente et baignade." },
      ar: { name: "أمدا", typeLabel: "بركة مائية طبيعية", summary: "استجمام وسباحة." },
    },
  },
  {
    slug: "amajr",
    sortOrder: 2,
    translations: {
      en: {
        name: "Amajr",
        typeLabel: "Waterfall",
        summary: "Waterfall / natural water feature.",
      },
      fr: {
        name: "Amajr",
        typeLabel: "Cascade",
        summary: "Cascade / formation d'eau naturelle.",
      },
      ar: { name: "أماجّْر", typeLabel: "شلال", summary: "شلال / ميزة مائية طبيعية." },
    },
  },
  {
    slug: "imi-nisli",
    sortOrder: 3,
    translations: {
      en: {
        name: "Imi Nisli",
        typeLabel: "Fields + water channels + waterfall",
        summary: "Scenic nature.",
      },
      fr: {
        name: "Imi Nisli",
        typeLabel: "Champs + canaux d'eau + cascade",
        summary: "Nature pittoresque.",
      },
      ar: {
        name: "إمي نيسلي",
        typeLabel: "حقول + قنوات ماء + شلال",
        summary: "مناظر طبيعية خلابة.",
      },
    },
  },
  {
    slug: "taghia",
    sortOrder: 4,
    translations: {
      en: { name: "Taghia", typeLabel: "Fields and orchards", summary: "Nature exploration." },
      fr: { name: "Taghia", typeLabel: "Champs et vergers", summary: "Exploration de la nature." },
      ar: { name: "تاغيا", typeLabel: "حقول وأشجار مثمرة", summary: "استكشاف الطبيعة." },
    },
  },
  {
    slug: "tizgzit",
    sortOrder: 5,
    translations: {
      en: { name: "Tizgzit", typeLabel: "Mountain fields", summary: "Recreation and exploration." },
      fr: { name: "Tizgzit", typeLabel: "Champs de montagne", summary: "Détente et exploration." },
      ar: { name: "تزگزيت", typeLabel: "حقول جبلية", summary: "استجمام واستكشاف." },
    },
  },
];

const LOCALES = ["en", "fr", "ar"] as const;

async function seedDestination() {
  const existing = await prisma.destination.findUnique({ where: { slug: "imedwan" } });
  const destination =
    existing ??
    (await prisma.destination.create({
      data: {
        slug: "imedwan",
        status: PublicationStatus.PUBLISHED,
        verificationStatus: VerificationStatus.PROJECT_PROVIDED,
        featured: true,
      },
    }));

  const translations: Record<(typeof LOCALES)[number], { name: string; slogan: string; summary: string }> = {
    en: {
      name: "Imedwan",
      slogan: "Imedwan — Where Water Meets the Mountain",
      summary:
        "Imedwan / Asghmo Ait Zaghar is a destination in the Ouarzazate region of Morocco, presented through this independent tourism platform.",
    },
    fr: {
      name: "Imedwan",
      slogan: "Imedwan — Where Water Meets the Mountain", // official FR slogan pending
      summary:
        "Imedwan / Asghmo Ait Zaghar est une destination de la région de Ouarzazate, au Maroc, présentée par cette plateforme touristique indépendante.",
    },
    ar: {
      name: "إمدوان",
      slogan: "إمدوان — حيث يلتقي الماء بالجبل",
      summary:
        "إمدوان / اسغمو أيت زغار وجهة في جهة ورزازات بالمغرب، تقدَّم عبر هذه المنصة السياحية المستقلة.",
    },
  };

  for (const locale of LOCALES) {
    await prisma.destinationTranslation.upsert({
      where: { destinationId_locale: { destinationId: destination.id, locale } },
      create: { destinationId: destination.id, locale, ...translations[locale] },
      update: translations[locale],
    });
  }
  console.log(`[seed] destination: ${destination.slug}`);
}

async function seedPlaces() {
  const destination = await prisma.destination.findUniqueOrThrow({ where: { slug: "imedwan" } });
  for (const place of PLACES) {
    const row = await prisma.place.upsert({
      where: { slug: place.slug },
      create: {
        destinationId: destination.id,
        slug: place.slug,
        status: PublicationStatus.PUBLISHED,
        verificationStatus: VerificationStatus.PROJECT_PROVIDED,
        featured: true,
        sortOrder: place.sortOrder,
        typeLabel: place.translations.en.typeLabel,
      },
      update: { typeLabel: place.translations.en.typeLabel, sortOrder: place.sortOrder },
    });

    for (const locale of LOCALES) {
      const t = place.translations[locale];
      await prisma.placeTranslation.upsert({
        where: { placeId_locale: { placeId: row.id, locale } },
        create: {
          placeId: row.id,
          locale,
          name: t.name,
          typeLabel: t.typeLabel,
          summary: t.summary,
          verificationStatus: VerificationStatus.PROJECT_PROVIDED,
        },
        update: {
          name: t.name,
          typeLabel: t.typeLabel,
          summary: t.summary,
          verificationStatus: VerificationStatus.PROJECT_PROVIDED,
        },
      });
    }
    console.log(`[seed] place: ${place.slug}`);
  }
}

async function seedSettings() {
  for (const [key, value] of Object.entries(SETTING_DEFAULTS)) {
    await prisma.setting.upsert({
      where: { key },
      create: { key, value: value === null ? Prisma.JsonNull : (value as Prisma.InputJsonValue) },
      update: {}, // never overwrite operator-configured values
    });
  }
  console.log(`[seed] settings: ${Object.keys(SETTING_DEFAULTS).length}`);
}

async function seedFeatureFlags() {
  for (const key of FEATURE_FLAG_KEYS) {
    await prisma.featureFlag.upsert({
      where: { key },
      create: { key, enabled: false },
      update: {},
    });
  }
  console.log(`[seed] feature flags: ${FEATURE_FLAG_KEYS.length}`);
}

async function seedRbac() {
  for (const [key, description] of Object.entries(ALL_PERMISSIONS)) {
    await prisma.permission.upsert({
      where: { key },
      create: { key, description },
      update: { description },
    });
  }
  const permissions = await prisma.permission.findMany({ select: { id: true, key: true } });
  const byKey = new Map(permissions.map((p) => [p.key, p.id]));

  for (const [role, keys] of Object.entries(ROLE_PERMISSIONS)) {
    for (const key of keys) {
      const permissionId = byKey.get(key);
      if (!permissionId) continue;
      await prisma.rolePermission.upsert({
        where: { role_permissionId: { role: role as Role, permissionId } },
        create: { role: role as Role, permissionId },
        update: {},
      });
    }
  }
  console.log(`[seed] rbac: ${permissions.length} permissions, ${Object.keys(ROLE_PERMISSIONS).length} roles`);
}

async function seedAdmin() {
  const email =
    process.env.ADMIN_EMAIL ??
    (process.env.NODE_ENV === "production" ? null : "admin@visitimedwan.local");
  if (!email) {
    console.log("[seed] admin: skipped (set ADMIN_EMAIL/ADMIN_PASSWORD to create)");
    return;
  }
  const password = process.env.ADMIN_PASSWORD ?? null;
  if (!password) {
    console.log("[seed] admin: skipped (set ADMIN_PASSWORD in .env to create the admin account)");
    return;
  }

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    console.log(`[seed] admin: ${email} (already exists)`);
    return;
  }

  await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(password),
      role: Role.SUPER_ADMIN,
      name: "Platform Administrator",
      locale: "en",
      emailVerifiedAt: new Date(), // operational account — verification is inherent
    },
  });
  console.log(`[seed] admin: ${email} (created with the ADMIN_PASSWORD env value)`);
}

async function main() {
  console.log("[seed] Visit Imedwan — starting");
  await seedDestination();
  await seedPlaces();
  await seedSettings();
  await seedFeatureFlags();
  await seedRbac();
  await seedAdmin();
  console.log("[seed] done");
}

main()
  .catch((err) => {
    console.error("[seed] failed:", err);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
