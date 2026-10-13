"use client";

import { useLocale } from "@/components/use-locale";
import { AdminOverviewView } from "./overview-view";

/**
 * Admin entry route (/{locale}/admin) — real platform metrics from
 * GET /api/v1/admin/overview + GET /api/v1/admin/analytics.
 * The layout handles auth; the view enforces `analytics.read`.
 */
export default function AdminIndexPage() {
  const locale = useLocale();
  return <AdminOverviewView locale={locale} />;
}
