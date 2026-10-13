import type { MetadataRoute } from "next";

/**
 * Robots.txt — allow all, point to sitemap.
 * Admin and account areas are noindex'd at the page level.
 */
export default function robots(): MetadataRoute.Robots {
  const baseUrl = process.env.APP_URL ?? "http://localhost:3000";

  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/admin/", "/account/", "/provider/"],
    },
    sitemap: `${baseUrl}/sitemap.xml`,
  };
}
