import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { notify } from '@/lib/notifications';

export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  permission: 'business.approve',
  schema: {
    params: z.object({ id: z.string().min(1) }),
    body: z.object({ reason: z.string().min(3).max(1000) }),
  },
  handler: async ({ params, body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const business = await db.business.findUnique({ where: { id: params.id } });
    if (!business) throw ApiError.notFound();
    if (business.status !== 'PENDING_REVIEW') {
      throw ApiError.conflict(
        'NOT_PENDING_REVIEW',
        `Only businesses in PENDING_REVIEW can be rejected (current: ${business.status})`,
      );
    }

    const updated = await db.business.update({
      where: { id: business.id },
      data: { status: 'REJECTED' },
    });

    void audit({
      actorId: user.id,
      action: AUDIT_ACTIONS.businessRejected,
      entityType: 'business',
      entityId: business.id,
      ip,
      metadata: { slug: business.slug, reason: body.reason },
    });
    void notify(business.ownerId, 'business.rejected', { reason: body.reason }).catch(
      () => undefined,
    );

    return { data: { business: updated } };
  },
});
