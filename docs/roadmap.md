# Roadmap — Visit Imedwan

Honest phase map: what the code contains **today** versus what the phases
still require. Nothing below is claimed as working unless a file backs it.

## V0 — Foundation & platform core — **largely implemented**

| Item                                                                             | Status | Evidence                                                                   |
| -------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------- |
| Next.js 15 + TS strict + Tailwind v4 stack                                       | done   | `package.json`, `tsconfig.json`                                            |
| PostgreSQL schema (42 models) + migrations                                       | done   | `prisma/schema.prisma`, 2 migrations                                       |
| Embedded local database (no Docker)                                              | done   | `scripts/db.mjs` (port 5433)                                               |
| Idempotent seed (destination, 5 places, settings, flags, RBAC, dev admin)        | done   | `prisma/seed.ts`                                                           |
| Request pipeline (CSRF → validation → auth → RBAC → rate limit → uniform errors) | done   | `src/lib/api/handler.ts`                                                   |
| Auth: Argon2id, opaque sessions, lockout, tokens                                 | done   | `src/lib/auth/*` + integration tests                                       |
| RBAC matrix (37 permissions, 6 roles)                                            | done   | `src/lib/auth/permissions.ts` + unit tests                                 |
| i18n en/fr/ar with RTL and type-enforced parity                                  | done   | `src/i18n/*`, `tests/unit/i18n.test.ts`                                    |
| Settings + feature-flag framework                                                | done   | `src/lib/settings.ts`, admin API                                           |
| Storage / mail / payment **abstractions**                                        | done   | `storage/`, `mail/`, `payments/` (drivers: local, console, none/mock)      |
| Security headers, structured logging, audit trail                                | done   | `next.config.ts`, `logger.ts`, `audit.ts` — see [security.md](security.md) |
| Test harness (Vitest unit + integration)                                         | done   | `tests/` (auth + booking suites live)                                      |

## V1 — Destination site & booking marketplace — **in progress**

Implemented today:

- Public site pages under `src/app/[locale]/`: home, discover, places
  (+ detail), stay (+ detail), guides (+ detail), journal (+ detail),
  gallery, search, plan, booking flow (`book/[bookableId]`), account
  (bookings, profile, wishlist), legal pages, auth pages — locale-first with
  RTL.
- Complete `/api/v1` route surface: content, bookings, payments, reviews,
  wishlist, notifications, media, provider portal, admin portal, config,
  health (inventory in [api.md](api.md)).
- Booking engine with double-booking protection, holds, idempotency,
  deposits/commission resolution — covered by integration tests
  ([testing.md](testing.md)).

Still pending for V1 (do not assume):

| Gap                                  | Detail                                                                                                                                                                                             |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Provider & admin portal UI**       | API routes exist; **no portal pages** (`[locale]/provider`, `[locale]/admin` are absent)                                                                                                           |
| **Real payments**                    | `PAYMENT_PROVIDER=none` default; only `none`/`mock` adapters exist — production payments impossible until a real adapter is built and tested ([payments.md](payments.md))                          |
| **E2E suite**                        | `playwright.config.ts` ready, `e2e/` directory does not exist                                                                                                                                      |
| **Scheduled jobs**                   | `expireStaleBookings`, `purgeExpiredSessions`, `purgeStaleRateLimits`, auto-complete (`booking.autoCompleteDays`) exist as functions but **nothing calls them**                                    |
| **Maps**                             | `MAP_PROVIDER=none`; coordinates render only when verified — no map UI                                                                                                                             |
| **Coverage of the test matrix**      | payments (deposit/full/failed/refund/duplicate webhook), review eligibility, provider/business/approval flows, route-level IDOR/privilege tests — see the honest table in [testing.md](testing.md) |
| **Route-level ownership assertions** | `assertOwnership` defined but unused; scoping is via `where` clauses ([rbac.md](rbac.md))                                                                                                          |
| **Account notification UI**          | API exists; no in-account notifications page yet                                                                                                                                                   |

## V1.1 — Hardening & operations — **mostly pending**

- Wire the scheduled jobs (hold expiry, session/rate-limit purge,
  auto-complete) into a runner.
- Monitoring on top of `api_access`/`health` ([logging.md](logging.md)).
- Nonce-based CSP (the current CSP keeps `unsafe-inline` for Next.js inline
  bootstrap scripts — plan recorded in `next.config.ts` and
  [security.md](security.md)).
- Complete the test matrix; stand up CI running typecheck/lint/tests/build.
- Email delivery configuration for production (SMTP) and delivery audits.

## V2 — Marketplace expansion — **schema-ready, not implemented**

Reserved but inert: `BusinessType` values `RESTAURANT`, `TRANSPORT`,
`EXPERIENCE`, `ACTIVITY`, `EVENT`, `PARTNER`; `ContentKind` extras; feature
flags `RESTAURANTS`, `EXPERIENCES`, `EVENTS`, `TRANSPORT`,
`MULTI_DESTINATION`, `PROMOTED_LISTINGS`; reserved permissions
(`approvals.manage`, `notification.manage`, `seo.manage` partially wired).

- `MULTI_DESTINATION`: schema supports multiple `Destination` rows and the
  seed/data layer is destination-aware, but everything is single-destination
  (`slug: "imedwan"`) and flags default **off**.
- No UI, services or routes exist for the new categories — enabling a flag
  today surfaces nothing fake, by design.

## V3 — AI concierge — **architecture only**

- Tables `AIConversation` / `AIMessage` exist ("grounded in platform data
  only" per schema comments); flag `AI_CONCIERGE` seeded **disabled**.
- No AI routes, prompts or UI exist.

## Guiding constraints for every phase

- Never invent destination facts (coordinates, prices, hours, history) —
  unknown stays `null` and renders as pending.
- Brand rules: "Visit Imedwan" never translated; one slogan per language
  context ([i18n.md](i18n.md)).
- Money only server-side; payment state only via verified webhooks.
- RBAC/ownership enforced server-side on every new route.

See also: [architecture.md](architecture.md), [testing.md](testing.md),
[configuration.md](configuration.md).
