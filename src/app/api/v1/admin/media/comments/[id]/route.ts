import { z } from 'zod';
import { audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const PATCH = createHandler({
  method: 'PATCH',
  auth: 'required',
  permission: 'media.moderate',
  schema: {
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      status: z.enum(['APPROVED', 'REJECTED']),
    }),
  },
  handler: async ({ params, body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const comment = await db.mediaComment.findUnique({ where: { id: params.id } });
    if (!comment) throw ApiError.notFound();

    const updated = await db.mediaComment.update({
      where: { id: comment.id },
      data: { status: body.status },
    });

    void audit({
      actorId: user.id,
      action: 'media.comment.moderated',
      entityType: 'mediaComment',
      entityId: comment.id,
      ip,
      metadata: { from: comment.status, to: body.status },
    });

    return { data: { comment: updated } };
  },
});
