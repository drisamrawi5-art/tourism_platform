"use client";

import { useLocale } from "@/components/use-locale";
import { DashboardView } from "./dashboard-view";

/**
 * Provider portal entry route (/{locale}/provider) — owner-scoped overview
 * from GET /api/v1/provider/overview + GET /api/v1/provider/business.
 */
export default function ProviderIndexPage() {
  const locale = useLocale();
  return <DashboardView locale={locale} />;
}
