"use client";

import { useParams } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";

/**
 * Resolve the active `[locale]` segment inside client components.
 * Pages must not receive `locale` as a prop (App Router only passes
 * `params`/`searchParams`), so client pages read it here instead.
 */
export function useLocale(): Locale {
  const params = useParams<{ locale?: string }>();
  return isLocale(params?.locale) ? params.locale : "en";
}
