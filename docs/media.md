# Media — Visit Imedwan

Upload validation: `src/lib/media/validation.ts` · storage abstraction:
`src/lib/storage/` · routes: `POST /api/v1/media/upload`,
`GET /api/v1/media/file/[...key]`, `GET|POST /api/v1/media/[id]/comments`,
`POST /api/v1/media/[id]/like`, admin moderation under
`/api/v1/admin/media`.

## 1. Upload validation (three checks must agree)

`validateUpload` rejects unless **extension allowlist AND declared MIME AND
magic-byte sniffing** all match — a `.jpg` that is really HTML fails:

1. Empty file → `400 EMPTY`.
2. `sniffMimeType(buffer)` identifies the real type from file signatures:
   JPEG (`FF D8 FF`), PNG (8-byte signature), WebP (`RIFF….WEBP`),
   AVIF/MP4 (`….ftyp` + brand `avif`/`avis`), WebM (`1A 45 DF A3`).
   Unknown or not in the allowed lists → `400 UNSUPPORTED_TYPE`.
3. Extension must match the sniffed type (`.jpg/.jpeg`, `.png`, `.webp`,
   `.avif`, `.mp4`, `.webm`) and the declared MIME must equal the sniffed
   one (small tolerated browser variants: `image/jpg`, `image/heic` for AVIF)
   → else `400 TYPE_MISMATCH`.
4. Size limits come from **Settings, never hardcoded**:
   `media.maxImageBytes` (10 MiB) / `media.maxVideoBytes` (100 MiB),
   allowed lists `media.allowedImageTypes` / `media.allowedVideoTypes` →
   `400 TOO_LARGE`.

Additional upload-route rules:

- Session + **`media.upload` permission**; then authorization against the
  _subject_: `placeId` needs `place.manage`; `contentId` needs content
  authorship or `content.update`; `businessId` needs business ownership or
  `business.update`. Exactly one subject FK is required (`400 BAD_SUBJECT`).
- **`alt` text is mandatory** (1–300 chars, `400 ALT_INVALID`) —
  accessibility is enforced at the API, and `Media.alt` is non-null in the
  schema.
- Multipart body (handled outside `createHandler`, which parses JSON only);
  rate limit `upload` = 30/h keyed by user id.
- Key built by `buildMediaKey` → **`media/YYYY/MM/<uuid>.<ext>`** (UTC date);
  `assertSafeKey` rejects traversal, `//`, absolute paths and unexpected
  characters on every read/write.
- New rows start `status: PENDING_REVIEW`, `verificationStatus:
PROVIDER_PROVIDED`; audit action `media.uploaded`.

## 2. Storage abstraction

`getStorage()` returns the driver selected by `STORAGE_DRIVER`:

| Driver            | Use         | Details                                                                                                                                      |
| ----------------- | ----------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `local` (default) | development | files under `LOCAL_STORAGE_DIR` (`.data/media`, gitignored); path-traversal guarded (`resolve` must stay under root); `publicUrl()` → `null` |
| `s3`              | production  | `@aws-sdk/client-s3` with `S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY_ID/SECRET_ACCESS_KEY/PUBLIC_URL` (S3-compatible endpoints supported)         |

Business code never touches the filesystem directly (`put`/`get`/`delete`/
`publicUrl` interface — see `storage/types.ts`). EXIF/GPS stripping happens at
serve time via Next's image optimizer; originals live behind the app route.

## 3. Serving (`GET /api/v1/media/file/[...key]`)

- Key validated (`assertSafeKey` → `400 BAD_KEY`), then resolved by
  `storageKey` (`404` if unknown).
- **Review-before-publish**: only `PUBLISHED` (or legacy `APPROVED`) media is
  served to everyone; any other status requires the **uploader** or a user
  with **`media.moderate`** → otherwise `403`.
- Served media: `cache-control: public, max-age=31536000, immutable`;
  unapproved media: `no-store`. `content-disposition: inline`.
- Media URLs in the UI are always same-origin
  (`/api/v1/media/file/<key>` — `mediaToImage` in `lib/data/common.ts`);
  `next/image` uses AVIF/WebP (`next.config.ts`), so no remote patterns are
  configured.

## 4. Moderation lifecycle

`Media.status` is a `PublicationStatus`: upload → **`PENDING_REVIEW`** →
admin `PATCH /api/v1/admin/media/[id]` (`media.moderate`) sets
`PUBLISHED` | `REJECTED` | `ARCHIVED` (audit `media.moderated` with
from/to + storage key). Archived media disappears from galleries
(`mediaToImage` drops `ARCHIVED`). Public queries in `lib/data` only return
published rows.

## 5. Albums, comments, likes

- **`MediaAlbum`**: named album (`slug` unique) attachable to exactly one of
  place/content/business; ordering via `sortOrder`.
- **Comments** (`MediaComment`): status `PENDING` on creation (moderated by
  `media.moderate`; public listing shows `APPROVED` only). **Replies nest
  exactly one level**: the POST handler resolves `parentId` only if the parent
  is a top-level comment (`parentId: null`) of the _same_ media — anything
  deeper returns `404`. Public GET returns top-level comments plus their
  approved replies.
- **Likes** (`MediaLike`): unique `(mediaId, userId)` — repeat likes are
  idempotent at the database level.
- Routes: `GET comments` is public; `POST comments` requires session +
  verified email + `comment` rate limit (10/h); `POST like` requires session.

## 6. What the platform never does

- No fabricated media: uploads and their DB rows are the only source; alt
  text is user-provided, never auto-generated claims.
- No direct object URLs to private buckets in V1 — everything streams through
  the status-checked app route (the local driver cannot produce public URLs
  at all).

See also: [configuration.md](configuration.md) (media settings),
[security.md](security.md) (upload threat model),
[database.md](database.md) (`Media`/`MediaComment`/`MediaAlbum`).
