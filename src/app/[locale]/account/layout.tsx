"use client";

import Link from "next/link";
import { notFound, useParams, usePathname } from "next/navigation";
import { isLocale, type Locale } from "@/i18n/config";
import { getDictionary, t } from "@/i18n";
import { Container } from "@/components/ui/card";
import { useRequireAuth } from "@/components/auth/helpers";

/**
 * Signed-in account shell: a compact hero header plus section tabs.
 * The active tab follows the pathname so deep links highlight correctly.
 */
export default function AccountLayout({ children }: { children: React.ReactNode }) {
  const params = useParams<{ locale?: string }>();
  const rawLocale = params?.locale;
  const locale: Locale = isLocale(rawLocale) ? rawLocale : "en";
  const dict = getDictionary(locale);
  const pathname = usePathname() ?? `/${locale}/account`;
  useRequireAuth(locale);

  if (!isLocale(rawLocale)) notFound();

  const tabs = [
    { href: `/${locale}/account`, label: t(dict, "account.title"), exact: true },
    { href: `/${locale}/account/bookings`, label: t(dict, "account.bookings") },
    { href: `/${locale}/account/wishlist`, label: t(dict, "account.wishlist") },
    { href: `/${locale}/account/profile`, label: t(dict, "account.profile") },
  ];

  return (
    <div className="border-b border-rocky-200 bg-gradient-to-b from-forest-50 via-water-50/50 to-transparent">
      <Container className="py-8 sm:py-10">
        <h1 className="font-display text-2xl font-semibold text-rocky-900 sm:text-3xl">
          {t(dict, "nav.account")}
        </h1>
        <nav
          aria-label={t(dict, "nav.account")}
          className="mt-5 flex gap-1 overflow-x-auto border-b border-rocky-200"
        >
          {tabs.map((tab) => {
            const active = tab.exact
              ? pathname === tab.href
              : pathname === tab.href || pathname.startsWith(`${tab.href}/`);
            return (
              <Link
                key={tab.href}
                href={tab.href}
                aria-current={active ? "page" : undefined}
                className={`-mb-px whitespace-nowrap border-b-2 px-4 py-2.5 text-sm font-medium transition-colors ${
                  active
                    ? "border-forest-600 text-forest-800"
                    : "border-transparent text-rocky-600 hover:border-rocky-300 hover:text-rocky-800"
                }`}
              >
                {tab.label}
              </Link>
            );
          })}
        </nav>
        <div className="py-8">{children}</div>
      </Container>
    </div>
  );
}
