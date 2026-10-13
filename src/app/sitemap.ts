import type { MetadataRoute } from "next";
import { db } from "@/lib/db";

/**
 * Sitemap — only published, indexable content.
 * Generated at request time from real database state.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  const [places, content, accommodations, guides] = await Promise.all([
    db.place.findMany({
      where: { status: "PUBLISHED", noIndex: false },
      select: { slug: true, updatedAt: true },
    }),
    db.content.findMany({
      where: { status: "PUBLISHED", noIndex: false },
      select: { slug: true, kind: true, updatedAt: true },
    }),
    db.business.findMany({
      where: { status: "PUBLISHED", type: "ACCOMMODATION" },
      select: { slug: true, updatedAt: true },
    }),
    db.business.findMany({
      where: { status: "PUBLISHED", type: "GUIDE" },
      select: { slug: true, updatedAt: true },
    }),
  ]);

  const staticRoutes: MetadataRoute.Sitemap = [
    { url: baseUrl, changeFrequency: "weekly", priority: 1 },
    { url: `${baseUrl}/discover`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/places`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/stay`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/guides`, changeFrequency: "weekly", priority: 0.8 },
    { url: `${baseUrl}/plan`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${baseUrl}/gallery`, changeFrequency: "monthly", priority: 0.5 },
    { url: `${baseUrl}/journal`, changeFrequency: "weekly", priority: 0.6 },
    { url: `${baseUrl}/search`, changeFrequency: "monthly", priority: 0.4 },
  ];

  const placeRoutes: MetadataRoute.Sitemap = places.map((p) => ({
    url: `${baseUrl}/places/${p.slug}`,
    lastModified: p.updatedAt,
    changeFrequency: "monthly",
    priority: 0.7,
  }));

  const contentRoutes: MetadataRoute.Sitemap = content.map((c) => ({
    url: `${baseUrl}/journal/${c.slug}`,
    lastModified: c.updatedAt,
    changeFrequency: "monthly",
    priority: 0.5,
  }));

  const accommodationRoutes: MetadataRoute.Sitemap = accommodations.map((a) => ({
    url: `${baseUrl}/stay/${a.slug}`,
    lastModified: a.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  const guideRoutes: MetadataRoute.Sitemap = guides.map((g) => ({
    url: `${baseUrl}/guides/${g.slug}`,
    lastModified: g.updatedAt,
    changeFrequency: "weekly",
    priority: 0.7,
  }));

  return [...staticRoutes, ...placeRoutes, ...contentRoutes, ...accommodationRoutes, ...guideRoutes];
}
