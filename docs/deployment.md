# Deployment — Visit Imedwan

## 1. Environments

| Environment | Notes                                                                                                                                                                                     |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Development | `npm run dev`; embedded PostgreSQL 17 on port 5433 (`npm run db:start`), data in `.data/pg`; `MAIL_DRIVER=console`, `STORAGE_DRIVER=local`, `PAYMENT_PROVIDER=none` or `mock`             |
| Test        | Vitest against `visit_imedwan_test` (never the dev DB); `tests/setup.ts` sets safe defaults                                                                                               |
| Production  | `next build` + `next start`; external PostgreSQL; S3 storage; SMTP mail; `NODE_ENV=production` triggers Secure cookies, JSON logs, Strict-Transport-Security, boot-time config validation |

## 2. Production environment checklist (from `.env.example`)

| Variable                         | Guidance                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `NODE_ENV`                       | `production`                                                                                                             |
| `APP_URL`                        | public HTTPS origin (used for CSRF origin checks, emails, SEO canonicals)                                                |
| `DATABASE_URL`                   | managed PostgreSQL, credentials in the platform secret store                                                             |
| `SESSION_SECRET`                 | **random ≥32 chars** — `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`; boot fails without it |
| `PAYMENT_PROVIDER`               | real provider key once implemented; **never `mock`** (it refuses in production anyway)                                   |
| `PAYMENT_WEBHOOK_SECRET`         | strong secret agreed with the provider                                                                                   |
| `STORAGE_DRIVER`                 | `s3` + `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY` (+ `S3_ENDPOINT` for compatible services)    |
| `MAIL_DRIVER`                    | `smtp` + `SMTP_HOST/PORT/USER/PASS`, real `MAIL_FROM`                                                                    |
| `MAP_PROVIDER`                   | `none` \| `osm` \| `mapbox` \| `google` + matching key                                                                   |
| `LOG_LEVEL`                      | `info` recommended                                                                                                       |
| `ADMIN_EMAIL` + `ADMIN_PASSWORD` | set **only** while seeding the first admin, then unset                                                                   |

**Never commit secrets**: `.env` is gitignored; `.env.example` contains
placeholders only; secrets are read server-side in `src/lib/env.ts` and never
reach the client bundle.

## 3. Build & release

```powershell
npm ci                  # postinstall runs prisma generate
npm run typecheck       # strict TS + dictionary/RBAC parity
npm run lint
npm test                # unit + integration (DB up: npm run db:start)
npm run build           # next build (type errors fail the build; lint is a separate CI step)
```

Boot: `npm run start`. On production start,
`src/instrumentation.ts → assertRuntimeConfig()` fails fast when required env
is missing.

## 4. Migration strategy

1. **Apply schema before the new code serves traffic** (or design the
   migration to be backward compatible, then apply immediately after deploy —
   both orders work only if migrations follow _expand → migrate → contract_).
2. Command: `npm run prisma:deploy` (`prisma migrate deploy`) — applies
   pending migrations, never prompts, never re-introspects. Use
   `npm run prisma:migrate` (`migrate dev`) only in development.
3. Keep each migration additive where possible (add nullable column → backfill
   → switch reads → drop later) so the **previous build keeps working**
   against the new schema during a rollback window.

## 5. Seed strategy

- `npm run prisma:seed` is **idempotent** (upserts; settings/flags created
  with `update: {}` so operator values are never overwritten).
- It seeds only project-provided content (destination + exactly five places),
  settings, flags, RBAC mirror — **no fake providers, prices, reviews or
  bookings ever** (see [database.md](database.md)).
- Admin: production requires `ADMIN_EMAIL` **and** `ADMIN_PASSWORD` at seed
  time; otherwise the admin step is skipped with a log line. Rotate/remove the
  env vars afterwards; the dev default admin only exists outside production.

## 6. Health & observability

- **`GET /api/v1/health`** — returns `200 {"status":"ok","database":"up",…}`
  when `SELECT 1` succeeds, otherwise `503 {"status":"degraded",...}`;
  `cache-control: no-store`; exposes uptime/latency but no configuration or
  secrets. Use it for load-balancer readiness/liveness probes and post-release
  smoke checks.
- `scripts/health-check.mjs` — one-off data sanity script (counts places,
  destinations, permissions, admin users, settings, flags as JSON); it is
  **not** a substitute for the health endpoint.
- Logs: structured (JSON in production) with `requestId` on every API access
  line — see [logging.md](logging.md); ship stdout to your log collector.
- Audit trail: `audit_logs` table + `GET /api/v1/admin/audit-logs`
  (`audit.read`).

## 7. Rollback

1. Redeploy the **previous build** (container/artifact) — no code rollback
   tooling beyond your standard release system.
2. **Do not roll back migrations blindly.** If the failed release applied
   schema changes, either leave them (they must be backward compatible by
   policy) or write a _forward_ corrective migration.
3. Sessions/cookies survive rollbacks (DB-backed), but a `SESSION_SECRET`
   change logs everyone out — treat secret rotation as a deliberate action.
4. Re-run `GET /api/v1/health` and a smoke path (locale redirect, login) after
   rollback.

## 8. First-run sequence (fresh production)

```
npm ci
npm run prisma:deploy
ADMIN_EMAIL=… ADMIN_PASSWORD=… npm run prisma:seed   # then unset
npm run build
npm run start                                        # health: GET /api/v1/health
```

See also: [configuration.md](configuration.md), [database.md](database.md),
[testing.md](testing.md), [security.md](security.md).
