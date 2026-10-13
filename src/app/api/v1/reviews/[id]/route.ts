import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { ApiError } from '@/lib/api/errors';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

const paramsSchema = z.object({ id: z.string().min(1).max(64) });
const bodySchema = z.object({ status: z.enum(['APPROVED', 'REJECTED', 'PENDING']) });

/** PATCH /api/v1/reviews/[id] — admin moderation (review.moderate). */
export const PATCH = createHandler({
  method: 'PATCH',
  auth: 'required',
  permission: 'review.moderate',
  schema: { params: paramsSchema, body: bodySchema },
  handler: async ({ params, body, user, ip }) => {
    const review = await db.review.findUnique({ where: { id: params.id } });
    if (!review) throw ApiError.notFound('Review not found');

    const updated = await db.review.update({
      where: { id: review.id },
      data: {
        status: body.status,
        moderatedAt: new Date(),
        moderatedById: user!.id,
      },
      select: { id: true, status: true, rating: true, moderatedAt: true },
    });

    void audit({
      actorId: user!.id,
      action: AUDIT_ACTIONS.reviewModerated,
      entityType: 'review',
      entityId: review.id,
      metadata: { from: review.status, to: body.status, rating: review.rating },
      ip,
    });

    return { data: { review: updated } };
  },
});
