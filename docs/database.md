# Database — Visit Imedwan

PostgreSQL via Prisma 6 (`prisma/schema.prisma`). Local development runs an
embedded PostgreSQL 17 on port **5433** (see `scripts/db.mjs`); no Docker or
system database is required. Databases: `visit_imedwan` (dev) and
`visit_imedwan_test` (tests only).

## 1. Entity catalogue (42 models)

| Area                                               | Models                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Identity & auth                                    | `User`, `Session`, `AuthToken`, `ProviderProfile`                                                            |
| RBAC                                               | `Permission`, `RolePermission` (mirror of the code matrix — seed writes, code is source of truth)            |
| Destination & content                              | `Destination`, `DestinationTranslation`, `Place`, `PlaceTranslation`, `Content`, `ContentTranslation`        |
| Businesses & services                              | `Business`, `BusinessTranslation`, `Accommodation`, `AccommodationUnit`, `Guide`, `GuideService`, `Bookable` |
| Pricing & availability                             | `Price`, `AvailabilityRule`, `AvailabilityBlock`                                                             |
| Booking engine                                     | `Booking`, `BookingItem`, `Commission`                                                                       |
| Payments                                           | `Payment`, `Refund`, `WebhookEvent`                                                                          |
| Engagement                                         | `Review`, `WishlistItem`, `MediaAlbum`, `Media`, `MediaComment`, `MediaLike`, `Notification`                 |
| Platform                                           | `Setting`, `FeatureFlag`, `AuditLog`, `RateLimit`, `AnalyticsEvent`                                          |
| AI concierge (V3 schema only, feature-flagged off) | `AIConversation`, `AIMessage`                                                                                |

Shape notes:

- **Destination-first**: one `Destination` (`slug: "imedwan"`) owns `Place` and
  `Business` rows; the schema is multi-destination-ready (`Business.destinationId`
  is nullable, `Destination` has its own table) but only one destination exists.
- **`Bookable`** is the unified booking-engine target: one row per
  accommodation unit / guide service (linked 1:1 through
  `AccommodationUnit.bookableId` / `GuideService.bookableId`, both `@unique`).
- Polymorphic subjects (`Media`, `WishlistItem`, `MediaAlbum`) use several
  nullable FK columns; **exactly-one is enforced in application code**, each FK
  individually by Postgres.
- Translation tables are one row per `(entity, locale)` (en/fr/ar).

## 2. Enums (exact values)

| Enum                  | Values                                                                                                                      |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `Role`                | `SUPER_ADMIN`, `ADMIN`, `CONTENT_MANAGER`, `BUSINESS_OWNER`, `GUIDE`, `CUSTOMER`                                            |
| `VerificationStatus`  | `VERIFIED`, `PROJECT_PROVIDED`, `PROVIDER_PROVIDED`, `EDITORIAL`, `PENDING_VERIFICATION`                                    |
| `PublicationStatus`   | `DRAFT`, `PENDING_REVIEW`, `APPROVED`, `PUBLISHED`, `REJECTED`, `ARCHIVED`                                                  |
| `BusinessType`        | `ACCOMMODATION`, `GUIDE`, `RESTAURANT`, `TRANSPORT`, `EXPERIENCE`, `ACTIVITY`, `EVENT`, `PARTNER`                           |
| `BookableCategory`    | `ACCOMMODATION`, `GUIDE` (V1; other values reserved for future marketplace categories)                                      |
| `AccommodationType`   | `GUESTHOUSE`, `GITE`, `LOCAL_STAY`, `TRADITIONAL`                                                                           |
| `BookingStatus`       | `PENDING`, `CONFIRMED`, `COMPLETED`, `CANCELLED`, `REFUNDED`                                                                |
| `PaymentStatus`       | `UNPAID`, `PARTIALLY_PAID`, `PAID`, `REFUNDED`, `FAILED`                                                                    |
| `PaymentMode`         | `FULL`, `DEPOSIT`                                                                                                           |
| `AvailabilityState`   | `AVAILABLE`, `UNAVAILABLE`, `BLOCKED`, `BOOKED`                                                                             |
| `PricingUnit`         | `NIGHT`, `PERSON`, `DAY`, `SERVICE`                                                                                         |
| `ReviewStatus`        | `PENDING`, `APPROVED`, `REJECTED`                                                                                           |
| `ContentKind`         | `PLACE`, `DESTINATION`, `STORY`, `GUIDE`, `ACCOMMODATION`, `EDITORIAL`, `EXPERIENCE`, `EVENT`, `RESTAURANT`, `TRAVEL_GUIDE` |
| `MediaKind`           | `IMAGE`, `VIDEO`                                                                                                            |
| `WishlistTarget`      | `PLACE`, `ACCOMMODATION`, `GUIDE`                                                                                           |
| `AuthTokenType`       | `EMAIL_VERIFICATION`, `PASSWORD_RESET`                                                                                      |
| `UserStatus`          | `ACTIVE`, `SUSPENDED`, `DELETED`                                                                                            |
| `NotificationChannel` | `IN_APP`, `EMAIL`                                                                                                           |
| `RefundStatus`        | `PENDING`, `SUCCEEDED`, `FAILED`                                                                                            |
| `WebhookStatus`       | `RECEIVED`, `PROCESSED`, `FAILED`, `DUPLICATE`                                                                              |
| `MapProviderKind`     | `NONE`, `OSM`, `MAPBOX`, `GOOGLE`                                                                                           |

`Booking.status` and `Booking.paymentStatus` are **independent columns** — a
booking can be `CONFIRMED` while `UNPAID` (e.g. pay-at-property) or
`CANCELLED` with `PAID` (awaiting refund). `Media.status` reuses
`PublicationStatus` and defaults to `PENDING_REVIEW`.

## 3. Money and date conventions

- **Money**: `Decimal @db.Decimal(12, 2)` plus an explicit `currency`
  column (default `"MAD"`). `Booking.commissionRate` and
  `Commission.ratePercent` use `Decimal(5, 2)`. Amounts are serialized as
  **strings** in API JSON and formatted only at the UI edge
  (`src/lib/currency.ts`).
- **Dates**: availability and booking dates are date-only
  (`DateTime @db.Date`) — no time-of-day ambiguity. Timestamps
  (`createdAt`, `paidAt`, `holdExpiresAt`, …) are normal `DateTime` (UTC).
- The client never supplies money fields; totals are snapshots written by the
  server at booking time (`subtotal`, `total`, `depositAmount`,
  `commissionRate`/`commissionAmount`).

## 4. Important unique constraints

| Table                                                                          | Constraint                                  | Purpose                                                     |
| ------------------------------------------------------------------------------ | ------------------------------------------- | ----------------------------------------------------------- |
| `users`                                                                        | `email`                                     | one account per email                                       |
| `sessions`                                                                     | `tokenHash`                                 | opaque session lookup (SHA-256 only)                        |
| `auth_tokens`                                                                  | `tokenHash`                                 | hashed email-verification / reset tokens                    |
| `bookings`                                                                     | `reference`                                 | human reference `VI-XXXXXX` (retry loop in `createBooking`) |
| `bookings`                                                                     | `idempotencyKey`                            | client `Idempotency-Key` header → one booking               |
| `payments`                                                                     | `idempotencyKey`                            | repeat payment initiation reuses the row                    |
| `payments`                                                                     | `externalId`                                | provider transaction id                                     |
| `refunds`                                                                      | `idempotencyKey`, `externalId`              | refund idempotency anchor                                   |
| `webhook_events`                                                               | `(provider, externalEventId)`               | replay/duplicate protection                                 |
| `reviews`                                                                      | `(bookingId, bookableId)`                   | one review per bookable per booking                         |
| `wishlist_items`                                                               | `(userId, placeId)`, `(userId, businessId)` | no duplicate saves (NULLs ignored by PG)                    |
| `media`                                                                        | `storageKey`                                | one DB row per stored object                                |
| `media_likes`                                                                  | `(mediaId, userId)`                         | idempotent likes                                            |
| `*_translations`                                                               | `(entityId, locale)`                        | one translation per locale                                  |
| `places`, `content`, `businesses`, `bookables`, `destinations`, `media_albums` | `slug`                                      | stable public URLs                                          |
| `settings`, `feature_flags`, `rate_limits`                                     | `key`                                       | single row per key                                          |

Indexes of note: `bookings (customerId, createdAt)`, `(businessId, status)`,
`(status, holdExpiresAt)` (hold expiry scans); `prices (bookableId, active)`;
`availability_rules (bookableId, startDate)`; `media (status, createdAt)`;
`audit_logs (action, createdAt)`, `(entityType, entityId)`,
`(actorId, createdAt)`; `notifications (userId, readAt)`; `users (role, status)`.

## 5. Transactions and locking

- **Double-booking prevention** (`src/lib/booking/service.ts`): one
  transaction that runs `SELECT id FROM "bookables" WHERE id = … FOR UPDATE`,
  then re-prices and re-checks availability _with the lock held_, then inserts
  the booking + item + commission snapshot. Concurrent writers for the same
  bookable serialise. See [booking.md](booking.md).
- **Webhooks** (`src/lib/payments/webhook.ts`): state transitions take
  `FOR UPDATE` on the booking row, so concurrent webhook deliveries cannot
  double-apply; the unique `(provider, externalEventId)` insert rejects
  duplicates before any state change.
- **Cancellation** locks all bookables of the booking before flipping status.
- Reference collisions on `bookings.reference` are retried up to 4 times
  inside the transaction (P2002 handling).
- Cross-cutting writes (audit, notifications, analytics) run _after_ commit —
  they never block or abort a booking.

## 6. Migration workflow

| Environment     | Command                                                | Notes                                                  |
| --------------- | ------------------------------------------------------ | ------------------------------------------------------ |
| Development     | `npm run prisma:migrate` (`prisma migrate dev`)        | creates/applies a migration and regenerates the client |
| CI / production | `npm run prisma:deploy` (`prisma migrate deploy`)      | applies pending migrations only, never prompts         |
| Client          | `npm run prisma:generate` (also runs on `postinstall`) |                                                        |

Migrations present at time of writing:
`20261009010730_init`, `20261009010936_place_type_localization`
(provider `postgresql`, `migration_lock.toml`).

Keep migrations backward-compatible with the previous release (expand →
migrate → contract) so rollbacks can redeploy the old build without rolling
back schema — see [deployment.md](deployment.md).

## 7. Seed policy (`prisma/seed.ts`)

Seeded — operational and project-provided data only:

- Destination `imedwan` (PUBLISHED, `PROJECT_PROVIDED`) with en/fr/ar
  translations (slogans/summaries exactly as written there).
- **Exactly five places**: `amda`, `amajr`, `imi-nisli`, `taghia`,
  `tizgzit` — en/fr/ar name/type/summary copied verbatim from the project
  brief, each `PUBLISHED` + `PROJECT_PROVIDED`.
- All `SETTING_DEFAULTS` (19 keys) — created with `update: {}`, so operator
  changes are never overwritten by re-seeding.
- All 8 feature flags — created **disabled**.
- The RBAC matrix mirrored from `src/lib/auth/permissions.ts` (37 permissions,
  6 roles) for auditability.
- Development admin: `admin@visitimedwan.local`, created **only** when the
  `ADMIN_PASSWORD` env var is set (put it in your local `.env`, which is never
  committed — no default password ships with the repository). Without that var
  the step is skipped (logged). The same rule applies in production, where the
  admin is created only when `ADMIN_EMAIL` **and** `ADMIN_PASSWORD` are set.

Never seeded: providers/businesses, prices, availability, bookings, payments,
reviews, coordinates, or any destination fact beyond the rows above. Unknown
fields stay `null` in the database and render as explicit "pending" states in
the UI.

See also: [configuration.md](configuration.md) (settings/flags),
[architecture.md](architecture.md), [api.md](api.md).
