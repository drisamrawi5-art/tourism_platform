# Notifications — Visit Imedwan

Implementation: `src/lib/notifications.ts`, `src/lib/mail/`
(`index.ts` drivers, `templates.ts`), routes
`GET|POST /api/v1/notifications`, `GET /api/v1/account/notifications`,
`POST /api/v1/account/notifications/read-all`.

## 1. Channels

| Channel        | Behaviour                                                                                                                                          |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| **In-app**     | **Always** persisted as a `Notification` row (`channel: IN_APP` default, `type`, JSON `data`, user `locale`, `readAt`) — for every `notify()` call |
| **Email**      | Sent only for the **email subset** below, via the mail abstraction; `emailSentAt` stamped on success                                               |
| SMS / WhatsApp | reserved for a future channel abstraction — **not implemented**                                                                                    |

`notify(userId, type, data, opts)` rules:

- recipient must exist and be `ACTIVE` (otherwise silently skipped);
- `data` is structured (`{ ref, reason, approved, … }`) for interpolation;
- email is attempted only when `type ∈ EMAIL_TYPES` and `opts.sendEmail !== false`;
- **failures never break the triggering operation** (caught + logged;
  `emailSentAt` stays `null`, so delivery is observable/retriable).

## 2. Event types actually supported

**Emitted today** (verified by call sites):

| Type                | Emitted from                                                   | Email?  | Audience                        |
| ------------------- | -------------------------------------------------------------- | ------- | ------------------------------- |
| `account.verified`  | email verification success                                     | no      | customer                        |
| `booking.created`   | `createBooking` side effects                                   | **yes** | customer **and** business owner |
| `booking.confirmed` | payment webhook `payment.succeeded`; provider `POST …/confirm` | **yes** | customer                        |
| `booking.cancelled` | customer cancel; refund issuance (`reason: refund_issued`)     | **yes** | customer                        |
| `payment.succeeded` | payment webhook                                                | **yes** | customer                        |
| `payment.failed`    | payment webhook                                                | **yes** | customer                        |
| `review.requested`  | `markBookingCompleted`                                         | **yes** | customer                        |
| `business.approved` | admin approve route                                            | **yes** | business owner                  |
| `business.rejected` | admin reject route (with `reason`)                             | **yes** | business owner                  |

`EMAIL_TYPES` in `notifications.ts` is exactly the eight `**yes**` rows above
(`account.verified` is in-app only).

Copy lives in the dictionaries: `notifications.types.*` (10 keys — it also
contains `booking.completed`, for which **no emitter exists yet**;
`notifications.title`/`unread` render the list UI) and `emails.*` (subjects).

Transactional mail outside `notify()` (same templates/dictionaries):

- `verificationEmail` — sent when registering / resending verification
  (link `/{locale}/verify-email?token=…`, 24 h token);
- `passwordResetEmail` — password-forgot flow
  (link `/{locale}/password-reset?token=…`, 60 min token).

## 3. Mail drivers (`MAIL_DRIVER`)

| Driver                           | Behaviour                                                                                                                                            |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `console` (default, development) | logs `mail_console` with recipient, subject and a **200-char body preview**; returns `status: "logged"` — never pretended as delivered               |
| `smtp` (production)              | nodemailer transport (`SMTP_HOST/PORT/USER/PASS`, `secure` on 465); success logs nothing beyond normal request logs, failures log `mail_send_failed` |

All templates render from the i18n dictionaries (single source of copy — no
duplicated strings) and append the localized platform footer
(`emails.footerNote`).

## 4. User-facing read API

```http
GET /api/v1/notifications?page=1&perPage=20&unread=1
Cookie: vi_session=…
```

```json
{
  "data": {
    "items": [
      {
        "id": "…",
        "type": "booking.created",
        "channel": "IN_APP",
        "data": { "ref": "VI-8F3K2A" },
        "readAt": null,
        "createdAt": "2026-10-09T…"
      }
    ],
    "total": 12,
    "unread": 3
  },
  "requestId": "…"
}
```

- `perPage` capped at **50**; `unread=1|true` filters to `readAt: null`;
  newest first.
- `POST /api/v1/notifications` marks **all** of the caller's notifications
  read (`{ data: { read: true } }`); the account-scoped twin
  `POST /api/v1/account/notifications/read-all` does the same.
- Every read is scoped by `userId` — notifications are strictly per-user.

**Not implemented yet**: marking a single notification read, deleting
notifications, per-user email preferences (the only opt-out is the
`sendEmail` option at call sites).

## 5. Localization

Notification rows store the recipient's `locale` at creation (validated to
`en|fr|ar`, else `en`); UI and any future re-rendering resolve copy from that
row, so language changes later don't rewrite history.

See also: [configuration.md](configuration.md) (mail env),
[i18n.md](i18n.md) (dictionary parity), [payments.md](payments.md) /
[booking.md](booking.md) (which flows notify).
