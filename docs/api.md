# HTTP API — Visit Imedwan

All endpoints live under **`/api/v1`** (`src/app/api/v1/**`) and are built with
the `createHandler` factory (`src/lib/api/handler.ts`). Routes are thin:
validate → authorise → call a service in `src/lib` → serialize.

## 1. Request pipeline (order matters)

Every `createHandler` route runs, in order:

1. request id (UUID) + access logging
2. method check (`405 METHOD_NOT_ALLOWED`)
3. **CSRF/origin check** on mutating methods (POST/PUT/PATCH/DELETE):
   `sec-fetch-site` must be `same-origin`/`none`; when an `Origin` header is
   present it must match `Host` or `APP_URL` → otherwise `403 CSRF_REJECTED`
4. Zod validation of params / query / JSON body (body capped at 2 MB;
   malformed JSON → `400 INVALID_JSON`)
5. authentication (`auth: "none" | "optional" | "required"` — session cookie),
   then optional `verifiedEmail` gate (`401 EMAIL_NOT_VERIFIED`)
6. RBAC (`permission:` / `roles:` from the [permission matrix](rbac.md))
7. rate limiting (per-route rule from `RATE_LIMITS`, DB-backed fixed window,
   **fails closed**) — applied after auth so the key can include the user
8. handler execution
9. uniform error mapping — internals never leak (`500 INTERNAL_ERROR`)

Three routes intentionally bypass the factory: `GET /health`,
`POST /media/upload` (multipart), `POST /payments/webhook/[provider]`
(raw body must survive byte-for-byte for HMAC), plus the plain
`GET /media/file/[...key]`, `GET /payments/mock/checkout` and
`POST /payments/mock/simulate`.

## 2. Conventions

| Topic       | Convention                                                                                                                                                                                                        |
| ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Success     | `{ "data": …, "requestId": "uuid" }` (list endpoints add `pagination`)                                                                                                                                            |
| Error       | `{ "error": { "code": "MACHINE_CODE", "message": "…" , "details": {…}? } }` — `details` present on validation errors; the rate-limit helper may spread extra keys (e.g. `retry-after`) alongside `code`/`message` |
| Pagination  | `GET ?page=1&perPage=20` → `{ data: T[], pagination: { page, perPage, total, totalPages }, requestId }` (`perPage` capped at 100 by `parsePagination`)                                                            |
| Validation  | `400` + `VALIDATION_ERROR` + `details: { "<path>": ["msg", …] }`                                                                                                                                                  |
| Auth        | `vi_session` cookie (HttpOnly, SameSite=Lax); no bearer tokens                                                                                                                                                    |
| CSRF        | Origin / `sec-fetch-site` checks (see pipeline #3) — no CSRF token needed                                                                                                                                         |
| Dates       | `YYYY-MM-DD` strings only (regex-validated), date-only semantics                                                                                                                                                  |
| Money       | Serialized as **strings** (`"1200.00"`) with a separate `currency`                                                                                                                                                |
| Idempotency | `Idempotency-Key: <8–100 chars>` header on `POST /bookings` and `POST /payments`                                                                                                                                  |
| Rate limits | `429` + `RATE_LIMITED`; header key `retry-after` (seconds) in `details`                                                                                                                                           |

## 3. Error codes

Framework-level (from `src/lib/api/errors.ts` / `handler.ts`):
`VALIDATION_ERROR` (400), `INVALID_JSON` (400), `UNAUTHENTICATED` (401),
`EMAIL_NOT_VERIFIED` (401), `FORBIDDEN` (403), `CSRF_REJECTED` (403),
`NOT_FOUND` (404), `METHOD_NOT_ALLOWED` (405), `PAYLOAD_TOO_LARGE` (413),
`RATE_LIMITED` (429), `INTERNAL_ERROR` (500), `UNKNOWN_PROVIDER` /
`INVALID_SIGNATURE` / `AMOUNT_MISMATCH` / `PROCESSING_ERROR` (webhook).

Domain codes observed in the codebase (status → codes):

| Status | Codes                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| ------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `WEAK_PASSWORD`, `INVALID_TOKEN`, `INVALID_PASSWORD`, `DATE_IN_PAST`, `INVALID_DATE_RANGE`, `DATE_RANGE_TOO_LONG`, `INVALID_GUESTS`, `GUESTS_EXCEED_CAPACITY`, `INVALID_DATE`, `INVALID_RANGE`, `INVALID_QUERY`, `DEPOSIT_NOT_AVAILABLE`, `INVALID_REFUND_AMOUNT`, `UNKNOWN_SETTING`, `SELF_MODIFICATION`, `INVALID_FORM`, `FILE_REQUIRED`, `ALT_INVALID`, `BAD_SUBJECT`, `BAD_KEY`, `EMPTY`, `TOO_LARGE`, `UNSUPPORTED_TYPE`, `TYPE_MISMATCH` |
| 401    | `UNAUTHENTICATED`, `EMAIL_NOT_VERIFIED`                                                                                                                                                                                                                                                                                                                                                                                                        |
| 403    | `FORBIDDEN`, `CSRF_REJECTED`                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 404    | `NOT_FOUND` (generic; routes substitute messages like "Booking not found")                                                                                                                                                                                                                                                                                                                                                                     |
| 409    | `EMAIL_TAKEN`, `PRICE_NOT_CONFIGURED`, `NOT_AVAILABLE`, `NOT_CANCELLABLE`, `NOT_COMPLETABLE`, `NOT_COMPLETED`, `WINDOW_CLOSED`, `ALREADY_REVIEWED`, `BOOKING_CLOSED`, `ALREADY_PAID`, `NOTHING_TO_REFUND`, `NO_PAYMENT`, `ONE_BUSINESS`, `SLUG_TAKEN`, `INVALID_STATE`                                                                                                                                                                         |
| 413    | `PAYLOAD_TOO_LARGE`                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 429    | `RATE_LIMITED`, `ACCOUNT_LOCKED`                                                                                                                                                                                                                                                                                                                                                                                                               |
| 500    | `INTERNAL_ERROR`                                                                                                                                                                                                                                                                                                                                                                                                                               |
| 503    | `DESTINATION_NOT_FOUND` (`ApiError.serviceUnavailable` in `admin/places`)                                                                                                                                                                                                                                                                                                                                                                      |

## 4. Rate limits (`RATE_LIMITS` in `src/lib/rate-limit.ts`)

| Rule            | Limit | Window | Applied to                                        |
| --------------- | ----- | ------ | ------------------------------------------------- |
| `login`         | 10    | 5 min  | `POST /auth/login` (per IP **and** per email)     |
| `register`      | 5     | 60 min | `POST /auth/register`                             |
| `passwordReset` | 5     | 60 min | forgot / reset / change password                  |
| `emailVerify`   | 10    | 60 min | verify + resend                                   |
| `search`        | 60    | 1 min  | `GET /search`                                     |
| `booking`       | 20    | 10 min | create + cancel booking                           |
| `payment`       | 20    | 10 min | `POST /payments`, admin refund                    |
| `review`        | 5     | 60 min | `POST /reviews`                                   |
| `comment`       | 10    | 60 min | `POST /media/[id]/comments`                       |
| `upload`        | 30    | 60 min | `POST /media/upload` (keyed by user id)           |
| `generic`       | 120   | 1 min  | quote, wishlist, events                           |
| webhook         | 120   | 1 min  | `POST /payments/webhook/[provider]` (inline rule) |

Storage: DB fixed-window counters (`rate_limits` table) shared across
instances; **if the store errors, requests are blocked** (fail closed).

## 5. Endpoint inventory

Auth column: `none` (public), `optional`, `required`. Permission column shows
the `permission:` gate; several routes additionally scope queries by
`ownerId`/`customerId` (see [rbac.md](rbac.md)).

### Public content

| Endpoint                                    | Methods | Auth     | Notes                                                                           |
| ------------------------------------------- | ------- | -------- | ------------------------------------------------------------------------------- |
| `/health`                                   | GET     | none     | 200 `{"status":"ok","database":"up"}` / 503 degraded, `cache-control: no-store` |
| `/config`                                   | GET     | none     | payment/map provider, currency, 8 feature flags                                 |
| `/destination`                              | GET     | optional | published destination + hero media                                              |
| `/places`, `/places/[slug]`                 | GET     | optional | PUBLISHED only                                                                  |
| `/accommodations`, `/accommodations/[slug]` | GET     | optional |                                                                                 |
| `/guides`, `/guides/[slug]`                 | GET     | optional |                                                                                 |
| `/content`, `/content/[slug]`               | GET     | optional | journal/editorial                                                               |
| `/search`                                   | GET     | optional | rate-limited                                                                    |
| `/bookables/[id]/availability`              | GET     | none     | public calendar, 30-day default / 90-day cap                                    |
| `/bookables/[id]/reviews`                   | GET     | none     | approved reviews                                                                |
| `/events`                                   | POST    | optional | whitelisted analytics events (small payload cap)                                |
| `/media/file/[...key]`                      | GET     | none*    | *PUBLISHED/APPROVED media only; otherwise uploader or `media.moderate`          |

### Auth

| Endpoint                                        | Methods | Auth     | Rate limit           |
| ----------------------------------------------- | ------- | -------- | -------------------- |
| `/auth/register`                                | POST    | none     | `register`           |
| `/auth/login`                                   | POST    | none     | `login` (IP + email) |
| `/auth/logout`                                  | POST    | optional | —                    |
| `/auth/me`                                      | GET     | optional | —                    |
| `/auth/password-forgot`, `/auth/password-reset` | POST    | none     | `passwordReset`      |
| `/auth/password-change`                         | POST    | required | `passwordReset`      |
| `/auth/verify-email`                            | POST    | none     | `emailVerify`        |
| `/auth/verify-email/resend`                     | POST    | required | `emailVerify`        |

### Bookings & payments (customer)

| Endpoint                       | Methods   | Auth                      | Notes                                                                |
| ------------------------------ | --------- | ------------------------- | -------------------------------------------------------------------- |
| `/bookings/quote`              | POST      | optional                  | authoritative price + availability preview                           |
| `/bookings`                    | POST      | required + verified email | `Idempotency-Key` header; 201                                        |
| `/bookings/mine`               | GET       | required                  | paginated                                                            |
| `/bookings/[id]`               | GET       | required                  | own booking only (scoped by customerId)                              |
| `/bookings/[id]/cancel`        | POST      | required                  |                                                                      |
| `/payments`                    | POST      | required                  | `mode: FULL \| DEPOSIT`, `Idempotency-Key`                           |
| `/payments/[id]`               | GET       | required                  | own payment                                                          |
| `/payments/webhook/[provider]` | POST      | none                      | HMAC-signed, raw body, dedupe                                        |
| `/payments/mock/checkout`      | GET       | none                      | **dev only** (404 in production or when provider ≠ mock)             |
| `/payments/mock/simulate`      | POST      | none                      | **dev only**; emits a signed event through the real webhook pipeline |
| `/reviews`                     | POST      | required + verified email | completed-booking gate                                               |
| `/reviews/[id]`                | PATCH     | required                  | `review.moderate`                                                    |
| `/wishlist`                    | GET, POST | required                  |                                                                      |
| `/wishlist/[target]/[id]`      | DELETE    | required                  | target = `place` \| `accommodation` \| `guide`                       |

### Notifications & account

| Endpoint                          | Methods   | Auth                           |
| --------------------------------- | --------- | ------------------------------ |
| `/notifications`                  | GET, POST | required (POST marks all read) |
| `/account/overview`               | GET       | required                       |
| `/account/profile`                | PATCH     | required                       |
| `/account/notifications`          | GET       | required                       |
| `/account/notifications/read-all` | POST      | required                       |

### Media

| Endpoint               | Methods   | Auth                             | Notes                                                                   |
| ---------------------- | --------- | -------------------------------- | ----------------------------------------------------------------------- |
| `/media`               | GET       | optional                         | gallery listing                                                         |
| `/media/upload`        | POST      | required                         | multipart; needs `media.upload` + subject authorization; `alt` required |
| `/media/[id]/comments` | GET, POST | none / required + verified email | one-level replies                                                       |
| `/media/[id]/like`     | POST      | required                         |                                                                         |

### Provider portal (`ownerId`-scoped)

| Endpoint                                        | Methods       | Auth     | Permission                |
| ----------------------------------------------- | ------------- | -------- | ------------------------- |
| `/provider/business`                            | GET, POST     | required | `business.create`         |
| `/provider/business/[id]`                       | PATCH         | required | `business.update`         |
| `/provider/business/[id]/submit`                | POST          | required | `business.submit`         |
| `/provider/bookables`                           | GET, POST     | required | `service.manage`          |
| `/provider/bookables/[id]`                      | PATCH, DELETE | required | `service.manage`          |
| `/provider/bookables/[id]/prices`               | GET, PUT      | required | `pricing.manage`          |
| `/provider/bookables/[id]/rules`                | GET, PUT      | required | `availability.manage`     |
| `/provider/bookables/[id]/blocks`               | GET, POST     | required | `availability.manage`     |
| `/provider/bookables/[id]/blocks/[blockId]`     | DELETE        | required | owner-scoped `deleteMany` |
| `/provider/bookings`, `/provider/bookings/[id]` | GET           | required | owner-scoped query        |
| `/provider/bookings/[id]/confirm`               | POST          | required | `booking.confirm`         |
| `/provider/bookings/[id]/complete`              | POST          | required | `booking.complete`        |
| `/provider/revenue`                             | GET           | required | `revenue.read`            |
| `/provider/reviews`                             | GET           | required | owner-scoped query        |

### Admin portal

| Endpoint                                                                          | Methods     | Permission                                               |
| --------------------------------------------------------------------------------- | ----------- | -------------------------------------------------------- |
| `/admin/overview`, `/admin/analytics/overview`                                    | GET         | `analytics.read`                                         |
| `/admin/audit-logs`                                                               | GET         | `audit.read`                                             |
| `/admin/users`                                                                    | GET         | `user.read`                                              |
| `/admin/users/[id]`                                                               | GET, PATCH  | `user.read` / `user.manage` (self-modification rejected) |
| `/admin/businesses`                                                               | GET         | `business.read`                                          |
| `/admin/businesses/[id]`                                                          | GET         | `business.read`                                          |
| `/admin/businesses/[id]/approve`, `/reject`                                       | POST        | `business.approve`                                       |
| `/admin/places`                                                                   | GET, POST   | `place.manage`                                           |
| `/admin/places/[id]`, `/admin/places/[id]/workflow`                               | PATCH, POST | `place.manage`                                           |
| `/admin/content`                                                                  | GET, POST   | `content.read.draft` / `content.create`                  |
| `/admin/content/[id]`, `/admin/content/[id]/workflow`                             | PATCH, POST | `content.update`                                         |
| `/admin/media`, `/admin/media/comments`                                           | GET         | `media.moderate`                                         |
| `/admin/media/[id]`, `/admin/media/comments/[id]`                                 | PATCH       | `media.moderate`                                         |
| `/admin/reviews`                                                                  | GET         | `review.moderate`                                        |
| `/admin/reviews/[id]`                                                             | POST        | `review.moderate`                                        |
| `/admin/bookings`, `/admin/bookings/[id]`                                         | GET         | `booking.read`                                           |
| `/admin/bookings/[id]/refund`                                                     | POST        | `payment.refund` (+ `payment` rate limit)                |
| `/admin/payments`                                                                 | GET         | `payment.read`                                           |
| `/admin/bookables`, `/admin/bookables/[id]`, `/admin/bookables/[id]/availability` | GET         | `business.read`                                          |
| `/admin/settings`                                                                 | GET, PUT    | `settings.read` / `settings.manage`                      |
| `/admin/flags`                                                                    | GET, PUT    | `settings.read` / `settings.manage`                      |

## 6. Examples

### Login

> The development admin password is intentionally not published. The seed
> creates the admin account from your local `ADMIN_PASSWORD` env var
> (see [database.md](database.md)).

```http
POST /api/v1/auth/login
Content-Type: application/json
Origin: http://localhost:3000

{ "email": "admin@visitimedwan.local", "password": "<your ADMIN_PASSWORD value>" }
```

```json
{
  "data": {
    "user": {
      "id": "c...",
      "email": "admin@visitimedwan.local",
      "name": "Platform Administrator",
      "role": "SUPER_ADMIN",
      "locale": "en",
      "emailVerifiedAt": "2026-10-09T..."
    }
  },
  "requestId": "5f0b…"
}
```

Sets the `vi_session` cookie. Wrong password →
`401 { "error": { "code": "UNAUTHENTICATED", "message": "Email or password is incorrect" } }`;
5 failures → `429 { "error": { "code": "ACCOUNT_LOCKED", … } }`.

### Quote

```http
POST /api/v1/bookings/quote
Content-Type: application/json

{ "bookableId": "clx...", "startDate": "2026-11-01",
  "endDate": "2026-11-04", "guests": 2 }
```

```json
{
  "data": {
    "bookable": {
      "id": "clx...",
      "category": "ACCOMMODATION",
      "name": "Room 1",
      "businessId": "clx...",
      "businessName": "…",
      "businessSlug": "…"
    },
    "startDate": "2026-11-01",
    "endDate": "2026-11-04",
    "nights": 3,
    "days": 4,
    "guests": 2,
    "pricing": {
      "unit": "NIGHT",
      "unitPrice": "250.00",
      "currency": "MAD",
      "quantity": 3,
      "subtotal": "750.00"
    },
    "deposit": null,
    "total": "750.00",
    "currency": "MAD",
    "cancellation": { "text": null, "freeCancellationHours": null },
    "availability": { "available": true, "unavailableDates": [] },
    "holdMinutes": 30
  },
  "requestId": "…"
}
```

(Numbers above are shape examples only — the platform never seeds prices;
`PRICE_NOT_CONFIGURED` (409) is returned until a provider sets real prices.)

### Create booking

```http
POST /api/v1/bookings
Cookie: vi_session=…
Idempotency-Key: 6f1c2f0e-3a4f-4a4a-9b0d-7f0a2f5c1111
Content-Type: application/json

{ "bookableId": "clx...", "startDate": "2026-11-01",
  "endDate": "2026-11-04", "guests": 2, "paymentMode": "FULL" }
```

`201 { "data": { "booking": { "reference": "VI-8F3K2A", "status": "PENDING",
"paymentStatus": "UNPAID", "total": "750.00", … }, "idempotent": false },
"requestId": "…" }` — replaying the same key returns the original booking with
`"idempotent": true`. Unverified email → `401 EMAIL_NOT_VERIFIED`;
unavailable dates → `409 NOT_AVAILABLE`.

### Webhook

```http
POST /api/v1/payments/webhook/mock
Content-Type: application/json
x-vi-signature: sha256=<hex hmac of the raw body>

{ "id": "mockevt_…", "type": "payment.succeeded",
  "externalPaymentId": "mockpay_…", "amount": "750.00", "currency": "MAD" }
```

Responses: `200 {"received":true,"applied":true}` ·
`200 {"received":true,"duplicate":true}` (already-seen event id) ·
`401 INVALID_SIGNATURE` · `400 AMOUNT_MISMATCH` · `404 PAYMENT_NOT_FOUND` ·
`409 INVALID_STATE` · `500 PROCESSING_ERROR`.

See also: [authentication.md](authentication.md), [booking.md](booking.md),
[payments.md](payments.md), [security.md](security.md).
