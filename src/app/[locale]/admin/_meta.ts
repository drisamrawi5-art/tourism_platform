import type { Metadata } from "next";
import { getDictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";

/**
 * Metadata for admin pages — always no-index (portal, never public).
 */
export function adminMetadata(locale: Locale, title: string): Metadata {
  const dict = getDictionary(locale);
  return {
    title: `${title} · ${dict.admin.title}`,
    robots: { index: false, follow: false },
  };
}
