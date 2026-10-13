# Payments — Visit Imedwan

Implementation: `src/lib/payments/` (`types.ts`, `registry.ts`,
`service.ts`, `webhook.ts`, `providers/none.ts`, `providers/mock.ts`).

> **Honest status: payments are NOT operational in production.** The default
> configuration (`PAYMENT_PROVIDER=none`) performs no online charging at all,
> and the only other adapter (`mock`) refuses to run outside development. A
> real provider adapter (Stripe, CMI, …) has to be implemented and tested
> before any money can move. Until then, bookings work with an explicit
> "payments not configured" state and payment is arranged off-platform.

## 1. Abstraction

`PaymentProviderAdapter` (`types.ts`) — the application never couples to one
provider:

```ts
interface PaymentProviderAdapter {
  readonly key: string;
  isConfigured(): boolean;
  createPayment(input): Promise<CreatePaymentResult>; // requires_action | succeeded | not_configured | failed
  refundPayment(input): Promise<RefundResult>; // succeeded | not_supported | failed
  verifyWebhook(req, rawBody): Promise<VerifiedWebhookEvent>; // signature FIRST, then parse
}
```

Hard rules encoded in the interface docs: card data never reaches our servers
(redirect/hosted flows), booking state changes happen **only** through
verified server-side webhooks, and no adapter may claim success without
genuine verification.

## 2. Registry (`registry.ts`)

- Selection via `PAYMENT_PROVIDER`: **`none` (default) | `mock`** — unknown
  keys log one warning and fall back to `none`.
- Registered adapters today: `NonePaymentProvider`, `MockPaymentProvider`.
  `registerPaymentAdapter()` is the extension point for future providers;
  adding one must not touch booking logic.
- `none`: `isConfigured() === false`; `createPayment` → `not_configured`
  ("No payment provider is configured on this platform."), `refundPayment` →
  `not_supported`, `verifyWebhook` → invalid. The `Payment` row is still
  created (status `UNPAID`) so the UI can show the state honestly.
- `mock`: development/testing only (see §6).

## 3. Initiation (`POST /api/v1/payments` → `initiatePayment`)

- Auth required; booking loaded **scoped by `customerId`** (foreign bookings
  → `404`).
- Refuses: `CANCELLED`/`REFUNDED` booking (`409 BOOKING_CLOSED`), already
  fully paid (`409 ALREADY_PAID`), deposit mode without a resolved deposit
  (`400 DEPOSIT_NOT_AVAILABLE`), nothing outstanding (`409 ALREADY_PAID`).
- Amount comes from the **booking row** (server-computed at creation):
  `DEPOSIT` → `depositAmount`; `FULL` → `total − amountPaid` (balance after a
  deposit).
- Idempotency: `Idempotency-Key` header (8–100 chars) or a derived default
  `pay_{bookingId}_{mode}_{amountPaid}` → unique `Payment.idempotencyKey`;
  repeats reuse the row (and re-create the checkout session via the adapter
  when still unpaid).
- Result: `{ paymentId, status, checkoutUrl?, message?, amount, currency, mode }`.
  With `none`, `status = "not_configured"` + explanatory message.

## 4. Webhook pipeline (`webhook.ts`)

`POST /api/v1/payments/webhook/[provider]` — raw body (no `createHandler`;
the HMAC needs bytes), inline rate limit 120/min, signature is the only
authentication (no session, no CSRF token).

1. **Adapter lookup** — unknown provider → `404 UNKNOWN_PROVIDER`.
2. **Signature verification** by the adapter (`verifyWebhook`) — invalid →
   `401 INVALID_SIGNATURE` and a best-effort `WebhookEvent` row with
   `signatureValid: false` (synthetic event id, status `FAILED`).
3. **Persist the event first**: `WebhookEvent(provider, externalEventId,
type, status: RECEIVED)`. A repeat event id hits the unique constraint
   `(provider, externalEventId)` → immediate `200 {"received":true,
"duplicate":true}` with **no** state change (replay protection).
4. **Amount check**: if the event carries an amount it must equal the
   `Payment.amount` (tolerance 0.01) → else `400 AMOUNT_MISMATCH` (event
   marked `FAILED`). A provider cannot mark a payment paid for less/more than
   we requested.
5. **Transactional state machine** (booking row `FOR UPDATE`):
   - `payment.succeeded`: payment `PAID` (idempotent if already `PAID`;
     `REFUNDED` → `409 INVALID_STATE`); `amountPaid += amount`;
     `paymentStatus = PAID` when `amountPaid ≥ total − 0.01` else
     `PARTIALLY_PAID`; a `PENDING` booking becomes **`CONFIRMED`** (deposit or
     full payment confirms). Audit + `payment.succeeded`/`booking.confirmed`
     notifications.
   - `payment.failed`: payment `FAILED` — a later failure never demotes an
     already-`PAID` payment; booking `paymentStatus = FAILED` only when
     nothing has been paid. Notification sent.
   - `refund.succeeded` / `refund.failed`: matched by `Refund.externalId` or
     the pending refund for the payment; `SUCCEEDED` accumulates
     `amountRefunded`, and when fully refunded sets booking
     `status/paymentStatus = REFUNDED` and payment `REFUNDED`. Idempotent per
     refund status.
6. Event row updated to `PROCESSED`/`FAILED` with `processedAt`; processing
   errors → `500 PROCESSING_ERROR` (event recorded as `FAILED`).

Duplicate, out-of-order and retried deliveries are therefore safe end-to-end.

## 5. Refunds (`issueRefund`, admin)

- Route: `POST /api/v1/admin/bookings/[id]/refund` (`payment.refund`, `payment`
  rate limit). Amount defaults to the outstanding `paid − refunded`, clamped
  to it (`400 INVALID_REFUND_AMOUNT`, `409 NOTHING_TO_REFUND`, `409 NO_PAYMENT`
  without a verified payment).
- **`Refund` row is the idempotency anchor** (`Refund.idempotencyKey`
  unique): repeated calls return the same refund.
- Adapter called with the anchor payment (`refundPayment`); with `none` the
  refund stays `PENDING` — "recorded for manual processing" (honest,
  nothing faked). Settlement arrives later through `refund.succeeded`.
- Audit: `refund.issued`, `payment.refunded`, `refund.succeeded`.

## 6. Mock provider (development only)

Enabled by `PAYMENT_PROVIDER=mock` **and** `PAYMENT_WEBHOOK_SECRET` of **16+
characters**, and only when `NODE_ENV != production` (both `isConfigured()`
and the endpoints enforce this — the mock checkout/simulate routes return 404
in production).

- `createPayment` returns a signed local checkout URL
  (`/api/v1/payments/mock/checkout?paymentId=…&sig=…`).
- The checkout page has "Simulate success / failure" buttons that POST to
  `/api/v1/payments/mock/simulate`, which builds an HMAC-SHA256-signed
  (`x-vi-signature: sha256=…`, timing-safe compare) event payload and pushes
  it through the **real** `processPaymentWebhook` — same verification,
  dedupe, amount check and state machine as a production provider. No money
  moves; no secrets appear in the HTML.

## 7. What is NEVER stored

- No card numbers, CVV/CVC, PINs or expiry data — hosted/redirect flows only;
  the schema has no fields for them.
- `Payment.providerPayload` (Json) is documented as provider metadata only —
  never card data; `externalId` is the provider transaction id.
- Logger and audit redaction lists explicitly include `cardnumber`, `cvv`,
  `cvc`, `pan`, `pin`, `payload` (see [logging.md](logging.md)).

## 8. Configuration summary

| Variable                 | Dev default                  | Production                                                        |
| ------------------------ | ---------------------------- | ----------------------------------------------------------------- |
| `PAYMENT_PROVIDER`       | `none`                       | set to the real provider key once implemented; `mock` is rejected |
| `PAYMENT_WEBHOOK_SECRET` | empty (mock needs 16+ chars) | required secret used by the provider's signature scheme           |

Related: [booking.md](booking.md) (deposit/commission),
[api.md](api.md) (webhook examples), [configuration.md](configuration.md).
