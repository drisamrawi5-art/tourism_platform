import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { notify } from '@/lib/notifications';

const querySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
});

const bodySchema = z.object({
  businessId: z.string().min(1),
  action: z.enum(['approve', 'reject', 'publish', 'unpublish']),
  reason: z.string().max(1000).optional(),
});

/** GET /api/v1/admin/approvals — the business review queue. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'approvals.manage',
  schema: { query: querySchema },
  handler: async ({ user, requestId, query }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);

    const where = { status: 'PENDING_REVIEW' as const };
    const [rows, total] = await Promise.all([
      db.business.findMany({
        where,
        select: {
          id: true,
          name: true,
          slug: true,
          type: true,
          status: true,
          submittedAt: true,
          createdAt: true,
          owner: { select: { id: true, email: true, name: true } },
          _count: { select: { bookables: true } },
        },
        orderBy: { submittedAt: 'asc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.business.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      name: row.name,
      slug: row.slug,
      type: row.type,
      status: row.status,
      submittedAt: row.submittedAt,
      createdAt: row.createdAt,
      owner: row.owner,
      bookableCount: row._count.bookables,
    }));

    return paginated(items, total, pagination, requestId);
  },
});

/**
 * POST /api/v1/admin/approvals — run a workflow transition on a business.
 * Invalid transitions are rejected with 409 INVALID_STATUS.
 */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  permission: 'business.approve',
  schema: { body: bodySchema },
  handler: async ({ body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const business = await db.business.findUnique({
      where: { id: body.businessId },
      select: { id: true, status: true, ownerId: true, name: true, slug: true },
    });
    if (!business) throw ApiError.notFound('Business not found');

    const invalid = () =>
      ApiError.conflict(
        'INVALID_STATUS',
        `Cannot ${body.action} a business in status ${business.status}`,
      );

    switch (body.action) {
      case 'approve': {
        if (business.status !== 'PENDING_REVIEW') throw invalid();
        const updated = await db.business.update({
          where: { id: business.id },
          data: {
            status: 'APPROVED',
            approvedAt: new Date(),
            approvedById: user.id,
          },
          select: { id: true, slug: true, status: true, approvedAt: true },
        });

        void audit({
          actorId: user.id,
          action: AUDIT_ACTIONS.businessApproved,
          entityType: 'business',
          entityId: business.id,
          metadata: { slug: business.slug },
          ip,
        });
        void notify(business.ownerId, 'business.approved', { approved: true });

        return { data: { business: updated } };
      }

      case 'reject': {
        if (business.status !== 'PENDING_REVIEW' && business.status !== 'APPROVED') {
          throw invalid();
        }
        const updated = await db.business.update({
          where: { id: business.id },
          data: { status: 'REJECTED' },
          select: { id: true, slug: true, status: true },
        });

        void audit({
          actorId: user.id,
          action: AUDIT_ACTIONS.businessRejected,
          entityType: 'business',
          entityId: business.id,
          metadata: { slug: business.slug, reason: body.reason ?? null },
          ip,
        });
        void notify(business.ownerId, 'business.rejected', { reason: body.reason ?? '' });

        return { data: { business: updated } };
      }

      case 'publish': {
        if (business.status !== 'APPROVED') throw invalid();
        const updated = await db.$transaction(async (tx) => {
          const row = await tx.business.update({
            where: { id: business.id },
            data: { status: 'PUBLISHED' },
            select: { id: true, slug: true, status: true },
          });
          await tx.bookable.updateMany({
            where: {
              businessId: business.id,
              status: { in: ['DRAFT', 'APPROVED', 'PENDING_REVIEW'] },
            },
            data: { status: 'PUBLISHED' },
          });
          return row;
        });

        void audit({
          actorId: user.id,
          action: AUDIT_ACTIONS.contentPublished,
          entityType: 'business',
          entityId: business.id,
          metadata: { slug: business.slug },
          ip,
        });

        return { data: { business: updated } };
      }

      case 'unpublish': {
        if (business.status !== 'PUBLISHED') throw invalid();
        const updated = await db.$transaction(async (tx) => {
          const row = await tx.business.update({
            where: { id: business.id },
            data: { status: 'ARCHIVED' },
            select: { id: true, slug: true, status: true },
          });
          await tx.bookable.updateMany({
            where: { businessId: business.id },
            data: { status: 'DRAFT' },
          });
          return row;
        });

        // No audit action exists for unpublishing (AUDIT_ACTIONS has no
        // "content.unpublished" key and inventing one is forbidden).
        return { data: { business: updated } };
      }
    }
  },
});
