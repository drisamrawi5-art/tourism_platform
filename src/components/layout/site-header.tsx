'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { Locale } from '@/i18n/config';
import type { Dictionary } from '@/i18n';
import { cn } from '@/lib/cn';
import { Button, ButtonLink, Spinner } from '@/components/ui/button';
import { Logo } from '@/components/layout/logo';
import { LanguageSwitcher } from '@/components/layout/language-switcher';

type HeaderUser = {
  name: string | null;
  email: string;
  role: 'CUSTOMER' | 'BUSINESS_OWNER' | 'GUIDE' | 'CONTENT_MANAGER' | 'ADMIN' | 'SUPER_ADMIN';
};

const NAV_ITEMS = [
  { key: 'discover', href: '/discover' },
  { key: 'places', href: '/places' },
  { key: 'stay', href: '/stay' },
  { key: 'guides', href: '/guides' },
  { key: 'plan', href: '/plan' },
  { key: 'gallery', href: '/gallery' },
  { key: 'journal', href: '/journal' },
] as const;

const PROVIDER_ROLES: ReadonlySet<string> = new Set(['BUSINESS_OWNER', 'GUIDE']);
const ADMIN_ROLES: ReadonlySet<string> = new Set(['ADMIN', 'SUPER_ADMIN', 'CONTENT_MANAGER']);

/**
 * Sticky public-site header. Server layout passes the session summary + the
 * dictionary so this stays a pure client shell (no data fetching).
 */
export function SiteHeader({
  locale,
  dict,
  user,
}: {
  locale: Locale;
  dict: Dictionary;
  user: HeaderUser | null;
}) {
  const pathname = usePathname() ?? '/';
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  const base = `/${locale}`;

  // Close overlays on navigation.
  useEffect(() => {
    setMobileOpen(false);
    setAccountOpen(false);
  }, [pathname]);

  // Close account menu on outside click / Escape.
  useEffect(() => {
    if (!accountOpen) return;
    function onDocClick(event: MouseEvent) {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    }
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setAccountOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [accountOpen]);

  // Close the mobile menu on Escape.
  useEffect(() => {
    if (!mobileOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') setMobileOpen(false);
    }
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [mobileOpen]);

  // Close the mobile menu (and release the scroll lock) once the viewport
  // reaches the desktop nav breakpoint.
  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1280px)');
    function onChange(event: MediaQueryListEvent) {
      if (event.matches) setMobileOpen(false);
    }
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Lock background scroll while the mobile menu is open.
  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  async function signOut() {
    setSigningOut(true);
    try {
      await fetch('/api/v1/auth/logout', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{}',
      });
    } catch {
      // Network failure still clears local state below.
    } finally {
      setSigningOut(false);
      setAccountOpen(false);
      router.push(base);
      router.refresh();
    }
  }

  const isActive = (href: string) =>
    pathname === `${base}${href}` || pathname.startsWith(`${base}${href}/`);

  const dashboardHref = user
    ? PROVIDER_ROLES.has(user.role)
      ? `${base}/provider`
      : ADMIN_ROLES.has(user.role)
        ? `${base}/admin`
        : `${base}/account`
    : null;

  const displayName = user?.name?.split(' ')[0] ?? null;

  return (
    <header className="sticky top-0 z-40 border-b border-rocky-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between gap-3 px-4 sm:px-6 lg:px-8 xl:max-w-7xl">
        {/* Brand + primary nav */}
        <div className="flex min-w-0 items-center gap-4">
          <Link href={base} aria-label={dict.brand.name} className="shrink-0 rounded-lg">
            <Logo />
          </Link>

          <nav
            aria-label={dict.nav.menu}
            className="hidden min-w-0 items-center gap-0.5 overflow-hidden xl:flex"
          >
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={`${base}${item.href}`}
                aria-current={isActive(item.href) ? 'page' : undefined}
                className={cn(
                  'shrink-0 whitespace-nowrap rounded-lg px-2 py-2 text-sm font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-forest-50 text-forest-800'
                    : 'text-rocky-700 hover:bg-rocky-100 hover:text-rocky-900',
                )}
              >
                {dict.nav[item.key]}
              </Link>
            ))}
          </nav>
        </div>

        {/* Actions — fixed-size group, never squeezed by the nav */}
        <div className="flex shrink-0 items-center gap-1.5 sm:gap-2">
          <Link
            href={`${base}/search`}
            aria-label={dict.common.search}
            className="hidden size-9 shrink-0 items-center justify-center rounded-lg text-rocky-600 transition-colors hover:bg-rocky-100 hover:text-rocky-900 sm:inline-flex"
          >
            <SearchIcon />
          </Link>

          <LanguageSwitcher
            locale={locale}
            label={dict.nav.switchLanguage}
            className="hidden md:block"
          />

          {!user ? (
            <>
              <ButtonLink
                href={`${base}/login`}
                variant="secondary"
                size="sm"
                className="hidden md:inline-flex"
              >
                {dict.nav.signIn}
              </ButtonLink>
              <ButtonLink
                href={`${base}/register`}
                variant="primary"
                size="sm"
                className="hidden md:inline-flex"
              >
                {dict.nav.register}
              </ButtonLink>
            </>
          ) : (
            <div ref={accountRef} className="relative hidden sm:block">
              <button
                type="button"
                onClick={() => {
                  setMobileOpen(false);
                  setAccountOpen((v) => !v);
                }}
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                className="inline-flex h-9 shrink-0 items-center gap-2 rounded-lg border border-rocky-300 bg-white ps-1.5 pe-2.5 text-sm font-medium text-rocky-700 transition-colors hover:border-forest-600 hover:text-forest-800"
              >
                <span className="inline-flex size-6 items-center justify-center rounded-full bg-forest-100 text-xs font-semibold uppercase text-forest-800">
                  {(displayName ?? user.email).charAt(0)}
                </span>
                <span className="hidden max-w-24 truncate md:inline">
                  {displayName ?? dict.nav.account}
                </span>
              </button>

              {accountOpen ? (
                <div
                  role="menu"
                  className="absolute end-0 top-full z-50 mt-1.5 w-56 overflow-hidden rounded-lg border border-rocky-200 bg-white py-1 shadow-lg"
                >
                  <div className="border-b border-rocky-100 px-3 py-2">
                    <p className="truncate text-sm font-medium text-rocky-900">
                      {user.name ?? user.email}
                    </p>
                  </div>
                  <MenuLink href={`${base}/account`}>{dict.nav.account}</MenuLink>
                  <MenuLink href={`${base}/account/bookings`}>{dict.nav.myBookings}</MenuLink>
                  <MenuLink href={`${base}/account/wishlist`}>{dict.nav.wishlist}</MenuLink>
                  {dashboardHref && !ADMIN_ROLES.has(user.role) ? (
                    <MenuLink href={dashboardHref}>{dict.nav.providerDashboard}</MenuLink>
                  ) : null}
                  {dashboardHref && ADMIN_ROLES.has(user.role) ? (
                    <MenuLink href={dashboardHref}>{dict.nav.adminDashboard}</MenuLink>
                  ) : null}
                  <button
                    type="button"
                    onClick={signOut}
                    disabled={signingOut}
                    role="menuitem"
                    className="flex w-full items-center gap-2 px-3 py-2 text-sm text-danger-600 transition-colors hover:bg-danger-50 disabled:opacity-60"
                  >
                    {signingOut ? <Spinner className="size-4" /> : null}
                    {dict.nav.signOut}
                  </button>
                </div>
              ) : null}
            </div>
          )}

          <ButtonLink
            href={`${base}/stay`}
            variant="accent"
            size="sm"
            className="hidden shrink-0 md:inline-flex"
          >
            {dict.nav.bookNow}
          </ButtonLink>

          {/* Mobile menu toggle */}
          <button
            type="button"
            onClick={() => {
              setAccountOpen(false);
              setMobileOpen((v) => !v);
            }}
            aria-expanded={mobileOpen}
            aria-controls="mobile-menu"
            aria-label={mobileOpen ? dict.nav.closeMenu : dict.nav.menu}
            className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-rocky-700 transition-colors hover:bg-rocky-100 xl:hidden"
          >
            {mobileOpen ? <CloseIcon /> : <MenuIcon />}
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen ? (
        <div
          id="mobile-menu"
          className="absolute inset-x-0 top-full z-50 max-h-[calc(100dvh-4rem)] overflow-y-auto overscroll-contain border-b border-rocky-200 bg-white px-4 pb-6 pt-2 shadow-lg sm:px-6 xl:hidden"
        >
          <nav aria-label={dict.nav.menu} className="flex flex-col gap-1 py-2">
            {NAV_ITEMS.map((item) => (
              <Link
                key={item.key}
                href={`${base}${item.href}`}
                aria-current={isActive(item.href) ? 'page' : undefined}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  'rounded-lg px-3 py-2.5 text-base font-medium transition-colors',
                  isActive(item.href)
                    ? 'bg-forest-50 text-forest-800'
                    : 'text-rocky-800 hover:bg-rocky-100',
                )}
              >
                {dict.nav[item.key]}
              </Link>
            ))}
          </nav>

          <div className="mt-2 space-y-2 border-t border-rocky-200 pt-4">
            <div className="flex flex-wrap items-center gap-2">
              <LanguageSwitcher
                locale={locale}
                label={dict.nav.switchLanguage}
                align="start"
                className="md:hidden"
              />
              <ButtonLink
                href={`${base}/search`}
                variant="secondary"
                size="sm"
                className="sm:hidden"
              >
                {dict.common.search}
              </ButtonLink>
              <ButtonLink
                href={`${base}/stay`}
                variant="accent"
                size="sm"
                className="md:hidden"
              >
                {dict.nav.bookNow}
              </ButtonLink>
            </div>

            {!user ? (
              <div className="flex flex-col gap-2 pt-1">
                <ButtonLink
                  href={`${base}/login`}
                  variant="secondary"
                  size="md"
                  className="md:hidden"
                >
                  {dict.nav.signIn}
                </ButtonLink>
                <ButtonLink
                  href={`${base}/register`}
                  variant="primary"
                  size="md"
                  className="md:hidden"
                >
                  {dict.nav.register}
                </ButtonLink>
              </div>
            ) : (
              <div className="flex flex-col gap-2 pt-1 sm:hidden">
                <ButtonLink href={`${base}/account`} variant="secondary" size="md">
                  {dict.nav.account}
                </ButtonLink>
                {dashboardHref ? (
                  <ButtonLink href={dashboardHref} variant="primary" size="md">
                    {PROVIDER_ROLES.has(user.role)
                      ? dict.nav.providerDashboard
                      : dict.nav.adminDashboard}
                  </ButtonLink>
                ) : null}
                <Button
                  variant="ghost"
                  size="md"
                  onClick={signOut}
                  loading={signingOut}
                  className="justify-start text-danger-600 hover:bg-danger-50"
                >
                  {dict.nav.signOut}
                </Button>
              </div>
            )}
          </div>
        </div>
      ) : null}
    </header>
  );
}

function MenuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      role="menuitem"
      className="block px-3 py-2 text-sm text-rocky-700 transition-colors hover:bg-rocky-50 hover:text-rocky-900"
    >
      {children}
    </Link>
  );
}

function MenuIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
    </svg>
  );
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      className="size-5"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.6-3.6" strokeLinecap="round" />
    </svg>
  );
}
