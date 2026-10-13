# Security model — Visit Imedwan

Threat model summary for the V1 platform: internet-facing public site and API,
customer accounts, provider-submitted content, and a booking/payment flow.
Defences below are implemented unless explicitly marked "planned".

## 1. Transport & headers (`next.config.ts`)

| Header                      | Value / note                                                                                                                                                                                                                                                                                                                                    |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Content-Security-Policy`   | `default-src 'self'`; `object-src 'none'`; `frame-ancestors 'none'`; `base-uri 'self'`; `form-action 'self'`; images `self data blob:`; fonts `self data:`. Scripts: `'self' 'unsafe-inline'` in production (Next.js inline bootstrap) — **planned:** nonce-based CSP to drop `unsafe-inline`. Dev additionally allows `'unsafe-eval'` for HMR. |
| `Strict-Transport-Security` | production only, `max-age=63072000; includeSubDomains; preload`                                                                                                                                                                                                                                                                                 |
| `X-Frame-Options`           | `DENY`                                                                                                                                                                                                                                                                                                                                          |
| `X-Content-Type-Options`    | `nosniff`                                                                                                                                                                                                                                                                                                                                       |
| `Referrer-Policy`           | `strict-origin-when-cross-origin`                                                                                                                                                                                                                                                                                                               |
| `Permissions-Policy`        | `camera=(), microphone=(), geolocation=(self), payment=(), usb=()`                                                                                                                                                                                                                                                                              |
| `X-Robots-Tag`              | noindex for `/account` and other non-public areas (route-level)                                                                                                                                                                                                                                                                                 |

## 2. Authentication

- **Passwords**: Argon2id (`@node-rs/argon2`, library defaults = id variant),
  minimum length enforced server-side (10 chars, capped at 128).
- **No account enumeration**:
  - login: identical error for unknown e-mail / wrong password, timing
    equalised by always verifying against a hash (dummy hash for unknown
    accounts);
  - registration duplicates still return `201` with a neutral body;
  - password reset always returns success regardless of account existence.
- **Lockout**: 5 consecutive failures → account locked 15 minutes
  (`failedLoginCount`/`lockedUntil`), plus per-route IP rate limits and an
  additional per-e-mail rate bucket on login.
- **E-mail verification**: required for gated actions (`verifiedEmail: true`
  on handlers — booking creation, reviews, uploads). Tokens are 256-bit
  random, stored **hashed (SHA-256)**, single-use, 24 h TTL (reset: 1 h).
- **Sessions**: opaque 256-bit cookie token; only its SHA-256 hash is stored.
  `HttpOnly`, `SameSite=Lax`, `Secure` in production, sliding expiry
  (throttled `lastSeenAt` updates), server-side revocation. Password change
  and reset revoke all (other) sessions; admin suspension revokes all.

## 3. CSRF

- Cookies are `SameSite=Lax`, **and** every mutating `/api/v1` route built on
  `createHandler` re-validates the origin: `Sec-Fetch-Site` must be
  `same-origin`/`none`, and `Origin` (when present) must match the host or
  `APP_URL`. Webhook routes are exempt by design (external callers, signature
  authenticated instead).

## 4. Authorisation (RBAC + ownership)

- Code-first permission matrix in `src/lib/auth/permissions.ts`
  (37 permissions × 6 roles); mirrored into `permissions`/`roles` tables by the
  seed for auditability. Handlers declare `permission:` or `roles:` and the
  factory enforces them after authentication.
- **IDOR defence**: list/detail queries are _scoped in the WHERE clause_
  (`customerId`, `ownerId`, …). Scoping happens before the query, not after a
  fetch-and-compare; not-found is returned for foreign ids to avoid
  existence leaks.
- Sensitive single resources double-check ownership or the corresponding
  read permission (e.g. `booking.read` for staff).

## 5. Rate limiting

Database fixed-window counters (`src/lib/rate-limit.ts`), keyed per route:
stricter buckets for login/register/password-reset/e-mail verification,
booking/payment creation, search, uploads, comments, webhooks
(120/min/provider), generic fallback for everything else. Responses use
`429` with `Retry-After` semantics.

## 6. Booking engine integrity

- Server-side pricing: quote → create both compute from `Price` rows
  (deposit resolution: service → provider → category → global settings).
  The client cannot submit an amount.
- Availability: capacity = highest matching `AvailabilityRule` (`0` when none
  — never a guessed default); blocks override. Creation runs inside a
  transaction with `SELECT … FOR UPDATE` on the `bookables` row, so concurrent
  holds serialise; holds expire after the configured window (default 30 min).
- Idempotency-Key prevents duplicate bookings on retry (unique column,
  ownership-checked replay).
- Date-only semantics: UTC day granularity; `NIGHT` occupies `[start, end)`.

## 7. Payments

- **Provider registry**: `none` (default — no adapter, no pretend flows),
  `mock` (development/tests; refuses to initialise when `NODE_ENV=production`).
- Real integrations use hosted redirects; the platform never handles card
  numbers (CSP also blocks payment APIs: `payment=()` in Permissions-Policy).
- **State transitions to `PAID` happen only in the webhook path**:
  signature verification (HMAC, raw body), replay protection via unique
  `(provider, externalEventId)`, and **amount/currency reconciliation against
  the booking — mismatches fail closed** (`REQUIRES_ATTENTION`, never `PAID`).
- Refunds are idempotency-keyed, role-gated (`payment.refund`) and audited.
- Webhook endpoint is rate-limited and returns generic errors; signature
  failures are logged without leaking the reason to the caller.

## 8. Media

- Uploads: multipart, per-account rate limit, declared-type check **plus
  magic-byte sniffing** (`media/validation.ts`), size limits from settings
  (default 10 MB images / 100 MB video), allow-list from settings.
- Exactly-one subject (place/content/business) with authorisation
  (content author, business owner, or `place.manage`).
- New media starts `PENDING_REVIEW`; public serving only after
  `PUBLISHED`/`APPROVED` — pending media is visible to its uploader and
  `media.moderate` holders only. `assertSafeKey` prevents storage-key path
  traversal.
- Comment/like writes are authenticated, size-limited and moderation-gated
  (one nesting level, `PENDING` by default).

## 9. Input validation & output safety

- Every route validates params/query/body with Zod (server-side, typed);
  unknown JSON keys are stripped (Zod default), bodies are size-capped
  (2 MB), JSON syntax errors → 400.
- React escapes all output; no `dangerouslySetInnerHTML` in V1.
- Dates are date-only regex-validated; unknown locales fall back to `en`;
  query booleans use explicit enums (never truthy coercion).

## 10. Audit & logging

- `audit()` writes security-relevant events (login success/failure/lockout,
  role changes, suspensions, business approvals, publishing, pricing &
  availability changes, moderation, refunds) with actor, entity, IP and
  user-agent. `audit.read` is permission-gated.
- Structured logs with a redaction layer (`src/lib/logger.ts`) — no
  passwords, tokens, cookies or raw webhook secrets in logs.
- API responses carry a `requestId` correlated to access logs.

## 11. Data protection

- Session/verification/reset tokens stored hashed; webhook secrets and DB
  credentials come from environment (`.env` is git-ignored; `.env.example`
  documents every key).
- PII shown in dashboards follows least-privilege (provider portal sees only
  customers of its own bookings; admin lists select explicit safe fields —
  never `passwordHash` or `providerPayload`).
- Soft deletes (`deletedAt`) for users; suspend revokes sessions immediately.

## 12. Denial-of-service & operational

- Rate limits (DB counters) + body size caps + pagination caps (max 100/page).
- Embedded PostgreSQL binds to localhost; production should set strong
  credentials + firewall (documented in `.env.example`).
- `expireStaleBookings()` releases abandoned holds (called by the
  booking/payment flows; scheduled invocation is deployment-specific).

## Known limitations / planned work

1. CSP still allows `'unsafe-inline'` scripts → nonce-based CSP planned.
2. No 2FA/recovery codes in V1 (lockout + e-mail verification only).
3. E-mail delivery defaults to console transport in development — SMTP must be
   configured for production (mail abstraction already supports it).
4. No WAF/rate-limit at the edge; DB-backed limits are per-instance.
5. Content moderation is manual (admin portal); no automated image scanning
   (magic-byte checks only).
