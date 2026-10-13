# Booking engine — Visit Imedwan

One reusable engine prices, checks availability and books every `Bookable`
regardless of category (`ACCOMMODATION` or `GUIDE`). Implementation:
`src/lib/booking/` (`service.ts`, `pricing.ts`, `availability.ts`,
`dates.ts`, `serialize.ts`, `include.ts`).

## 1. Status machines (independent axes)

**Booking** (`BookingStatus`): `PENDING → CONFIRMED → COMPLETED`,
`PENDING|CONFIRMED → CANCELLED`, full refund → `REFUNDED`.

**Payment** (`PaymentStatus`): `UNPAID → PARTIALLY_PAID → PAID`,
`→ FAILED`, `→ REFUNDED`.

They are separate columns: a booking can be `CONFIRMED` and `UNPAID`
(pay-at-property / deposit-pending model) or `CANCELLED` while `PAID`
(refund in flight). Payment state changes only through verified webhooks or
explicit role-gated admin actions — never from frontend redirects
(see [payments.md](payments.md)).

Guard rails in `service.ts`:

- `CANCELLABLE = [PENDING, CONFIRMED]` → else `409 NOT_CANCELLABLE`.
- Completion accepts `PENDING` or `CONFIRMED` → else `409 NOT_COMPLETABLE`.
- Review eligibility requires `COMPLETED` + `completedAt` inside the window.

## 2. Flow

```
POST /bookings/quote          read-only: price + deposit + availability preview
POST /bookings                PENDING booking + inventory hold (Idempotency-Key)
POST /payments                optional: initiate FULL/DEPOSIT payment
provider webhook              payment.succeeded → paymentStatus + CONFIRMED
POST /bookings/[id]/cancel    customer cancel (PENDING/CONFIRMED)
POST /provider/bookings/[id]/confirm | /complete    provider actions
expireStaleBookings()         PENDING + hold expired → CANCELLED ("hold_expired")
```

## 3. Server-side pricing (`pricing.ts`)

The client never computes or submits money. Quote and create both call the
same functions inside the server.

**Units** (`PricingUnit`) and quantity rules (`computeQuantity`):

| Unit      | Quantity                                    |
| --------- | ------------------------------------------- |
| `NIGHT`   | nights = end − start (checkout day free)    |
| `DAY`     | inclusive span (every touched calendar day) |
| `PERSON`  | participants (`guests`, floor 1)            |
| `SERVICE` | always 1                                    |

Default unit when a bookable has no active price row: `NIGHT` for
accommodation, `PERSON` for guides (`inferUnit`).

**Price resolution** (`pickPrice`):

- Candidates = `active` prices matching the unit.
- **Base price** = `validFrom` and `validTo` both null.
- **Seasonal price** = dated window that _fully covers_ the requested stay
  (for `NIGHT` the whole `[start, end)` window must be inside it).
- Winner: seasonal rules sorted by `priority` desc, then later `validFrom`;
  the best seasonal rule wins, otherwise the base price.
- No candidates → `409 PRICE_NOT_CONFIGURED` (a service without provider-set
  prices is simply not bookable — nothing is invented).

**Money math**: `money()` rounds to 2 dp; `subtotal = unitPrice × quantity`
(2 dp); `depositAmount = subtotal × percent / 100` (HALF_UP, 2 dp);
`commission = subtotal × rate / 100` (rate 2 dp, HALF_UP). All decimals end
to end (`Decimal(12,2)`), serialized as strings.

## 4. Availability algorithm (`availability.ts`)

Per calendar date in the request's occupancy range:

1. **Capacity** = `max` over all `AvailabilityRule`s that cover the date
   (`startDate ≤ date`, `endDate` null-or-≥ date, `weekday` null-or-matches).
   No matching rule → capacity `0` — **availability is never fabricated**.
2. **Blocks override**: a covering `AvailabilityBlock` sets capacity to
   `capacityOverride`, or `0` when the override is null (hard blackout).
3. **Used** = sum of slots from overlapping bookings whose status is
   `CONFIRMED`/`COMPLETED`, or `PENDING` **within the hold window**
   (`holdExpiresAt > now`) — expired holds stop consuming inventory even
   before the sweeper runs.
4. Slots per booking: `1` for accommodation units, `guests` for guide
   services (`requestedSlots` mirrors this: 1 vs `guests`).
5. `available` = every date has `remaining ≥ requestedSlots`.

Occupancy ranges: `NIGHT` occupies `[start, end)` (checkout free); day/person/
service units occupy `[start, end]` inclusive. Public calendar
(`availabilityOverview`) computes the same numbers read-only — no locks.
`GET /bookables/[id]/availability` exposes it (default window: today +30 days,
capped at 90).

## 5. Double-booking protection

`createBooking` runs one transaction:

1. `SELECT id FROM "bookables" WHERE id = $1 FOR UPDATE` — serialises all
   concurrent writers for that bookable.
2. Reload bookable; re-validate dates, capacity, publication status
   (non-PUBLISHED bookable/business → `404`).
3. Re-price server-side (never trusts the client).
4. Re-check availability **with the lock held** → `409 NOT_AVAILABLE` if the
   inventory went away.
5. Insert `Booking` (+ `BookingItem` with `quantity`/`unitPrice` snapshot,
   - `Commission` snapshot) with a fresh `VI-XXXXXX` reference (collision
     retries up to 4×, alphabet excludes ambiguous glyphs).
6. Commit; side effects (audit, analytics, notifications) run after commit.

Cancelling also locks every bookable of the booking first, so cancellation
cannot race with a new booking.

## 6. Idempotency

- Client header `Idempotency-Key` (8–100 chars) → `Booking.idempotencyKey`
  (unique). Replay: same customer → returns the original booking with
  `idempotent: true`; different customer → `403`.
- Race inside the transaction: P2002 on `idempotencyKey` re-reads and returns
  the existing row.
- Payments repeat the pattern with `Payment.idempotencyKey` (default key
  derived from booking + mode + amount paid).

## 7. Holds and expiry

- `holdExpiresAt = now + booking.holdMinutes` (setting, default **30 min**) is
  written on every `PENDING` booking.
- `expireStaleBookings()` flips `PENDING` rows with a lapsed hold to
  `CANCELLED` with `cancelReason: "hold_expired"`.
- **Honest status**: the function exists but **nothing calls it yet** — no
  scheduler/cron is wired. Availability is still safe because the occupancy
  query ignores expired `PENDING` rows; only the booking's own status lags
  until the sweeper exists (see [roadmap.md](roadmap.md))).

## 8. Deposit, commission, cancellation configuration

| Rule                           | Resolution chain                                                                                                                           | Source                                                                                                                          |
| ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Deposit (`enabled`, `percent`) | **service → provider → category → global** (`Bookable.config` → `Business.config` → `deposit.<CATEGORY>.*` settings → `deposit.default.*`) | `resolveDepositConfig` in `settings.ts`; reports `source` for admin transparency; percent outside (0, 100] disables the deposit |
| Commission                     | **category → global** (`commission.<CATEGORY>.ratePercent` → `commission.default.ratePercent`, default `0`), platform-controlled only      | `resolveCommissionRate`; snapshotted onto the booking + `Commission` row at creation                                            |
| Cancellation policy            | service → provider (`cancellationPolicyText`, `freeCancellationHours`)                                                                     | `resolveCancellation`; snapshot copied to the booking                                                                           |

`paymentMode: "DEPOSIT"` is honoured only when a deposit amount resolves;
otherwise the booking falls back to `FULL`.

## 9. Review eligibility

`POST /api/v1/reviews` requires: session + verified email, booking owned by
the caller (scoped query), booking `status = COMPLETED` (`409 NOT_COMPLETED`),
`completedAt` within `review.eligibility.windowDays` (default **90**,
`409 WINDOW_CLOSED`), bookable present among the booking's items, and no prior
review for `(bookingId, bookableId)` (`409 ALREADY_REVIEWED`). New reviews
start `PENDING` (moderated by `review.moderate`). Completion notifies the
customer with `review.requested`.

## 10. Quote shape (recap)

`POST /bookings/quote` (auth optional, `generic` rate limit) returns bookable
identity, `nights`/`days`, `pricing { unit, unitPrice, currency, quantity,
subtotal }`, `deposit { enabled, percent, amount } | null`, `total`,
`cancellation`, `availability { available, unavailableDates }`, `holdMinutes`.
Commission details are never included (platform-internal). Full examples:
[api.md](api.md).

See also: [database.md](database.md) (enums/constraints),
[payments.md](payments.md), [configuration.md](configuration.md).
