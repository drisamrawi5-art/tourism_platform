import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { createdAtRange, dateOnlyQuery } from '../_shared/queries';

/** Longest userAgent slice ever returned to an admin client. */
const USER_AGENT_MAX_LENGTH = 200;

const querySchema = z.object({
  action: z.string().max(120).optional(),
  actorId: z.string().max(64).optional(),
  entityType: z.string().max(64).optional(),
  entityId: z.string().max(64).optional(),
  from: dateOnlyQuery.optional(),
  to: dateOnlyQuery.optional(),
  page: z.string().optional(),
  perPage: z.string().optional(),
});

/** GET /api/v1/admin/audit — paginated audit log with actor attribution. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'audit.read',
  schema: { query: querySchema },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);

    const created = createdAtRange(query.from, query.to);
    const where: Prisma.AuditLogWhereInput = {
      ...(query.action !== undefined && { action: query.action }),
      ...(query.actorId !== undefined && { actorId: query.actorId }),
      ...(query.entityType !== undefined && { entityType: query.entityType }),
      ...(query.entityId !== undefined && { entityId: query.entityId }),
      ...(created !== undefined && { createdAt: created }),
    };

    const [rows, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          metadata: true,
          ip: true,
          userAgent: true,
          createdAt: true,
          actor: { select: { id: true, email: true, name: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.auditLog.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      action: row.action,
      actor: row.actor,
      entityType: row.entityType,
      entityId: row.entityId,
      metadata: row.metadata,
      ip: row.ip,
      userAgent: row.userAgent === null ? null : row.userAgent.slice(0, USER_AGENT_MAX_LENGTH),
      createdAt: row.createdAt,
    }));

    return paginated(items, total, pagination, requestId);
  },
});
