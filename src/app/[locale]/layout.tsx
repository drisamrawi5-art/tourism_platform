import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { direction, isLocale, locales, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { getCurrentUser } from "@/lib/auth/session";
import { SiteHeader } from "@/components/layout/site-header";
import { SiteFooter } from "@/components/layout/site-footer";
import "../globals.css";

/**
 * Root layout (locale-first routing — there is intentionally no app/layout.tsx:
 * every page lives under /{en|fr|ar}).
 *
 * - `lang`/`dir` switch per locale (Arabic → RTL, logical properties mirror).
 * - Unknown locale prefixes redirect home; the middleware then resolves the
 *   visitor's locale, so no route ever crashes on a bad segment.
 * - Session lookup here makes public pages dynamic (header is auth-aware).
 */

export function generateStaticParams() {
  return locales.map((locale) => ({ locale }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const l: Locale = isLocale(locale) ? locale : "en";
  const dict = getDictionary(l);

  return {
    title: {
      default: `${dict.brand.name} — ${dict.brand.destinationName}`,
      template: `%s · ${dict.brand.name}`,
    },
    description: dict.brand.slogan,
    applicationName: dict.brand.name,
    alternates: {
      languages: Object.fromEntries(locales.map((code) => [code, `/${code}`])),
    },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fbfaf7",
};

export default async function RootLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) redirect("/");

  const dict = getDictionary(locale);
  const user = await getCurrentUser();

  return (
    <html lang={locale} dir={direction(locale)}>
      <body className="flex min-h-screen flex-col bg-paper text-ink antialiased">
        <a href="#main" className="skip-link">
          {dict.common.skipToContent}
        </a>
        <SiteHeader
          locale={locale}
          dict={dict}
          user={
            user ? { name: user.name, role: user.role, email: user.email } : null
          }
        />
        <main id="main" className="flex-1">
          {children}
        </main>
        <SiteFooter locale={locale} dict={dict} />
      </body>
    </html>
  );
}
