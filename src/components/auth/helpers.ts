'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { ApiClientError, apiFetch } from '@/lib/api/client';
import { t, type Dictionary } from '@/i18n';
import type { Locale } from '@/i18n/config';

/**
 * Shared helpers for the auth / account / booking client pages.
 * All user-facing copy comes from the dictionary — never from literals.
 */

/** JSON-serialized session user as returned by GET /api/v1/auth/me. */
export type AuthUser = {
  id: string;
  email: string;
  role: string;
  name: string | null;
  locale: string;
  emailVerifiedAt: string | null;
  status: string;
};

/** Fetch the current session user; anonymous visitors resolve to `null`. */
export async function fetchMe(): Promise<AuthUser | null> {
  try {
    const { data } = await apiFetch<{ user: AuthUser | null }>('/api/v1/auth/me');
    return data.user;
  } catch {
    return null;
  }
}

/** One-shot session fetch (never throws). */
export function useMe(): { user: AuthUser | null; loading: boolean } {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchMe().then((u) => {
      if (cancelled) return;
      setUser(u);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return { user, loading };
}

/** Account guard: anonymous visitors are bounced to the sign-in page. */
export function useRequireAuth(locale: Locale): {
  user: AuthUser | null;
  ready: boolean;
} {
  const router = useRouter();
  const pathname = usePathname() ?? `/${locale}/account`;
  const { user, loading } = useMe();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace(`/${locale}/login?next=${encodeURIComponent(pathname)}`);
    }
  }, [loading, user, router, locale, pathname]);

  return { user, ready: !loading && user !== null };
}

/**
 * Sign-in / registration pages: send already-authenticated visitors straight
 * to their destination (defaults to the account overview).
 */
export function useRedirectIfAuthenticated(locale: Locale, next?: string | null): void {
  const router = useRouter();
  const target = safeNextPath(next, `/${locale}/account`);
  const { user, loading } = useMe();

  useEffect(() => {
    if (loading || !user) return;
    router.replace(target);
    router.refresh();
  }, [loading, user, router, target]);
}

/**
 * Sanitize a `?next=` destination: same-origin PATH only — it must start with
 * a single "/" and must never be protocol-relative ("//x") or contain a
 * backslash. Anything else falls back to the default destination.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== 'string' || raw.length === 0) return fallback;
  if (!raw.startsWith('/')) return fallback;
  if (raw.startsWith('//') || raw.startsWith('/\\')) return fallback;
  if (raw.includes('\\') || /[\u0000-\u001f]/.test(raw)) return fallback;
  return raw;
}

/** Field-level validation errors of an ApiClientError (empty when unrelated). */
export function fieldErrors(error: unknown): Record<string, string | undefined> {
  return error instanceof ApiClientError ? error.fieldErrors() : {};
}

/**
 * Map an API failure to localized, non-enumerating copy. Pages may inspect
 * `error.code` first for endpoint-specific messages before falling back here.
 */
export function formError(error: unknown, dict: Dictionary): string {
  if (error instanceof ApiClientError) {
    switch (error.code) {
      case 'ACCOUNT_LOCKED':
        return t(dict, 'auth.accountLocked');
      case 'INVALID_PASSWORD':
        return t(dict, 'auth.invalidCredentials');
      case 'NETWORK_ERROR':
        return t(dict, 'errors.offline');
      case 'RATE_LIMITED':
        return t(dict, 'errors.rateLimited');
      case 'CSRF_REJECTED':
      case 'INTERNAL_ERROR':
        return t(dict, 'errors.serverError');
      default:
        break;
    }
    if (error.status === 401) return t(dict, 'errors.unauthorized');
    if (error.status === 403) return t(dict, 'errors.forbidden');
    if (error.status === 429) return t(dict, 'errors.rateLimited');
    return t(dict, 'common.error');
  }
  return t(dict, 'common.error');
}

/** Local date (YYYY-MM-DD) — used as the `min` of date inputs. */
export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
