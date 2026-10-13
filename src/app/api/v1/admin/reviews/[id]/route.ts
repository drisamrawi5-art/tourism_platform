import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  permission: 'review.moderate',
  schema: {
    params: z.object({ id: z.string().min(1) }),
    body: z.object({ action: z.enum(['approve', 'reject']) }),
  },
  handler: async ({ params, body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const review = await db.review.findUnique({ where: { id: params.id } });
    if (!review) throw ApiError.notFound();

    const updated = await db.review.update({
      where: { id: review.id },
      data: {
        status: body.action === 'approve' ? 'APPROVED' : 'REJECTED',
        moderatedAt: new Date(),
        moderatedById: user.id,
      },
    });

    void audit({
      actorId: user.id,
      action: AUDIT_ACTIONS.reviewModerated,
      entityType: 'review',
      entityId: review.id,
      ip,
      metadata: { action: body.action, rating: review.rating },
    });

    return { data: { review: updated } };
  },
});
