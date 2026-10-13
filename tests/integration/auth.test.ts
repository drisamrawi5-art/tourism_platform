import { randomBytes, createHash } from 'node:crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Auth service integration tests — run against visit_imedwan_test.
 *
 * Covered invariants (spec sections 26–27):
 * - no account enumeration (identical errors, silent password-reset)
 * - 5 failed logins → 15 min lockout, counters reset on success
 * - verification/reset tokens: 256-bit, SHA-256 at rest, single-use, TTL'd
 * - reset revokes every session; change-password keeps only the current one
 */

const h = vi.hoisted(() => ({
  jar: new Map<string, string>(),
  emails: [] as Array<{ to?: string; subject?: string; text?: string }>,
}));

vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) =>
      h.jar.has(name) ? { name, value: h.jar.get(name) as string } : undefined,
    set: (name: string, value: string) => {
      h.jar.set(name, value);
    },
    delete: (name: string) => {
      h.jar.delete(name);
    },
    has: (name: string) => h.jar.has(name),
  }),
}));

vi.mock('@/lib/mail', () => ({
  getMailer: () => ({
    send: async (message: { to?: string; subject?: string; text?: string }) => {
      h.emails.push(message);
      return { status: 'sent' as const };
    },
  }),
}));

import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/errors';
import {
  changePassword,
  loginUser,
  registerUser,
  requestPasswordReset,
  resetPasswordWithToken,
  verifyEmailToken,
} from '@/lib/auth/service';
import { getSession } from '@/lib/auth/session';

const PW = 'CorrectHorse!42';
const NEW_PW = 'EvenBetter!2026';

let seq = 0;
const uniqueEmail = () => `auth-${Date.now()}-${++seq}@example.test`;

async function expectApiError(
  promise: Promise<unknown>,
  status: number,
  code: string,
): Promise<ApiError> {
  const err = await promise.then(
    () => null,
    (e: unknown) => e,
  );
  expect(err, `expected ApiError ${status}/${code}`).toBeInstanceOf(ApiError);
  const apiErr = err as ApiError;
  expect(apiErr.status).toBe(status);
  expect(apiErr.code).toBe(code);
  return apiErr;
}

/** Find the latest captured email whose text contains `path`, extract token. */
function tokenFromEmail(path: string): string {
  for (let i = h.emails.length - 1; i >= 0; i--) {
    const text = h.emails[i]?.text ?? '';
    if (text.includes(path)) {
      const match = text.match(/token=([^&\s]+)/);
      if (match?.[1]) return decodeURIComponent(match[1]);
    }
  }
  throw new Error(`no captured email containing ${path}`);
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

beforeEach(() => {
  h.emails.length = 0;
  h.jar.clear();
});

afterAll(async () => {
  // Let fire-and-forget audit() writes settle before closing the client.
  await new Promise((resolve) => setTimeout(resolve, 500));
  const users = await db.user.findMany({
    where: { email: { endsWith: '@example.test' } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  if (ids.length > 0) {
    await db.auditLog.deleteMany({ where: { actorId: { in: ids } } });
    // sessions / auth_tokens / notifications cascade on user delete
    await db.user.deleteMany({ where: { id: { in: ids } } });
  }
  await db.$disconnect();
});

describe('registerUser', () => {
  it('creates a CUSTOMER with an argon2id hash and one verification token', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({
      email,
      password: PW,
      name: 'Test User',
      locale: 'fr',
    });

    const user = await db.user.findUnique({ where: { id: userId } });
    expect(user).not.toBeNull();
    expect(user).toMatchObject({
      email,
      role: 'CUSTOMER',
      locale: 'fr',
      emailVerifiedAt: null,
      deletedAt: null,
    });
    expect(user?.passwordHash).not.toContain(PW);
    expect(user?.passwordHash.startsWith('$argon2')).toBe(true);

    const tokens = await db.authToken.count({
      where: { userId, type: 'EMAIL_VERIFICATION', usedAt: null },
    });
    expect(tokens).toBe(1);

    expect(h.emails.some((m) => (m.text ?? '').includes('/fr/verify-email?token='))).toBe(true);
  });

  it('rejects duplicates with 409 EMAIL_TAKEN and weak passwords with 400', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: PW });

    await expectApiError(registerUser({ email, password: PW }), 409, 'EMAIL_TAKEN');
    await expectApiError(
      registerUser({ email: uniqueEmail(), password: 'short' }),
      400,
      'WEAK_PASSWORD',
    );

    // Exactly one account exists for that email.
    const count = await db.user.count({ where: { email } });
    expect(count).toBe(1);
  });
});

describe('verifyEmailToken', () => {
  it('verifies exactly once (single-use token)', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({ email, password: PW });
    const token = tokenFromEmail('/verify-email');

    const result = await verifyEmailToken(token);
    expect(result.userId).toBe(userId);

    const user = await db.user.findUnique({ where: { id: userId } });
    expect(user?.emailVerifiedAt).not.toBeNull();

    await expectApiError(verifyEmailToken(token), 400, 'INVALID_TOKEN');
    await expectApiError(verifyEmailToken('totally-made-up-token'), 400, 'INVALID_TOKEN');
  });

  it('rejects expired verification tokens', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({ email, password: PW });

    const expired = randomBytes(32).toString('base64url');
    await db.authToken.create({
      data: {
        tokenHash: sha256(expired),
        userId,
        type: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() - 1000),
      },
    });

    await expectApiError(verifyEmailToken(expired), 400, 'INVALID_TOKEN');
  });
});

describe('loginUser', () => {
  it('fails identically for unknown email and wrong password (no enumeration)', async () => {
    const email = uniqueEmail();
    await registerUser({ email, password: PW });

    const unknownErr = await expectApiError(
      loginUser({ email: `missing-${email}`, password: PW }),
      401,
      'UNAUTHENTICATED',
    );
    const wrongErr = await expectApiError(
      loginUser({ email, password: 'WrongPassword!99' }),
      401,
      'UNAUTHENTICATED',
    );

    expect(wrongErr.message).toBe(unknownErr.message);
    expect(wrongErr.code).toBe(unknownErr.code);
  });

  it('locks after 5 failures, stays locked, and recovers after the lock expires', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({ email, password: PW });

    // Attempts 1–4: plain 401.
    for (let attempt = 1; attempt <= 4; attempt++) {
      await expectApiError(
        loginUser({ email, password: `Wrong-${attempt}!abc` }),
        401,
        'UNAUTHENTICATED',
      );
    }
    // Attempt 5: lock.
    await expectApiError(loginUser({ email, password: 'Wrong-5!abc' }), 429, 'ACCOUNT_LOCKED');

    const locked = await db.user.findUnique({ where: { id: userId } });
    expect(locked?.failedLoginCount).toBe(5);
    expect(locked?.lockedUntil?.getTime()).toBeGreaterThan(Date.now());

    // Even the CORRECT password is refused while locked.
    await expectApiError(loginUser({ email, password: PW }), 429, 'ACCOUNT_LOCKED');

    // Lock expires → login succeeds, counters reset, session cookie written.
    await db.user.update({
      where: { id: userId },
      data: { lockedUntil: new Date(Date.now() - 1000) },
    });
    const ok = await loginUser({ email, password: PW });
    expect(ok.userId).toBe(userId);

    const recovered = await db.user.findUnique({ where: { id: userId } });
    expect(recovered?.failedLoginCount).toBe(0);
    expect(recovered?.lockedUntil).toBeNull();
    expect(h.jar.size).toBeGreaterThan(0);

    const activeSessions = await db.session.count({
      where: { userId, revokedAt: null, expiresAt: { gt: new Date() } },
    });
    expect(activeSessions).toBeGreaterThanOrEqual(1);
  });

  it('does not create sessions on failed attempts', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({ email, password: PW });
    await expectApiError(loginUser({ email, password: 'NopeNope!123' }), 401, 'UNAUTHENTICATED');
    const sessions = await db.session.count({ where: { userId } });
    expect(sessions).toBe(0);
    expect(h.jar.size).toBe(0);
  });
});

describe('password reset', () => {
  it('never reveals whether an account exists', async () => {
    // Unknown account: resolves silently, no email.
    await requestPasswordReset({ email: uniqueEmail(), locale: 'en' });
    expect(h.emails.length).toBe(0);

    // Known account: token email is sent.
    const email = uniqueEmail();
    await registerUser({ email, password: PW });
    h.emails.length = 0;
    await requestPasswordReset({ email, locale: 'ar' });
    expect(h.emails.length).toBe(1);
    expect(h.emails[0]?.text).toContain('/ar/password-reset?token=');
  });

  it('full cycle: token resets the password, is single-use, and revokes sessions', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({ email, password: PW });
    await loginUser({ email, password: PW });

    const sessionsBefore = await db.session.count({
      where: { userId, revokedAt: null },
    });
    expect(sessionsBefore).toBeGreaterThanOrEqual(1);

    h.emails.length = 0;
    await requestPasswordReset({ email, locale: 'en' });
    const token = tokenFromEmail('/password-reset');

    const row = await db.authToken.findUnique({ where: { tokenHash: sha256(token) } });
    expect(row?.type).toBe('PASSWORD_RESET');
    expect(row?.usedAt).toBeNull();
    // ~60 min TTL (allow small drift).
    const ttl = (row?.expiresAt.getTime() ?? 0) - Date.now();
    expect(ttl).toBeGreaterThan(55 * 60_000);
    expect(ttl).toBeLessThanOrEqual(60 * 60_000);

    await resetPasswordWithToken(token, NEW_PW);

    // Every prior session is revoked.
    const activeAfter = await db.session.count({ where: { userId, revokedAt: null } });
    expect(activeAfter).toBe(0);

    // Old password fails, new password works.
    await expectApiError(loginUser({ email, password: PW }), 401, 'UNAUTHENTICATED');
    const ok = await loginUser({ email, password: NEW_PW });
    expect(ok.userId).toBe(userId);

    // Token cannot be replayed.
    await expectApiError(resetPasswordWithToken(token, 'ThirdPassword!1'), 400, 'INVALID_TOKEN');

    // Weak replacement password is rejected up front.
    await expectApiError(resetPasswordWithToken('any-token-at-all', 'short'), 400, 'WEAK_PASSWORD');
  });
});

describe('changePassword', () => {
  it('requires the current password and keeps only the current session', async () => {
    const email = uniqueEmail();
    const { userId } = await registerUser({ email, password: PW });
    await loginUser({ email, password: PW });
    const current = await getSession();
    expect(current).not.toBeNull();

    const otherSession = await db.session.create({
      data: {
        userId,
        tokenHash: sha256(`other-${Date.now()}-${Math.random()}`),
        expiresAt: new Date(Date.now() + 3_600_000),
      },
    });

    await expectApiError(
      changePassword({
        userId,
        currentPassword: 'WrongCurrent!1',
        newPassword: NEW_PW,
      }),
      400,
      'INVALID_PASSWORD',
    );
    await expectApiError(
      changePassword({ userId, currentPassword: PW, newPassword: 'short' }),
      400,
      'WEAK_PASSWORD',
    );

    await changePassword({
      userId,
      currentPassword: PW,
      newPassword: NEW_PW,
      keepSessionId: current?.id,
    });

    const kept = await db.session.findUnique({ where: { id: current?.id } });
    const other = await db.session.findUnique({ where: { id: otherSession.id } });
    expect(kept?.revokedAt).toBeNull();
    expect(other?.revokedAt).not.toBeNull();

    await expectApiError(loginUser({ email, password: PW }), 401, 'UNAUTHENTICATED');
    const ok = await loginUser({ email, password: NEW_PW });
    expect(ok.userId).toBe(userId);
  });
});
