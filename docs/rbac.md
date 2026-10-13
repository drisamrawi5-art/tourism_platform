# RBAC — Visit Imedwan

Code-first permission matrix in `src/lib/auth/permissions.ts` (single source of
truth); enforcement helpers in `src/lib/auth/rbac.ts`. The database mirror
(`permissions` / `role_permissions`, seeded by `prisma/seed.ts`) exists for
**auditability only** — the seed reads the code map, never the reverse.

Two independent gates (both server-side; UI merely reflects them):

1. **Permissions** gate _what operation type_ is allowed.
2. **Ownership scoping** gates _which resource_ is reachable (IDOR defence).

## 1. Roles (6)

`SUPER_ADMIN`, `ADMIN`, `CONTENT_MANAGER`, `BUSINESS_OWNER`, `GUIDE`,
`CUSTOMER` (enum `Role`, default `CUSTOMER` on registration).

## 2. Permissions (37 keys)

| Group                         | Keys                                                                                                                             |
| ----------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| users & roles                 | `user.read`, `user.manage`, `user.role.assign`                                                                                   |
| businesses                    | `business.create`, `business.read`, `business.update`, `business.approve`, `business.submit`                                     |
| services/pricing/availability | `service.manage`, `pricing.manage`, `availability.manage`                                                                        |
| content/CMS                   | `content.read.draft`, `content.create`, `content.update`, `content.publish`, `place.manage`, `translations.manage`, `seo.manage` |
| media                         | `media.upload`, `media.moderate`                                                                                                 |
| bookings                      | `booking.create`, `booking.read`, `booking.confirm`, `booking.cancel`, `booking.complete`                                        |
| payments                      | `payment.create`, `payment.read`, `payment.refund`                                                                               |
| reviews                       | `review.create`, `review.moderate`                                                                                               |
| reporting                     | `revenue.read`                                                                                                                   |
| platform                      | `settings.read`, `settings.manage`, `analytics.read`, `audit.read`, `approvals.manage`, `notification.manage`                    |

Some keys (e.g. `approvals.manage`, `notification.manage`) exist so future
modules do not require an RBAC redesign; not every key is yet wired to a route.

## 3. Role → permission matrix (actual arrays)

**SUPER_ADMIN** — `Object.keys(ALL_PERMISSIONS)`: all 37.

**ADMIN** (31) — everything except `user.role.assign`, `business.create`,
`business.submit`, `booking.create`, `payment.create`, `review.create`:

```
user.read, user.manage, business.read, business.update, business.approve,
service.manage, pricing.manage, availability.manage,
content.read.draft, content.create, content.update, content.publish,
place.manage, translations.manage, seo.manage, media.upload, media.moderate,
booking.read, booking.confirm, booking.cancel, booking.complete,
payment.read, payment.refund, review.moderate, revenue.read,
settings.read, settings.manage, analytics.read, audit.read,
approvals.manage, notification.manage
```

**CONTENT_MANAGER** (9):

```
content.read.draft, content.create, content.update, content.publish,
place.manage, translations.manage, seo.manage, media.upload, media.moderate
```

**BUSINESS_OWNER** and **GUIDE** — identical `PROVIDER` list (12):

```
business.create, business.update, business.submit,
service.manage, pricing.manage, availability.manage,
media.upload, booking.read, booking.confirm, booking.cancel,
booking.complete, revenue.read
```

**CUSTOMER** (4):

```
booking.create, booking.read, payment.create, review.create
```

## 4. Enforcement points

| Mechanism                                                                   | Where                   | Behaviour                                                                                                 |
| --------------------------------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `createHandler({ permission })`                                             | every `/api/v1` route   | `roleHasPermission` check → `403 FORBIDDEN` before the handler runs                                       |
| `createHandler({ roles })`                                                  | role allow-lists (rare) | `403 Insufficient role`                                                                                   |
| `requireUser` / `requireVerifiedUser` / `requireRole` / `requirePermission` | `src/lib/auth/rbac.ts`  | for code paths outside the factory; throws `AuthError` (401/403) mapped by the handler                    |
| `hasPermission(user, key)`                                                  | UI/server checks        | pure matrix lookup                                                                                        |
| `isAdminRole(role)`                                                         | admin gates             | `ADMIN` or `SUPER_ADMIN`                                                                                  |
| `assertOwnership(user, ownerIds, opts)`                                     | defence-in-depth        | allows `ADMIN`/`SUPER_ADMIN` (unless `allowAdmin: false`), otherwise requires a matching owner id → `403` |

**Server-side rule**: hiding UI controls is never sufficient. Every protected
API route repeats the check; services assume the route already authorised and
additionally scope queries.

### Ownership scoping (primary IDOR defence)

The dominant pattern is a **scoped query** so foreign resources return
`404 NOT_FOUND` (they "do not exist") rather than `403`:

- customer bookings/payments: `where: { customerId: user.id }` (e.g.
  `bookings/[id]`, `payments` initiation, `reviews` POST, wishlist).
- provider portal: `where: { business: { ownerId: user.id } }` (bookings,
  bookables, revenue, reviews; `provider/bookables/[id]/blocks/[blockId]`
  DELETE uses an owner-scoped `deleteMany`).
- media upload authorises against the _subject_: `place.manage` for places,
  content authorship/`content.update` for content, business ownership/
  `business.update` for businesses.

Honest status: `assertOwnership` is exported and documented as
defence-in-depth, but **no route currently calls it** — scoping is done in the
`where` clauses above. Adding it beside fetched-by-id reads is pending work
(see [roadmap.md](roadmap.md)).

### Admin gates

- Admin routes sit behind explicit `permission:` gates (see the inventory in
  [api.md](api.md)); `ADMIN` deliberately lacks `user.role.assign` — only
  `SUPER_ADMIN` may change roles.
- `PATCH /admin/users/[id]` rejects self role/status changes
  (`400 SELF_MODIFICATION`).
- Business approval (`business.approve`) and refunds (`payment.refund`) are
  permission-gated and audited (`business.approved`/`business.rejected`,
  `refund.issued`, `payment.refunded`).

## 5. Tests

`tests/unit/permissions.test.ts` asserts: no duplicates, no orphan
permissions, SUPER_ADMIN completeness, ADMIN ⊂ SUPER_ADMIN minus role
assignment, CUSTOMER has no operational powers, provider roles are identical,
CONTENT_MANAGER is content/media-only. See [testing.md](testing.md).

See also: [authentication.md](authentication.md), [security.md](security.md).
