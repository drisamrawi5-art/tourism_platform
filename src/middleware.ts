import { NextRequest, NextResponse } from 'next/server';

/**
 * Locale-first URL routing:
 *
 * - /            → redirect to the visitor's locale (/en, /fr or /ar)
 * - /anything     → redirect to /{locale}/anything (unknown prefixes included)
 * - /{locale}/... → pass through and remember the choice in a cookie
 *
 * API routes, Next internals and files with extensions are excluded.
 * No locale detection ever invents content — the cookie/`Accept-Language`
 * choice only decides which of the three official locales to prepend.
 */

const LOCALES = ['en', 'fr', 'ar'] as const;
const DEFAULT_LOCALE = 'en';
const LOCALE_COOKIE = 'vi_locale';

function localeFromCookie(req: NextRequest): string | null {
  const value = req.cookies.get(LOCALE_COOKIE)?.value;
  return value && (LOCALES as readonly string[]).includes(value) ? value : null;
}

function localeFromAcceptLanguage(header: string | null): string | null {
  if (!header) return null;
  const candidates = header
    .split(',')
    .map((part) => {
      const [tag, ...params] = part.trim().split(';');
      const qParam = params.find((p) => p.trim().startsWith('q='));
      const q = qParam ? Number.parseFloat(qParam.trim().slice(2)) : 1;
      return { tag: (tag ?? '').trim().toLowerCase(), q: Number.isFinite(q) ? q : 0 };
    })
    .filter((c) => c.tag.length > 0)
    .sort((a, b) => b.q - a.q);

  for (const { tag } of candidates) {
    const base = tag.split('-')[0];
    if (base && (LOCALES as readonly string[]).includes(base)) return base;
  }
  return null;
}

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const first = pathname.split('/')[1] ?? '';

  if ((LOCALES as readonly string[]).includes(first)) {
    // Valid locale prefix: pass through, remember the preference.
    if (req.cookies.get(LOCALE_COOKIE)?.value === first) return NextResponse.next();
    const res = NextResponse.next();
    res.cookies.set(LOCALE_COOKIE, first, {
      path: '/',
      maxAge: 60 * 60 * 24 * 365,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
    });
    return res;
  }

  const locale =
    localeFromCookie(req) ??
    localeFromAcceptLanguage(req.headers.get('accept-language')) ??
    DEFAULT_LOCALE;

  const url = req.nextUrl.clone();
  url.pathname = pathname === '/' ? `/${locale}` : `/${locale}${pathname}`;
  return NextResponse.redirect(url);
}

export const config = {
  // Everything except API routes, Next internals and extension-bearing files.
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
};
