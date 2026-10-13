import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';

export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'audit.read',
  schema: {
    query: z.object({
      action: z.string().max(120).optional(),
      actorId: z.string().max(64).optional(),
      entityType: z.string().max(64).optional(),
      entityId: z.string().max(64).optional(),
      page: z.string().optional(),
      perPage: z.string().optional(),
    }),
  },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query, { maxPerPage: 100 });

    const where: Prisma.AuditLogWhereInput = {
      ...(query.action && { action: query.action }),
      ...(query.actorId && { actorId: query.actorId }),
      ...(query.entityType && { entityType: query.entityType }),
      ...(query.entityId && { entityId: query.entityId }),
    };

    const [items, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.auditLog.count({ where }),
    ]);

    return paginated(items, total, pagination, requestId);
  },
});
