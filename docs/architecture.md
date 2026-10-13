# Architecture — Visit Imedwan

## 1. Application shape

Next.js 15 App Router monolith with three execution surfaces:

| Surface                   | Location              | Notes                                                                                                        |
| ------------------------- | --------------------- | ------------------------------------------------------------------------------------------------------------ |
| Public/customer/portal UI | `src/app/[locale]/**` | locale-first URLs; the `[locale]` layout **is** the root layout (`html lang/dir`); Arabic switches `dir=rtl` |
| Versioned HTTP API        | `src/app/api/v1/**`   | built on `createHandler` (validation → CSRF → auth → RBAC → rate limit → handler → uniform errors)           |
| Background/ops scripts    | `scripts/`            | `db.mjs` (embedded Postgres lifecycle), health checks, seed via Prisma                                       |

Locale resolution: `src/middleware.ts` redirects unprefixed paths to
`/{en|fr|ar}` (cookie → `Accept-Language` → `en`) and remembers the choice.
There is intentionally **no** `app/layout.tsx` — official App Router i18n
pattern; unknown locale prefixes redirect home instead of crashing.

## 2. Layering

```
components/**      UI only — server components default, "use client" for forms/interaction
    ↓
src/lib/data/**    typed read models for pages (PlaceCard, GuideCard, …) — published-only filters
src/lib/<domain>/** domain services — the ONLY place invariants live
    ↓
src/app/api/v1/**  thin HTTP adapters (Zod + auth + service call)
    ↓
Prisma / PostgreSQL
```

- Pages call `lib/data` directly (server components) — the API is for client
  interactions and third parties, not for our own SSR to loop back through.
- Services throw `ApiError`/`AuthError`; routes never catch-and-inspect
  business errors beyond mapping.

## 3. Domain modules (`src/lib`)

| Module                                           | Responsibility                                                                                                                                                                                           |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `auth/`                                          | Argon2id passwords, opaque DB sessions, code-first RBAC (`permissions.ts`), account flows (`service.ts`: register/login/verify/reset with anti-enumeration + lockout)                                    |
| `api/`                                           | `createHandler` factory, error taxonomy, pagination, browser `apiFetch` wrapper (`client.ts`)                                                                                                            |
| `booking/`                                       | `dates.ts` (UTC date-only semantics), `pricing.ts` (server-side money), `availability.ts` (rules/blocks/occupancy), `service.ts` (quote, create with `FOR UPDATE` + idempotency, cancel/complete/expire) |
| `payments/`                                      | adapter registry (`none` default, `mock` dev-only), `webhook.ts` state machine (signed events → booking transitions), `service.ts` (initiate/refund)                                                     |
| `data/`                                          | public read models: destination, places, businesses (accommodation/guides), content; hero-media attachment                                                                                               |
| `settings/` (`settings.ts`)                      | typed settings + feature flags; deposit resolution order service → provider → category → global; commission (default 0)                                                                                  |
| `media/` + `storage/`                            | upload validation (magic bytes), key safety, local/S3 storage adapters                                                                                                                                   |
| `mail/`, `notifications/`                        | console/SMTP mailer + templates; in-app + e-mail notifications                                                                                                                                           |
| `i18n` (`src/i18n`)                              | `en` canonical dictionary; `fr`/`ar` type-checked for full key parity; `t()` interpolation                                                                                                               |
| `seo/`                                           | `buildMetadata` + JSON-LD builders (no fabricated ratings)                                                                                                                                               |
| `audit/`, `rate-limit/`, `analytics/`, `logger/` | cross-cutting                                                                                                                                                                                            |

## 4. Data model highlights

- **Destination → Places → PlaceTranslation (en/fr/ar)** each with a
  `verificationStatus` (`VERIFIED`/`PROJECT_PROVIDED`/`PENDING_VERIFICATION`/…)
  — the UI must surface it; unverified facts stay `null`.
- **Business** (owner, type `ACCOMMODATION|GUIDE`, publication workflow
  `DRAFT → PENDING_REVIEW → APPROVED/PUBLISHED → REJECTED`), sub-models
  `Accommodation(+Unit)` / `Guide(+Service)`.
- **Bookable** — one unified bookable per unit/service carries category,
  capacity, status, prices, availability rules/blocks, reviews. Booking holds
  lock this row.
- **Booking** — reference `VI-XXXXXX`, status machine
  `PENDING → CONFIRMED → COMPLETED`, `PENDING → CANCELLED`, payment statuses
  separate (`UNPAID/PAID/PARTIALLY_REFUNDED/REFUNDED/FAILED/REQUIRES_ATTENTION`),
  `completedAt` gates reviews; booking ↔ reviews is one-to-many (rebookable).
- **Price** — unit-based (`NIGHT`, `DAY`, `PERSON`, …) with validity windows
  and priority; base price = both dates null.
- **Payment / Refund / WebhookEvent** — money ledger; `WebhookEvent` unique
  `(provider, externalEventId)` = replay protection.
- **Media / MediaLike / MediaComment** — exactly-one subject FK pattern
  (nullable `placeId`/`contentId`/`businessId`, app-enforced XOR).
- **User / Session / AuthToken** — hashed tokens only.
  **AuditLog**, **AnalyticsEvent**, **Setting**, **FeatureFlag**,
  **Notification** round it out.

Money: `Decimal` end-to-end; serialized as strings in API JSON; formatted with
`formatMoney(amount, currency, locale)` at the edge.

## 5. Booking → payment flow

```
client quote ──► POST /bookings/quote ──► quoteBooking()  (pricing + availability, read-only)
client confirm ─► POST /bookings (+Idempotency-Key) ──► createBooking():
                    tx: lock bookable (FOR UPDATE) → re-check availability →
                    compute price/deposit server-side → insert PENDING + hold
optional ───────► POST /payments ──► initiatePayment() ──► provider checkout URL
provider ───────► POST /api/v1/payments/webhook/:provider (HMAC, raw body)
                    verify sig → dedupe event → reconcile amount →
                    state machine → booking/payment transition + notify
```

- `mock` provider renders a local checkout page that replays a _signed_
  webhook — the state transition path is identical to production.
- `none` provider means the UI shows payment state honestly without fake
  gateways; confirm/complete remain provider actions (cash/on-arrival model).

## 6. Rendering & caching

- Public pages: dynamic (session-aware header) — no stale-cache risk for
  account state; data-layer queries are cheap single-row reads.
- API: always dynamic; `Cache-Control` only on immutable media after approval.
- Images: same-origin storage (`/api/v1/media/file/<key>`), AVIF/WebP
  enabled for `next/image`; placeholders until moderation approves media.

## 7. Testing strategy

- **Unit (Vitest)**: pricing, date semantics, availability resolution,
  permissions matrix, dictionary parity, settings precedence, webhook
  signature/state machine (pure functions isolated from Next).
- **Integration (Vitest + `visit_imedwan_test`)**: booking lifecycle, payment
  webhook replay/amount-mismatch, auth flows (lockout/enumeration), media
  validation — via route handlers called as `Request → Response`.
- **E2E (Playwright)**: locale routing/RTL, search, auth, booking happy path
  with the mock provider, provider approval workflow, admin moderation.
