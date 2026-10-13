import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { zPublicationStatus, zVerificationStatus } from '../../_shared/queries';

const paramsSchema = z.object({ id: z.string().min(1) });

const patchBodySchema = z.object({
  status: zPublicationStatus.optional(),
  // Accessibility: if alt is supplied it must be meaningful — never empty.
  alt: z.string().trim().min(1).max(300).optional(),
  caption: z.string().max(500).nullable().optional(),
  verificationStatus: zVerificationStatus.optional(),
});

/** GET /api/v1/admin/media/[id] — single media record for moderation. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'media.moderate',
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    if (!user) throw ApiError.unauthenticated();
    const media = await db.media.findUnique({
      where: { id: params.id },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        place: { select: { id: true, slug: true } },
        business: { select: { id: true, slug: true } },
        content: { select: { id: true, slug: true } },
        _count: { select: { comments: true, likes: true } },
      },
    });
    if (!media) throw ApiError.notFound('Media not found');
    return { data: { media } };
  },
});

/**
 * PATCH /api/v1/admin/media/[id] — moderate status / fix alt+caption.
 * No audit action exists for media moderation in AUDIT_ACTIONS, so none is
 * written (inventing action strings is forbidden).
 */
export const PATCH = createHandler({
  method: 'PATCH',
  auth: 'required',
  permission: 'media.moderate',
  schema: { params: paramsSchema, body: patchBodySchema },
  handler: async ({ params, body, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const existing = await db.media.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Media not found');

    const media = await db.media.update({
      where: { id: existing.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.alt !== undefined ? { alt: body.alt } : {}),
        ...(body.caption !== undefined ? { caption: body.caption } : {}),
        ...(body.verificationStatus !== undefined
          ? { verificationStatus: body.verificationStatus }
          : {}),
      },
      include: {
        uploadedBy: { select: { id: true, name: true, email: true } },
        place: { select: { id: true, slug: true } },
        business: { select: { id: true, slug: true } },
        content: { select: { id: true, slug: true } },
      },
    });

    return { data: { media } };
  },
});
