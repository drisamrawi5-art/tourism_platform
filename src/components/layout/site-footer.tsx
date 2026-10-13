import Link from 'next/link';
import type { Locale } from '@/i18n/config';
import { localeNames, locales, slogans } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import { Monogram } from '@/components/layout/logo';
import { Container } from '@/components/ui/card';

/**
 * Public-site footer. Static information architecture; every destination fact
 * lives in the CMS, never here. Legal documents render from /legal/*.
 */
export function SiteFooter({ locale, dict }: { locale: Locale; dict: Dictionary }) {
  const base = `/${locale}`;
  const year = new Date().getFullYear();

  const explore = [
    { href: `${base}/discover`, label: dict.nav.discover },
    { href: `${base}/places`, label: dict.nav.places },
    { href: `${base}/stay`, label: dict.nav.stay },
    { href: `${base}/guides`, label: dict.nav.guides },
    { href: `${base}/plan`, label: dict.nav.plan },
    { href: `${base}/gallery`, label: dict.nav.gallery },
    { href: `${base}/journal`, label: dict.nav.journal },
  ];

  const legal = [
    { href: `${base}/legal/terms`, label: dict.footer.terms },
    { href: `${base}/legal/privacy`, label: dict.footer.privacy },
    { href: `${base}/legal/booking-terms`, label: dict.footer.bookingTerms },
    { href: `${base}/legal/cancellation`, label: dict.footer.cancellation },
    { href: `${base}/legal/provider-terms`, label: dict.footer.providerTerms },
    { href: `${base}/legal/cookies`, label: dict.footer.cookies },
  ];

  return (
    <footer className="mt-auto border-t border-rocky-200 bg-white">
      <Container className="py-10 sm:py-14">
        <div className="grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
          {/* Brand */}
          <div className="lg:col-span-1">
            <div className="flex items-center gap-2.5">
              <Monogram className="size-8" title="Visit Imedwan" />
              <span className="font-display text-lg font-semibold text-forest-800">
                Visit Imedwan
              </span>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-rocky-600">{dict.footer.aboutBody}</p>
            <p className="mt-3 text-xs text-rocky-500">{dict.brand.tagline}</p>
            <p className="mt-1 text-xs italic text-rocky-500">{slogans[locale]}</p>
          </div>

          {/* Explore */}
          <nav aria-label={dict.footer.explore}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-rocky-800">
              {dict.footer.explore}
            </h3>
            <ul className="mt-3 space-y-2">
              {explore.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-rocky-600 transition-colors hover:text-forest-700"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Providers */}
          <nav aria-label={dict.footer.providers}>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-rocky-800">
              {dict.footer.providers}
            </h3>
            <ul className="mt-3 space-y-2">
              <li>
                <Link
                  href={`${base}/register?role=provider`}
                  className="text-sm text-rocky-600 transition-colors hover:text-forest-700"
                >
                  {dict.footer.becomeProvider}
                </Link>
              </li>
              <li>
                <Link
                  href={`${base}/login?next=provider`}
                  className="text-sm text-rocky-600 transition-colors hover:text-forest-700"
                >
                  {dict.footer.providerLogin}
                </Link>
              </li>
            </ul>
            <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-rocky-800">
              {dict.footer.legal}
            </h3>
            <ul className="mt-3 space-y-2">
              {legal.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-rocky-600 transition-colors hover:text-forest-700"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Language */}
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-wide text-rocky-800">
              {dict.footer.language}
            </h3>
            <ul className="mt-3 space-y-2">
              {locales.map((code) => (
                <li key={code}>
                  <Link
                    href={`/${code}`}
                    lang={code}
                    hrefLang={code}
                    className={
                      code === locale
                        ? 'text-sm font-semibold text-forest-700'
                        : 'text-sm text-rocky-600 transition-colors hover:text-forest-700'
                    }
                    aria-current={code === locale ? 'true' : undefined}
                  >
                    {localeNames[code]}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mt-6 text-xs leading-relaxed text-rocky-500">{dict.footer.disclaimer}</p>
          </div>
        </div>

        <div className="mt-10 flex flex-col gap-2 border-t border-rocky-200 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-rocky-500">
            © {year} Visit Imedwan. {dict.footer.rights}
          </p>
          <p className="text-xs text-rocky-400">
            {dict.brand.destinationName} · {dict.brand.tagline}
          </p>
        </div>
      </Container>
    </footer>
  );
}
