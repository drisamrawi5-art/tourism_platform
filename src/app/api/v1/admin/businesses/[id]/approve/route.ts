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
  schema: { params: z.object({ id: z.string().min(1) }) },
  handler: async ({ params, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const business = await db.business.findUnique({ where: { id: params.id } });
    if (!business) throw ApiError.notFound();
    if (business.status !== 'PENDING_REVIEW') {
      throw ApiError.conflict(
        'NOT_PENDING_REVIEW',
        `Only businesses in PENDING_REVIEW can be approved (current: ${business.status})`,
      );
    }

    const updated = await db.business.update({
      where: { id: business.id },
      data: { status: 'PUBLISHED', approvedAt: new Date(), approvedById: user.id },
    });

    void audit({
      actorId: user.id,
      action: AUDIT_ACTIONS.businessApproved,
      entityType: 'business',
      entityId: business.id,
      ip,
      metadata: { slug: business.slug },
    });
    void notify(business.ownerId, 'business.approved', { approved: true }).catch(() => undefined);

    return { data: { business: updated } };
  },
});
