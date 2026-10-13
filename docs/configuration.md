# Configuration — Visit Imedwan

Three configuration layers: **environment variables** (boot-time, secrets),
**Settings table** (runtime business numbers, admin-editable), **feature
flags** (runtime booleans, admin-editable). Typed access goes through
`src/lib/env.ts` and `src/lib/settings.ts` — never read `process.env`
ad hoc.

## 1. Environment variables

Source template: `.env.example` (copy to `.env`; **never commit `.env`**).
Defaults shown are the code defaults from `src/lib/env.ts`.

| Variable                                              | Purpose                                                                             | Default                              | Required in production                                                            |
| ----------------------------------------------------- | ----------------------------------------------------------------------------------- | ------------------------------------ | --------------------------------------------------------------------------------- |
| `NODE_ENV`                                            | `development`/`test`/`production` gates (Secure cookies, mock payments, log format) | `development`                        | yes (`production`)                                                                |
| `APP_URL`                                             | canonical origin — links, CSRF origin check, email/SEO URLs                         | `http://localhost:3000`              | **yes**                                                                           |
| `DATABASE_URL`                                        | PostgreSQL connection string                                                        | falls back to `TEST_DATABASE_URL`    | **yes**                                                                           |
| `TEST_DATABASE_URL`                                   | integration-test DB (`visit_imedwan_test`)                                          | embedded test URL                    | tests only                                                                        |
| `SESSION_SECRET`                                      | session signing/validation secret                                                   | insecure dev default (non-prod only) | **yes — random ≥32 chars**; boot fails if missing/shorter (`assertRuntimeConfig`) |
| `SESSION_COOKIE_NAME`                                 | session cookie name                                                                 | `vi_session`                         | optional                                                                          |
| `SESSION_TTL_HOURS`                                   | session lifetime                                                                    | `720` (30 days)                      | optional                                                                          |
| `PAYMENT_PROVIDER`                                    | registry key: `none` \| `mock` (+ future providers)                                 | `none`                               | **yes, set deliberately** — `mock` is rejected in production                      |
| `PAYMENT_WEBHOOK_SECRET`                              | HMAC secret for provider webhooks (mock needs 16+ chars)                            | empty                                | **yes** once a provider is configured                                             |
| `STORAGE_DRIVER`                                      | `local` \| `s3`                                                                     | `local`                              | **yes: `s3`**                                                                     |
| `LOCAL_STORAGE_DIR`                                   | local upload root                                                                   | `.data/media`                        | n/a with S3                                                                       |
| `S3_ENDPOINT`                                         | S3-compatible endpoint (optional for AWS)                                           | empty                                | as needed                                                                         |
| `S3_REGION`                                           | region                                                                              | `auto`                               | **yes** with S3                                                                   |
| `S3_BUCKET`                                           | bucket                                                                              | empty                                | **yes** with S3                                                                   |
| `S3_ACCESS_KEY_ID` / `S3_SECRET_ACCESS_KEY`           | credentials                                                                         | empty                                | **yes** with S3                                                                   |
| `S3_PUBLIC_URL`                                       | public base URL (unused in V1 — files serve via app route)                          | empty                                | optional                                                                          |
| `MAIL_DRIVER`                                         | `console` \| `smtp`                                                                 | `console`                            | **yes: `smtp`**                                                                   |
| `MAIL_FROM`                                           | From address                                                                        | `hello@visitimedwan.example`         | **yes** (real domain)                                                             |
| `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` | SMTP transport (port 465 ⇒ implicit TLS)                                            | empty / `587`                        | **yes** with `smtp`                                                               |
| `MAP_PROVIDER`                                        | `none` \| `osm` \| `mapbox` \| `google`                                             | `none`                               | choose deliberately                                                               |
| `MAPBOX_TOKEN` / `GOOGLE_MAPS_API_KEY`                | provider keys                                                                       | empty                                | when that provider is selected                                                    |
| `LOG_LEVEL`                                           | `debug`\|`info`\|`warn`\|`error`                                                    | `info`                               | optional                                                                          |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD`                      | seed-time admin creation                                                            | none (dev default admin otherwise)   | **required to seed an admin in production** — otherwise the seed skips it         |
| `DB_PORT`                                             | embedded Postgres port (`scripts/db.mjs`)                                           | `5433`                               | n/a in production                                                                 |
| `E2E_BASE_URL`                                        | Playwright target                                                                   | `http://localhost:3000`              | CI only                                                                           |

Production boot behaviour: `src/instrumentation.ts` calls
`assertRuntimeConfig()` — missing `SESSION_SECRET`/`DATABASE_URL`/`APP_URL`
(etc.) or a short `SESSION_SECRET` **throws before serving traffic**.

Generate a secret:
`node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 2. Runtime Settings (19 keys, `SETTING_DEFAULTS`)

Stored in the `settings` table (JSON `value`); reads are cached **30 s**
(`invalidateSettingCache()` on write); DB errors fall back to code defaults.

| Key                                          | Default               | Meaning                                              |
| -------------------------------------------- | --------------------- | ---------------------------------------------------- |
| `commission.default.ratePercent`             | `0`                   | platform commission, percent                         |
| `commission.ACCOMMODATION.ratePercent`       | `null`                | per-category override (null = use global)            |
| `commission.GUIDE.ratePercent`               | `null`                | per-category override                                |
| `deposit.default.enabled`                    | `false`               | deposits off by default                              |
| `deposit.default.percent`                    | `0`                   | default deposit percent                              |
| `deposit.ACCOMMODATION.enabled` / `.percent` | `null` / `null`       | category override                                    |
| `deposit.GUIDE.enabled` / `.percent`         | `null` / `null`       | category override                                    |
| `booking.holdMinutes`                        | `30`                  | how long an unpaid `PENDING` booking holds inventory |
| `review.eligibility.windowDays`              | `90`                  | days after completion in which reviews are accepted  |
| `booking.autoCompleteDays`                   | `7`                   | auto-complete threshold (job **not yet scheduled**)  |
| `media.maxImageBytes`                        | `10485760` (10 MiB)   | upload limit                                         |
| `media.maxVideoBytes`                        | `104857600` (100 MiB) | upload limit                                         |
| `media.allowedImageTypes`                    | jpeg/png/webp/avif    | MIME allowlist                                       |
| `media.allowedVideoTypes`                    | mp4/webm              | MIME allowlist                                       |
| `seo.titleTemplate`                          | `%s · Visit Imedwan`  | page title suffix                                    |
| `seo.defaultOgAlt`                           | `Visit Imedwan`       | fallback OG image alt                                |
| `currency.default`                           | `MAD`                 | default booking currency (V1: MAD only)              |

**Resolution chains** (see [booking.md](booking.md)):

- Deposit: **service → provider → category → global** (field-wise; an enabled
  deposit with a percent outside (0, 100] is disabled rather than mispriced).
- Commission: **category → global** (platform-controlled only).
- Cancellation: **service → provider → none** (`cancellationPolicyText`,
  `freeCancellationHours` on `Bookable.config` / `Business.config`).

**Editing**: `PUT /api/v1/admin/settings` (`settings.manage`) with
`{ key, value }` — unknown keys → `400 UNKNOWN_SETTING`; audited as
`settings.changed`. Seeding creates missing keys with `update: {}`, so
operator values survive re-seeds.

## 3. Feature flags (8 keys, `FEATURE_FLAG_KEYS`)

`AI_CONCIERGE`, `RESTAURANTS`, `EXPERIENCES`, `EVENTS`, `TRANSPORT`,
`MULTI_DESTINATION`, `PROMOTED_LISTINGS`, `MOBILE_APP`

- All flags are created **disabled** by the seed; `isFeatureEnabled()` returns
  `false` on any error (fail-safe: nothing fake is surfaced).
- Values are cached for 30 s alongside settings.
- **Flipping**: `PUT /api/v1/admin/flags` with
  `{ "key": "EVENTS", "enabled": true }` (permission `settings.manage`,
  audited `feature_flag.changed`); read via `GET /api/v1/admin/flags`.
- Public exposure: `GET /api/v1/config` returns the flag map plus
  `paymentConfigured`, `paymentProvider`, `mapProvider`, `currency` — the UI
  uses it to hide unbuilt surfaces honestly.
- V1 behavior: all eight flags gate _future_ modules; none of those modules
  are implemented yet (see [roadmap.md](roadmap.md)).

## 4. Drivers at a glance

| Concern  | Dev default                                    | Production setting                                |
| -------- | ---------------------------------------------- | ------------------------------------------------- |
| Database | embedded PG 17 (`db:start`, port 5433)         | managed PostgreSQL + `DATABASE_URL`               |
| Payments | `none` (honest) or `mock` for testing          | real adapter (to be implemented) + webhook secret |
| Storage  | `local`                                        | `STORAGE_DRIVER=s3` + `S3_*`                      |
| Mail     | `console` (logged, never faked as delivered)   | `MAIL_DRIVER=smtp` + `SMTP_*`                     |
| Maps     | `none` (coordinates render only when verified) | `MAP_PROVIDER` + key                              |
| Logs     | readable single-line                           | JSON lines (`NODE_ENV=production`)                |

See also: [deployment.md](deployment.md), [database.md](database.md) (seed),
[security.md](security.md) (secret handling).
