# Testing — Visit Imedwan

## 1. Layers and commands

| Layer       | Runner     | Command                              | Needs DB?                       |
| ----------- | ---------- | ------------------------------------ | ------------------------------- |
| Unit        | Vitest     | `npm test` (or `npm run test:watch`) | no                              |
| Integration | Vitest     | `npm test` (same run)                | yes — `visit_imedwan_test` only |
| E2E         | Playwright | `npm run test:e2e`                   | yes — plus a production build   |

`vitest.config.ts`: node environment, includes `tests/**/*.test.ts`,
`setupFiles: ["tests/setup.ts"]`, **`fileParallelism: false`** (integration
files share one test database → serial execution), `testTimeout` 30 s /
`hookTimeout` 60 s, alias `@ → src`, v8 coverage over `src/lib/**`
(`text-summary`).

### `tests/setup.ts` (what it actually does)

Sets **defaults only** (`??=` — explicit env wins): `NODE_ENV=test`,
`DATABASE_URL` and `TEST_DATABASE_URL` → the embedded test DB on port 5433,
`APP_URL`, `PAYMENT_PROVIDER=none`, `MAIL_DRIVER=console`,
`STORAGE_DRIVER=local`, a test `SESSION_SECRET`, `SESSION_COOKIE_NAME=vi_session`,
`SESSION_TTL_HOURS=720`. It does **not** create schema — the test database
must already exist (`npm run db:start` creates `visit_imedwan_test`) and be
migrated. Never point tests at the dev/prod database.

## 2. What exists today (read from disk)

| File                                | Covers (one line)                                                                                                                                                                                                                                                                                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tests/unit/dates.test.ts`          | date-only parsing/validation, UTC add/diff, inclusive-exclusive `eachDate`, `todayUtc`, `maxDate`                                                                                                                                                                                                                               |
| `tests/unit/pricing.test.ts`        | `computeQuantity` per unit, `pickPrice` base/seasonal/priority rules, money rounding, deposit & commission math                                                                                                                                                                                                                 |
| `tests/unit/permissions.test.ts`    | RBAC matrix invariants (no dups/orphans, SUPER_ADMIN complete, ADMIN ⊂ SUPER_ADMIN, CUSTOMER powerless, provider roles identical)                                                                                                                                                                                               |
| `tests/unit/i18n.test.ts`           | dictionary key parity, brand rules (untranslated "Visit Imedwan", destination scripts, official slogans), `t()` interpolation                                                                                                                                                                                                   |
| `tests/unit/misc.test.ts`           | `cn()` helper, locale config (exactly 3 locales, RTL only for `ar`), currency/number formatting                                                                                                                                                                                                                                 |
| `tests/integration/auth.test.ts`    | register (argon2id + token), single-use/expired verification, login anti-enumeration + 5-fail lockout + recovery, password reset cycle + session revocation, `changePassword` keeps only current session                                                                                                                        |
| `tests/integration/booking.test.ts` | server-side quote pricing, PENDING creation with hold, double-booking refusal, **concurrent creators (exactly one wins)**, idempotency replay + cross-customer refusal, no-rule → unavailable, GUIDE per-person slots, availability blocks, cancellation frees inventory, completion, **stale hold expiry**, reference alphabet |

No `e2e/` directory exists yet — `playwright.config.ts` is ready
(`testDir: ./e2e`, Chromium only, `webServer: npm run start` on port 3000,
runs against the **production build**, traces on failure), but
`npm run test:e2e` currently has **no tests to run**.

> The test suite is under active development by parallel sessions — re-glob
> `tests/**` before treating this table as complete.

## 3. Required test matrix — honest status

| Scenario                                                      | Status          | Where / gap                                                                          |
| ------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------ |
| Registration                                                  | **IMPLEMENTED** | `integration/auth.test.ts` (incl. duplicate email, weak password)                    |
| Login (incl. lockout, anti-enumeration)                       | **IMPLEMENTED** | `integration/auth.test.ts`                                                           |
| Provider registration intent                                  | **NOT YET**     | `wantsProvider` flag is audited but untested                                         |
| Business creation (provider portal)                           | **NOT YET**     | no `provider/business` test yet                                                      |
| Admin approval workflow (approve/reject)                      | **NOT YET**     |                                                                                      |
| Accommodation / guide (bookable) creation                     | **NOT YET**     |                                                                                      |
| Availability (rules, blocks, occupancy)                       | **IMPLEMENTED** | `integration/booking.test.ts` (rules, blocks, guide slots)                           |
| Booking creation + double booking + concurrency + idempotency | **IMPLEMENTED** | `integration/booking.test.ts`                                                        |
| Cancellation + hold expiry                                    | **IMPLEMENTED** | `integration/booking.test.ts`                                                        |
| Completion                                                    | **IMPLEMENTED** | `integration/booking.test.ts`                                                        |
| Deposit payment flow                                          | **NOT YET**     | needs `PAYMENT_PROVIDER=mock` fixture                                                |
| Full payment success                                          | **NOT YET**     | webhook pipeline untested end-to-end                                                 |
| Failed payment                                                | **NOT YET**     |                                                                                      |
| Refund issuance/settlement                                    | **NOT YET**     |                                                                                      |
| Duplicate webhook delivery                                    | **NOT YET**     | (design supports it — unique `(provider, externalEventId)` + idempotent transitions) |
| Review eligibility (completed + window + once)                | **NOT YET**     |                                                                                      |
| IDOR (foreign booking/payment/media access)                   | **NOT YET**     | scoped queries exist; no route-level test asserting 404-for-foreign                  |
| Privilege escalation                                          | **PARTIAL**     | matrix invariants unit-tested; no route-level 403 tests yet                          |
| E2E (locale routing/RTL, booking happy path, moderation)      | **NOT YET**     | `e2e/` empty                                                                         |

Integration tests exercise services (and, where present, route handlers as
`Request → Response`) against the real embedded PostgreSQL; unit tests are
pure functions with no database.

## 4. Playwright prerequisites (when `e2e/` lands)

1. `npm run db:start`
2. `npm run prisma:deploy && npm run prisma:seed`
3. `npm run build` — E2E runs against `next start` (the config reuses an
   existing server locally, starts one in CI)
4. `npm run test:e2e` (override base URL with `E2E_BASE_URL`)

## 5. Related quality gates

- `npm run typecheck` — strict TS (`noUncheckedIndexedAccess` included);
  also enforces dictionary parity and `permission:` string validity.
- `npm run lint`, `npm run format:check` (Prettier).
- Coverage: `vitest --coverage` reports `src/lib/**` only.

See also: [architecture.md](architecture.md) (strategy),
[booking.md](booking.md), [authentication.md](authentication.md),
[roadmap.md](roadmap.md).
