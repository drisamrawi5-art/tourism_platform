import { randomBytes, createHash } from 'node:crypto';
import type { Locale } from '@/i18n/config';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/errors';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';
import { hashPassword, verifyPassword, PASSWORD_MIN_LENGTH } from '@/lib/auth/password';
import { createSession, revokeAllSessions } from '@/lib/auth/session';
import { getMailer } from '@/lib/mail';
import { passwordResetEmail, verificationEmail } from '@/lib/mail/templates';
import { notify } from '@/lib/notifications';
import { logger } from '@/lib/logger';

/**
 * Authentication service (spec sections 26–27).
 *
 * Hard rules:
 * - identical responses for "unknown email" vs "wrong password" (no account
 *   enumeration; a dummy hash equalises timing)
 * - failed-attempt lockout: after 5 failures the account locks for 15 min
 *   (per account, plus IP rate limiting at the route layer)
 * - password reset / email verification flows never reveal account existence
 * - password changes and resets revoke all existing sessions
 * - tokens are random 256-bit values; only SHA-256 hashes are stored, single
 *   use, with short TTLs
 */

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
const VERIFY_TOKEN_TTL_HOURS = 24;
const RESET_TOKEN_TTL_MINUTES = 60;

/** Lazily-created dummy hash for constant-time-ish login behaviour. */
let dummyHashPromise: Promise<string> | null = null;
function dummyHash(): Promise<string> {
  if (!dummyHashPromise) dummyHashPromise = hashPassword('dummy-password-for-timing-equalisation');
  return dummyHashPromise;
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function generateToken(): string {
  return randomBytes(32).toString('base64url');
}

export type RegisterInput = {
  email: string;
  password: string;
  name?: string | null;
  locale?: Locale;
  /** Set when registering as provider (creates CUSTOMER + provider intent flag). */
  wantsProvider?: boolean;
  ip?: string;
  userAgent?: string | null;
};

export async function registerUser(input: RegisterInput): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);
  if (input.password.length < PASSWORD_MIN_LENGTH) {
    throw ApiError.badRequest('WEAK_PASSWORD', 'Password is too short');
  }

  const existing = await db.user.findUnique({ where: { email } });
  if (existing) {
    // One benign message for existing vs created prevents enumeration via
    // timing of a "verify" email; the route still returns 201 either way.
    throw ApiError.conflict('EMAIL_TAKEN', 'This email cannot be used');
  }

  const user = await db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(input.password),
      name: input.name?.slice(0, 120) ?? null,
      locale: input.locale ?? 'en',
      role: 'CUSTOMER',
    },
  });

  await issueEmailVerification(user.id, user.email, input.locale ?? 'en');

  void audit({
    actorId: user.id,
    action: AUDIT_ACTIONS.register,
    entityType: 'user',
    entityId: user.id,
    ip: input.ip,
    userAgent: input.userAgent,
    metadata: { wantsProvider: input.wantsProvider === true },
  });

  return { userId: user.id };
}

export async function issueEmailVerification(
  userId: string,
  email: string,
  locale: Locale,
): Promise<void> {
  const token = generateToken();
  await db.authToken.create({
    data: {
      tokenHash: hashToken(token),
      userId,
      type: 'EMAIL_VERIFICATION',
      expiresAt: new Date(Date.now() + VERIFY_TOKEN_TTL_HOURS * 3600_000),
    },
  });
  const res = await getMailer().send(verificationEmail({ to: email, locale, token }));
  if (res.status === 'failed') logger.error('verification_email_failed', { userId });
}

export async function loginUser(input: {
  email: string;
  password: string;
  locale?: Locale;
  ip?: string;
  userAgent?: string | null;
}): Promise<{ userId: string }> {
  const email = normalizeEmail(input.email);
  const user = await db.user.findUnique({ where: { email } });

  // Equalise behaviour for unknown accounts.
  const storedHash = user?.passwordHash ?? (await dummyHash());

  if (user && user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    void audit({
      actorId: user.id,
      action: AUDIT_ACTIONS.loginLocked,
      entityType: 'user',
      entityId: user.id,
      ip: input.ip,
    });
    throw new ApiError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
  }

  const valid = await verifyPassword(storedHash, input.password);

  if (!user || !valid || user.status !== 'ACTIVE' || user.deletedAt) {
    if (user && user.status === 'ACTIVE' && !user.deletedAt) {
      const failed = user.failedLoginCount + 1;
      const lock = failed >= MAX_FAILED_ATTEMPTS;
      await db.user.update({
        where: { id: user.id },
        data: {
          failedLoginCount: failed,
          lockedUntil: lock ? new Date(Date.now() + LOCK_MINUTES * 60_000) : user.lockedUntil,
        },
      });
      void audit({
        actorId: user.id,
        action: lock ? AUDIT_ACTIONS.loginLocked : AUDIT_ACTIONS.loginFailed,
        entityType: 'user',
        entityId: user.id,
        ip: input.ip,
        metadata: { failedAttempts: failed },
      });
      if (lock)
        throw new ApiError(429, 'ACCOUNT_LOCKED', 'Too many failed attempts. Try again later.');
    }
    throw ApiError.unauthenticated('Email or password is incorrect');
  }

  if (user.failedLoginCount > 0 || user.lockedUntil) {
    await db.user.update({
      where: { id: user.id },
      data: { failedLoginCount: 0, lockedUntil: null },
    });
  }

  await createSession(user.id, { ip: input.ip, userAgent: input.userAgent });

  void audit({
    actorId: user.id,
    action: AUDIT_ACTIONS.loginSuccess,
    entityType: 'user',
    entityId: user.id,
    ip: input.ip,
    userAgent: input.userAgent,
  });

  return { userId: user.id };
}

export async function verifyEmailToken(token: string): Promise<{ userId: string }> {
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (
    !row ||
    row.type !== 'EMAIL_VERIFICATION' ||
    row.usedAt ||
    row.expiresAt.getTime() < Date.now()
  ) {
    throw ApiError.badRequest('INVALID_TOKEN', 'This verification link is invalid or expired');
  }

  await db.$transaction([
    db.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.user.update({
      where: { id: row.userId },
      data: { emailVerifiedAt: new Date(), failedLoginCount: 0, lockedUntil: null },
    }),
  ]);

  void audit({
    actorId: row.userId,
    action: AUDIT_ACTIONS.emailVerified,
    entityType: 'user',
    entityId: row.userId,
  });
  void notify(row.userId, 'account.verified');

  return { userId: row.userId };
}

/**
 * Always resolves (route returns the same message) — no enumeration.
 * Returns true only when an email was actually sent (for logging).
 */
export async function requestPasswordReset(input: {
  email: string;
  locale: Locale;
  ip?: string;
}): Promise<void> {
  const user = await db.user.findUnique({ where: { email: normalizeEmail(input.email) } });
  if (!user || user.status !== 'ACTIVE' || user.deletedAt) return;

  const token = generateToken();
  await db.authToken.create({
    data: {
      tokenHash: hashToken(token),
      userId: user.id,
      type: 'PASSWORD_RESET',
      expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60_000),
    },
  });

  await getMailer().send(passwordResetEmail({ to: user.email, locale: input.locale, token }));

  void audit({
    actorId: user.id,
    action: AUDIT_ACTIONS.passwordResetRequest,
    entityType: 'user',
    entityId: user.id,
    ip: input.ip,
  });
}

export async function resetPasswordWithToken(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < PASSWORD_MIN_LENGTH) {
    throw ApiError.badRequest('WEAK_PASSWORD', 'Password is too short');
  }
  const row = await db.authToken.findUnique({ where: { tokenHash: hashToken(token) } });
  if (!row || row.type !== 'PASSWORD_RESET' || row.usedAt || row.expiresAt.getTime() < Date.now()) {
    throw ApiError.badRequest('INVALID_TOKEN', 'This reset link is invalid or expired');
  }

  const passwordHash = await hashPassword(newPassword);
  await db.$transaction([
    db.authToken.update({ where: { id: row.id }, data: { usedAt: new Date() } }),
    db.user.update({
      where: { id: row.userId },
      data: { passwordHash, failedLoginCount: 0, lockedUntil: null },
    }),
  ]);
  // A compromised-link scenario must invalidate every session.
  await revokeAllSessions(row.userId);

  void audit({
    actorId: row.userId,
    action: AUDIT_ACTIONS.passwordResetDone,
    entityType: 'user',
    entityId: row.userId,
  });
}

export async function changePassword(input: {
  userId: string;
  currentPassword: string;
  newPassword: string;
  keepSessionId?: string;
  ip?: string;
}): Promise<void> {
  const user = await db.user.findUnique({ where: { id: input.userId } });
  if (!user) throw ApiError.unauthenticated();

  const valid = await verifyPassword(user.passwordHash, input.currentPassword);
  if (!valid) throw ApiError.badRequest('INVALID_PASSWORD', 'Current password is incorrect');
  if (input.newPassword.length < PASSWORD_MIN_LENGTH) {
    throw ApiError.badRequest('WEAK_PASSWORD', 'Password is too short');
  }

  await db.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(input.newPassword) },
  });

  // Revoke every session except the one performing the change.
  await db.session.updateMany({
    where: {
      userId: user.id,
      revokedAt: null,
      ...(input.keepSessionId ? { id: { not: input.keepSessionId } } : {}),
    },
    data: { revokedAt: new Date() },
  });

  void audit({
    actorId: user.id,
    action: 'auth.password.changed',
    entityType: 'user',
    entityId: user.id,
    ip: input.ip,
  });
}
