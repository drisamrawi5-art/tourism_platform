import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { zPublicationStatus, zVerificationStatus } from '../../_shared/queries';

const paramsSchema = z.object({ id: z.string().min(1) });

const bodySchema = z.object({
  status: zPublicationStatus.optional(),
  verificationStatus: zVerificationStatus.optional(),
  featured: z.boolean().optional(),
  noIndex: z.boolean().optional(),
});

/** GET /api/v1/admin/businesses/[id] — full business record for the admin UI. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'business.read',
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    if (!user) throw ApiError.unauthenticated();
    const business = await db.business.findUnique({
      where: { id: params.id },
      include: {
        owner: { select: { id: true, email: true, name: true } },
        translations: true,
        _count: { select: { bookables: true, bookings: true, reviews: true } },
      },
    });
    if (!business) throw ApiError.notFound('Business not found');
    return { data: { business } };
  },
});

/** PATCH /api/v1/admin/businesses/[id] — status/verification/flags update. */
export const PATCH = createHandler({
  method: 'PATCH',
  auth: 'required',
  permission: 'business.approve',
  schema: { params: paramsSchema, body: bodySchema },
  handler: async ({ params, body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const existing = await db.business.findUnique({
      where: { id: params.id },
      select: { id: true, slug: true, status: true },
    });
    if (!existing) throw ApiError.notFound('Business not found');

    const statusChanged = body.status !== undefined && body.status !== existing.status;

    const updated = await db.business.update({
      where: { id: existing.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.verificationStatus !== undefined
          ? { verificationStatus: body.verificationStatus }
          : {}),
        ...(body.featured !== undefined ? { featured: body.featured } : {}),
        ...(body.noIndex !== undefined ? { noIndex: body.noIndex } : {}),
      },
    });

    if (statusChanged && body.status !== undefined) {
      // Audit only where an AUDIT_ACTIONS key fits the transition — never
      // invent action strings.
      const action =
        body.status === 'APPROVED'
          ? AUDIT_ACTIONS.businessApproved
          : body.status === 'REJECTED'
            ? AUDIT_ACTIONS.businessRejected
            : body.status === 'PUBLISHED'
              ? AUDIT_ACTIONS.contentPublished
              : null;
      if (action !== null) {
        void audit({
          actorId: user.id,
          action,
          entityType: 'business',
          entityId: existing.id,
          metadata: { slug: existing.slug, from: existing.status, to: body.status },
          ip,
        });
      }
    }

    return { data: { business: updated } };
  },
});
