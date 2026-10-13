# Authentication — Visit Imedwan

Implementation: `src/lib/auth/password.ts`, `session.ts`, `service.ts`;
routes under `src/app/api/v1/auth/`; overview in
[security.md](security.md).

## 1. Password hashing — Argon2id

- Algorithm: **Argon2id** via `@node-rs/argon2` (library default algorithm).
- Parameters (OWASP Password Storage Cheat Sheet recommendation):
  `memoryCost: 19456` (19 MiB), `timeCost: 2`, `parallelism: 1`.
- Policy: **length only** — minimum 10, maximum 128 characters
  (`PASSWORD_MIN_LENGTH` / `PASSWORD_MAX_LENGTH`), enforced by Zod schemas and
  re-checked in `hashPassword`.
- Passwords are never stored, logged or returned; `verifyPassword` fails
  closed on malformed hashes or oversized input.

## 2. Sessions — opaque, database-backed

| Property        | Value                                                                                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Cookie name     | `SESSION_COOKIE_NAME` (default `vi_session`)                                                                                                 |
| Cookie flags    | `HttpOnly`, `SameSite=Lax`, `Path=/`, `Secure` **in production only**                                                                        |
| Token           | 256-bit (`randomBytes(32)`) base64url value — carries no data                                                                                |
| Storage         | only the **SHA-256 hash** is stored in `sessions.tokenHash` (unique)                                                                         |
| TTL             | `SESSION_TTL_HOURS` (default 720 h = 30 days), set on the cookie and row at login                                                            |
| Client metadata | `ip`, `userAgent` (truncated to 300 chars) recorded per session                                                                              |
| Activity        | `lastSeenAt` updated at most once every **5 minutes** (`LAST_SEEN_THROTTLE_MS`) — a write-per-request is avoided                             |
| Rejection       | missing cookie, unknown hash, `revokedAt` set, `expiresAt` past, user `status != ACTIVE`, or `deletedAt` set → `null` (treated as anonymous) |

Note on "sliding": activity slides via `lastSeenAt` only; the absolute
`expiresAt` is fixed at login, so sessions hard-expire after the TTL.

### Revocation rules

- **Logout** (`POST /auth/logout`): sets `revokedAt` on the current session
  and clears the cookie.
- **Password reset**: `revokeAllSessions(userId)` — every session dies
  (suspected-compromise scenario).
- **Password change**: all sessions revoked **except** the session performing
  the change (`keepSessionId`).
- **Admin suspend / delete**: `User.status` becomes `SUSPENDED`/`DELETED` (or
  `deletedAt` set) — `getSession` refuses those users immediately, so cookies
  in flight stop working without touching each row.
- Housekeeping helper `purgeExpiredSessions()` deletes expired rows; **no
  scheduler is wired yet** (see [roadmap.md](roadmap.md)).

## 3. Login flow and lockout

`loginUser` (`src/lib/auth/service.ts`):

1. Email normalised (trim + lowercase).
2. If `lockedUntil > now` → `429 ACCOUNT_LOCKED` (audited).
3. Password verified against the stored hash — for **unknown accounts a dummy
   Argon2id hash** is verified instead, equalising timing/response.
4. Identical `401 "Email or password is incorrect"` for: unknown email, wrong
   password, `SUSPENDED`/`DELETED` users (no enumeration).
5. Failure accounting (existing active users only): `failedLoginCount += 1`;
   at **5 failures** the account locks for **15 minutes** (`lockedUntil`),
   audited as `auth.login.locked`.
6. Success: counters reset, session created, audited `auth.login.success`.

Additional throttling at the route layer: `RATE_LIMITS.login` = 10 per 5 min
**per IP** (handler) and again **per email** (manual second check in the
login route).

## 4. Token flows (email verification & password reset)

Both use `auth_tokens` rows: 256-bit random token, only the SHA-256 hash
stored, `type`, `expiresAt`, single-use via `usedAt`.

| Flow               | Type                 | TTL        | Entry points                                                                                                                               |
| ------------------ | -------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Email verification | `EMAIL_VERIFICATION` | **24 h**   | issued on register and via `POST /auth/verify-email/resend`; consumed by `POST /auth/verify-email` (link `/{locale}/verify-email?token=…`) |
| Password reset     | `PASSWORD_RESET`     | **60 min** | requested by `POST /auth/password-forgot`; consumed by `POST /auth/password-reset` (link `/{locale}/password-reset?token=…`)               |

Properties:

- **Single-use**: consumption sets `usedAt` in the same transaction as the
  state change; a used/expired/wrong-type token → `400 INVALID_TOKEN`.
- **No enumeration**: `requestPasswordReset` always resolves silently —
  unknown/inactive accounts simply send nothing; the route returns the same
  response either way.
- Successful verification clears `failedLoginCount`/`lockedUntil`; reset
  additionally revokes **all** sessions.
- Registration returns `409 EMAIL_TAKEN` for existing emails (the trade-off
  is explicit in code: one benign message, no timing differences).

## 5. Routes

| Route                                   | Auth     | Rate limit              |
| --------------------------------------- | -------- | ----------------------- |
| `POST /api/v1/auth/register`            | none     | 5 / h (IP)              |
| `POST /api/v1/auth/login`               | none     | 10 / 5 min (IP + email) |
| `POST /api/v1/auth/logout`              | optional | —                       |
| `GET /api/v1/auth/me`                   | optional | —                       |
| `POST /api/v1/auth/password-forgot`     | none     | 5 / h                   |
| `POST /api/v1/auth/password-reset`      | none     | 5 / h                   |
| `POST /api/v1/auth/password-change`     | required | 5 / h                   |
| `POST /api/v1/auth/verify-email`        | none     | 10 / h                  |
| `POST /api/v1/auth/verify-email/resend` | required | 10 / h                  |

`GET /auth/me` returns the session user (or `null` data) and powers the
header/account UI. Mutating routes are additionally protected by the
Origin/`sec-fetch-site` CSRF checks in `createHandler`.

## 6. Related audit actions

`auth.register`, `auth.login.success`, `auth.login.failed`,
`auth.login.locked`, `auth.logout`, `auth.email.verified`,
`auth.password.reset.request`, `auth.password.reset.done`, and the inline
`auth.password.changed` — all written to `audit_logs` with IP/user-agent
metadata (never passwords or tokens).

See also: [rbac.md](rbac.md), [api.md](api.md),
[testing.md](testing.md) (auth integration suite).
