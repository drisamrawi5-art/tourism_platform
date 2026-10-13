import { createHash, randomBytes } from 'node:crypto';
import type { Role, UserStatus } from '@prisma/client';
import { cookies } from 'next/headers';
import { env } from '@/lib/env';
import { db } from '@/lib/db';

/**
 * Opaque, database-backed session management.
 *
 * - Cookie value = 256-bit random token; only its SHA-256 hash is stored.
 * - HttpOnly + SameSite=Lax (+ Secure in production) cookies.
 * - Sliding expiry with server-side revocation (logout, admin suspend).
 * - CSRF: SameSite=Lax plus strict Origin checks on mutating API routes
 *   (src/lib/api/handler.ts).
 */

const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000;

export type SessionUser = {
  id: string;
  email: string;
  role: Role;
  name: string | null;
  locale: string;
  emailVerifiedAt: Date | null;
  status: UserStatus;
};

export type ActiveSession = {
  id: string;
  userId: string;
  expiresAt: Date;
  user: SessionUser;
};

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export async function cookieStore() {
  return cookies();
}

async function setSessionCookie(token: string, expiresAt: Date) {
  const jar = await cookies();
  jar.set(env.sessionCookieName, token, {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
    expires: expiresAt,
  });
}

async function clearSessionCookie() {
  const jar = await cookies();
  jar.set(env.sessionCookieName, '', {
    httpOnly: true,
    secure: env.isProd,
    sameSite: 'lax',
    path: '/',
    expires: new Date(0),
  });
}

function toSessionUser(user: {
  id: string;
  email: string;
  role: Role;
  name: string | null;
  locale: string;
  emailVerifiedAt: Date | null;
  status: UserStatus;
}): SessionUser {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    name: user.name,
    locale: user.locale,
    emailVerifiedAt: user.emailVerifiedAt,
    status: user.status,
  };
}

/** Create a session for a user and set the session cookie. */
export async function createSession(
  userId: string,
  meta: { ip?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  const token = randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + env.sessionTtlHours * 3600 * 1000);

  await db.session.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      expiresAt,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ? meta.userAgent.slice(0, 300) : null,
    },
  });

  await setSessionCookie(token, expiresAt);
}

/** Resolve the current session from the request cookie (null when absent). */
export async function getSession(): Promise<ActiveSession | null> {
  const jar = await cookies();
  const token = jar.get(env.sessionCookieName)?.value;
  if (!token) return null;

  const session = await db.session.findUnique({
    where: { tokenHash: hashToken(token) },
    include: {
      user: {
        select: {
          id: true,
          email: true,
          role: true,
          name: true,
          locale: true,
          emailVerifiedAt: true,
          status: true,
          deletedAt: true,
        },
      },
    },
  });

  if (!session || session.revokedAt || session.expiresAt.getTime() < Date.now()) return null;
  if (session.user.status !== 'ACTIVE' || session.user.deletedAt !== null) return null;

  // Sliding last-seen updates (throttled to avoid a write per request).
  if (Date.now() - session.lastSeenAt.getTime() > LAST_SEEN_THROTTLE_MS) {
    void db.session
      .update({ where: { id: session.id }, data: { lastSeenAt: new Date() } })
      .catch(() => undefined);
  }

  return {
    id: session.id,
    userId: session.userId,
    expiresAt: session.expiresAt,
    user: toSessionUser(session.user),
  };
}

/** Current session user or null (safe in server components and handlers). */
export async function getCurrentUser(): Promise<SessionUser | null> {
  const session = await getSession();
  return session?.user ?? null;
}

/** Revoke the current session and clear the cookie (logout). */
export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(env.sessionCookieName)?.value;
  if (token) {
    await db.session
      .updateMany({
        where: { tokenHash: hashToken(token), revokedAt: null },
        data: { revokedAt: new Date() },
      })
      .catch(() => undefined);
  }
  await clearSessionCookie();
}

/** Revoke ALL sessions for a user (password reset / account compromise). */
export async function revokeAllSessions(userId: string): Promise<void> {
  await db.session.updateMany({
    where: { userId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}

/** Housekeeping: delete expired sessions (called by scheduled jobs). */
export async function purgeExpiredSessions(): Promise<number> {
  const res = await db.session.deleteMany({
    where: { expiresAt: { lt: new Date() } },
  });
  return res.count;
}
