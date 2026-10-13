# Logging & observability — Visit Imedwan

Implementation: `src/lib/logger.ts` (structured logger),
`src/lib/audit.ts` (business/security audit trail), request logging in
`src/lib/api/handler.ts`.

## 1. Structured logger

- **Levels**: `debug` < `info` < `warn` < `error`. Threshold from `LOG_LEVEL`
  (default `info`); unknown values fall back to `info`. Each level writes to
  the matching console stream.
- **Format**: `NODE_ENV=production` → **one JSON object per line**
  (`{ ts, level, msg, ...fields }`) for log collectors; development →
  readable single-line text (`2026-10-09T… INFO  msg {json fields}`).
- **Child loggers**: `logger.child({ requestId })` binds fields to every
  subsequent call.
- Failures are logged, never thrown — logging cannot break a request.

## 2. Redaction (never logged)

The logger deep-redacts these keys (case-insensitive) to `"[redacted]"` —
**21 keys**: `password`, `passwordhash`, `newpassword`, `currentpassword`,
`token`, `tokenhash`, `accesstoken`, `refreshtoken`, `sessiontoken`,
`secret`, `sessionsecret`, `apikey`, `authorization`, `cookie`, `setcookie`,
`cardnumber`, `cvv`, `cvc`, `pan`, `pin`, `payload` (webhook payloads may
carry provider data).

Structural guards: strings > 4 000 chars → first 1 000 + `…[truncated]`;
object string values > 2 000 → first 500 + marker; arrays sliced to 20 items;
depth capped at 6 → `"[deep]"`; `Error` values serialize to
`{ name, message, stack }`.

`audit.ts` runs metadata through its **own independent** redaction list
(12 keys: `password`, `passwordhash`, `token`, `tokenhash`, `secret`,
`apikey`, `authorization`, `cookie`, `cardnumber`, `cvv`, `cvc`, `payload`;
depth 5, arrays 20, strings > 2 000 → 500) so audit rows never carry secrets
either.

Never logged anywhere: passwords/hashes, session or auth tokens, cookies,
`SESSION_SECRET`/SMTP/S3 credentials, card data, raw webhook payloads.
Honest caveat: the **dev-only** `console` mail driver logs a 200-char preview
of each email body (which includes verification/reset links) — acceptable in
local development; production uses `MAIL_DRIVER=smtp`, which logs no body.

## 3. Request patterns

| Event        | Level   | When                      | Fields                                                          |
| ------------ | ------- | ------------------------- | --------------------------------------------------------------- |
| `api_access` | `debug` | every request (`finally`) | `requestId`, `method`, `path`, `status`, `durationMs`, `userId` |
| `api_error`  | `error` | any 5xx                   | `requestId`, `method`, `url`, `error`, `stack`                  |
| `api_denied` | `warn`  | 401/403 responses         | `requestId`, `method`, `url`, `status`                          |

Other notable patterns: `rate_limited`, `rate_limit_store_error` (limiter
store failure — the request is blocked, fail closed),
`webhook_signature_invalid`, `webhook_duplicate` (`info`),
`webhook_amount_mismatch` (`error`), `webhook_processing_failed`,
`booking_create_failed`, `notify_failed`, `notify_email_failed`,
`mail_console` / `mail_send_failed`, `verification_email_failed`,
`payment_provider_unknown`, `audit_write_failed`, `health_db_down`.

Audit rows (`GET /api/v1/admin/audit-logs`, permission `audit.read`) are the
queryable security trail: actor, action, entity, redacted metadata, IP,
user-agent — 29 named actions in `AUDIT_ACTIONS` plus inline actions
(`auth.password.changed`, `business.created`, `content.created`,
`place.created`, `media.uploaded`, `media.moderated`, `media.comment.created`,
`media.comment.moderated`, `payment.refunded`). Audit writes never fail the
main operation but log `audit_write_failed` loudly.

## 4. What is intentionally absent / future

- No third-party APM or metrics backend is integrated — stdout is the
  interface; ship it to your collector.
- Practical hooks for future monitoring:
  - `GET /api/v1/health` (200/503 + `database` up/down, latency) for probes
    and uptime checks;
  - `api_access.durationMs` per request for latency percentiles;
  - counters derivable from logs: `rate_limited`, `api_denied`,
    `webhook_*`, `api_error`;
  - `audit_logs`/`analytics_events` tables for business-level dashboards
    (`/admin/analytics/overview` already aggregates them).
- `LOG_LEVEL=debug` enables per-request access lines in development.

See also: [security.md](security.md) (audit & data protection),
[deployment.md](deployment.md) (health checks), [api.md](api.md)
(request ids).
