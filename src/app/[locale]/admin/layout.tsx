"use client";

import Link from "next/link";
import { notFound, useParams, usePathname } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary, t } from "@/i18n";
import { Container } from "@/components/ui/card";
import { useRequireAuth } from "@/components/auth/helpers";

type AdminTab = { href: string; label: string; exact?: boolean };

/**
 * Grouped admin navigation. Ungrouped entries render as plain tabs; grouped
 * ones get a small non-clickable label so 14 sections stay scannable.
 * Content managers only see the CONTENT_TABS subset (homepage is
 * admin-only by design).
 */
const ADMIN_TAB_GROUPS: Array<{ labelKey?: string; tabs: AdminTab[] }> = [
  { tabs: [{ href: "admin", label: "admin.dashboard", exact: true }] },
  {
    labelKey: "admin.navGroup.content",
    tabs: [
      { href: "admin/homepage", label: "admin.homepage.tab" },
      { href: "admin/places", label: "admin.places" },
      { href: "admin/content", label: "admin.content" },
      { href: "admin/media", label: "admin.media" },
    ],
  },
  {
    labelKey: "admin.navGroup.operations",
    tabs: [
      { href: "admin/businesses", label: "admin.businesses" },
      { href: "admin/bookings", label: "admin.bookings" },
      { href: "admin/payments", label: "admin.payments" },
      { href: "admin/approvals", label: "admin.approvals" },
      { href: "admin/reviews", label: "admin.reviews" },
      { href: "admin/users", label: "admin.users" },
    ],
  },
  {
    labelKey: "admin.navGroup.insights",
    tabs: [
      { href: "admin/analytics", label: "admin.analytics" },
      { href: "admin/audit", label: "admin.auditLogs" },
    ],
  },
  { tabs: [{ href: "admin/settings", label: "admin.settings" }] },
];

const CONTENT_TABS = new Set(["admin/content", "admin/places", "admin/media"]);

/**
 * Admin shell: compact header + grouped section tabs. Role gating is UX only
 * — every API enforces permissions server-side. Content renders only once
 * the session resolves (`ready`), so a signed-in admin never sees the
 * access-denied flash while /me is still in flight; anonymous visitors are
 * bounced to the login page by useRequireAuth.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ locale?: string }>();
  const rawLocale = params?.locale;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const dict = getDictionary(locale);
  const pathname = usePathname() ?? `/${locale}/admin`;
  const { user, ready } = useRequireAuth(locale);

  if (!isLocale(rawLocale)) notFound();

  const isAdmin = user?.role === "ADMIN" || user?.role === "SUPER_ADMIN";
  const isContentManager = user?.role === "CONTENT_MANAGER";
  const allowed = isAdmin || isContentManager;

  const groups = ADMIN_TAB_GROUPS.map((group) => ({
    ...group,
    tabs: group.tabs.filter((tab) => {
      if (isAdmin) return true;
      if (isContentManager) return CONTENT_TABS.has(tab.href);
      return false;
    }),
  })).filter((group) => group.tabs.length > 0);

  return (
    <div className="border-b border-rocky-200 bg-rocky-50">
      <Container className="py-6 sm:py-8">
        <h1 className="font-display text-2xl font-semibold text-rocky-900 sm:text-3xl">
          {t(dict, "admin.title")}
        </h1>
        <nav
          aria-label={t(dict, "admin.title")}
          className="mt-4 flex items-stretch gap-1 overflow-x-auto border-b border-rocky-200"
        >
          {groups.map((group, gi) => (
            <div key={group.labelKey ?? `g${gi}`} className="flex items-stretch gap-1">
              {gi > 0 ? (
                <span aria-hidden="true" className="mx-1 w-px self-center bg-rocky-200" />
              ) : null}
              {group.labelKey ? (
                <span className="self-center whitespace-nowrap px-1 text-[11px] font-semibold uppercase tracking-wide text-rocky-400">
                  {t(dict, group.labelKey)}
                </span>
              ) : null}
              {group.tabs.map((tab) => {
                const active = tab.exact
                  ? pathname === `/${locale}/${tab.href}`
                  : pathname === `/${locale}/${tab.href}` ||
                    pathname.startsWith(`/${locale}/${tab.href}/`);
                return (
                  <Link
                    key={tab.href}
                    href={`/${locale}/${tab.href}`}
                    aria-current={active ? "page" : undefined}
                    className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium transition-colors ${
                      active
                        ? "border-forest-600 text-forest-800"
                        : "border-transparent text-rocky-600 hover:border-rocky-300 hover:text-rocky-800"
                    }`}
                  >
                    {t(dict, tab.label)}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="py-6">
          {!ready ? (
            <div className="skeleton h-48 w-full" aria-busy="true" />
          ) : allowed ? (
            children
          ) : (
            <div className="rounded-lg border border-peach-200 bg-peach-50 px-4 py-3 text-sm text-peach-800">
              {t(dict, "admin.accessDenied")}
            </div>
          )}
        </div>
      </Container>
    </div>
  );
}
