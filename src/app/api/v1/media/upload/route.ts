import { randomUUID } from 'node:crypto';
import { roleHasPermission } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { audit } from '@/lib/audit';
import { validateUpload } from '@/lib/media/validation';
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit';
import { buildMediaKey } from '@/lib/storage/types';
import { getStorage } from '@/lib/storage';

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]?.trim() ?? '0.0.0.0';
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

/**
 * Multipart upload — handled outside createHandler because that factory only
 * parses application/json bodies.
 */
export async function POST(req: Request): Promise<Response> {
  const user = await getCurrentUser();
  if (!user) return jsonError('UNAUTHENTICATED', 'Sign in required', 401);
  if (!roleHasPermission(user.role, 'media.upload')) {
    return jsonError('FORBIDDEN', 'Insufficient permissions', 403);
  }

  const decision = await rateLimit(`upload:${user.id}`, RATE_LIMITS.upload);
  if (!decision.ok) return jsonError('RATE_LIMITED', 'Too many requests', 429);

  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return jsonError('INVALID_FORM', 'Expected multipart form data', 400);
  }

  const file = form.get('file');
  if (!(file instanceof File)) return jsonError('FILE_REQUIRED', 'A file field is required', 400);

  const alt = String(form.get('alt') ?? '').trim();
  if (alt.length < 1 || alt.length > 300) {
    return jsonError('ALT_INVALID', 'alt must be between 1 and 300 characters', 400);
  }

  const placeId = String(form.get('placeId') ?? '').trim();
  const contentId = String(form.get('contentId') ?? '').trim();
  const businessId = String(form.get('businessId') ?? '').trim();
  const subjects = [placeId, contentId, businessId].filter((value) => value.length > 0);
  if (subjects.length > 1) {
    return jsonError(
      'BAD_SUBJECT',
      'Exactly one of placeId, contentId or businessId is required',
      400,
    );
  }

  if (subjects.length === 0) {
    // Site-wide media (homepage hero etc.) — no subject to authorize against,
    // so it requires the same permission that manages site settings. Everyone
    // else must attach the upload to an owned/approved subject as before.
    if (!roleHasPermission(user.role, 'settings.manage')) {
      return jsonError(
        'BAD_SUBJECT',
        'Exactly one of placeId, contentId or businessId is required',
        400,
      );
    }
  } else if (placeId) {
    if (!roleHasPermission(user.role, 'place.manage')) {
      return jsonError('FORBIDDEN', 'Insufficient permissions', 403);
    }
  } else if (contentId) {
    const content = await db.content.findUnique({
      where: { id: contentId },
      select: { authorId: true },
    });
    const owns = content?.authorId === user.id;
    if (!content || (!owns && !roleHasPermission(user.role, 'content.update'))) {
      return jsonError('FORBIDDEN', 'Insufficient permissions', 403);
    }
  } else {
    const business = await db.business.findUnique({
      where: { id: businessId },
      select: { ownerId: true },
    });
    const owns = business?.ownerId === user.id;
    if (!business || (!owns && !roleHasPermission(user.role, 'business.update'))) {
      return jsonError('FORBIDDEN', 'Insufficient permissions', 403);
    }
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const validation = await validateUpload({
    buffer,
    filename: file.name,
    declaredMime: file.type,
  });
  if (!validation.ok) {
    return jsonError(validation.code, validation.message, 400);
  }

  const mime = validation.mime;
  const key = buildMediaKey(mime, randomUUID());
  await getStorage().put(key, buffer, mime);

  const media = await db.media.create({
    data: {
      kind: mime.startsWith('video') ? 'VIDEO' : 'IMAGE',
      storageKey: key,
      mimeType: mime,
      sizeBytes: buffer.byteLength,
      width: null,
      height: null,
      alt,
      status: 'PENDING_REVIEW',
      verificationStatus: 'PROVIDER_PROVIDED',
      uploadedById: user.id,
      placeId: placeId || null,
      contentId: contentId || null,
      businessId: businessId || null,
    },
    select: { id: true, storageKey: true, alt: true, status: true },
  });

  void audit({
    actorId: user.id,
    action: 'media.uploaded',
    entityType: 'media',
    entityId: media.id,
    ip: clientIp(req),
  });

  return Response.json({ data: { media } }, { status: 201 });
}
