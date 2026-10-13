# Visit Imedwan

Destination-first tourism platform for **Imedwan / Asghmo Ait Zaghar**, Ouarzazate,
Morocco — public editorial site, customer accounts, booking engine, provider
portal and admin portal, in Arabic / French / English (RTL-aware).

> Brand rule: **"Visit Imedwan" is never translated**. Destination facts are
> published with their verification status and are never invented — unknown
> values (coordinates, prices, hours) stay `null` and render as explicit
> "pending" states.

## Stack

- **Next.js 15** (App Router, locale-first URLs under `/{en|fr|ar}`) + TypeScript strict
- **PostgreSQL 17** via `embedded-postgres` (local dev) + **Prisma 6** (schema, migrations, seed)
- **Tailwind v4** design tokens (Forest Green / Sky Blue / Rocky Blue / Peach Yellow)
- **Argon2id** password hashing (`@node-rs/argon2`), database-backed sessions
- **Zod** validation, versioned HTTP API under `/api/v1`
- **Vitest** (unit/integration) + **Playwright** (e2e)

## Getting started

```powershell
npm install                    # prisma generate runs via postinstall
node scripts/db.mjs start      # embedded PostgreSQL on port 5433 (data in .data/pg)
npm run prisma:migrate         # or: npm run prisma:deploy (CI/prod)
npm run prisma:seed            # destination, 5 places, RBAC, settings, dev admin
npm run dev                    # http://localhost:3000 → redirects to /en
```

Dev admin (seeded — change immediately): printed by `npm run prisma:seed`
(`admin@visitimedwan.local`).

## Scripts

| Script                                                     | Purpose              |
| ---------------------------------------------------------- | -------------------- |
| `npm run dev` / `build` / `start`                          | Next.js              |
| `npm run typecheck` / `lint` / `format`                    | TS, ESLint, Prettier |
| `npm run test` / `test:e2e`                                | Vitest, Playwright   |
| `node scripts/db.mjs start\|stop\|status`                  | embedded PostgreSQL  |
| `npm run prisma:migrate` / `prisma:seed` / `prisma:studio` | database             |

## Structure

```
src/
  app/
    [locale]/           # root layout + all pages (en | fr | ar), RTL for ar
    api/v1/             # versioned HTTP API (auth, bookings, payments, media, provider, admin)
  components/
    ui/                 # design-system primitives (Button, Field, Card, Badge…)
    layout/             # header / footer / logo / language switcher
    discovery|editorial|auth|account|booking|provider|admin  # feature UI
  lib/
    api/                # createHandler route factory, client fetch wrapper, errors
    auth/               # passwords, sessions, RBAC (code-first permission matrix)
    booking/            # pricing, availability, booking state machine
    payments/           # provider registry (none|mock), signed webhooks
    data/               # typed public data access (places, businesses, content)
    i18n (src/i18n)     # en/fr/ar dictionaries (type-enforced parity)
prisma/                 # schema, migrations, seed (project-provided facts only)
docs/                   # 16 guides: api, booking, payments, security, testing…
```

## Key invariants

- **Money is computed server-side** — quote → booking → payment; the client
  never supplies an amount.
- **Booking state changes come only from HMAC-signed webhooks** (or explicit
  role-gated actions); amount mismatches fail closed.
- **RBAC is code-first** (`src/lib/auth/permissions.ts`, mirrored into the DB
  by the seed for audit), ownership checks are scoped queries (IDOR defence).
- **Payments default to `none`** (no adapter configured); `mock` refuses to
  run in production.
- Media uploads are magic-byte validated, size-limited, and served only after
  moderation (`PENDING_REVIEW` → uploader/admin only).

See `docs/security.md` for the full security model and
`docs/architecture.md` for module-level design. The rest of `docs/`
covers the API, authentication, RBAC, booking, payments, database, media,
i18n, configuration, testing, logging, notifications, deployment and the
V1 roadmap. End-to-end specs live in `tests/e2e/` (`npm run test:e2e`,
first run: `npx playwright install chromium`).
