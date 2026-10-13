import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { roleHasPermission } from '@/lib/auth/permissions';
import { revokeAllSessions } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { zRole, zUserStatus } from '../../_shared/queries';

const paramsSchema = z.object({ id: z.string().min(1) });

const bodySchema = z.object({
  role: zRole.optional(),
  status: zUserStatus.optional(),
});

const userSelect = {
  id: true,
  email: true,
  name: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  _count: { select: { businesses: true } },
} as const;

type AdminUserRow = Prisma.UserGetPayload<{ select: typeof userSelect }>;

function toAdminUser(row: AdminUserRow) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    status: row.status,
    emailVerifiedAt: row.emailVerifiedAt,
    createdAt: row.createdAt,
    businessCount: row._count.businesses,
  };
}

/** GET /api/v1/admin/users/[id] — single user detail for the admin UI. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'user.read',
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    if (!user) throw ApiError.unauthenticated();
    const target = await db.user.findUnique({
      where: { id: params.id },
      select: userSelect,
    });
    if (!target) throw ApiError.notFound('User not found');
    return { data: { user: toAdminUser(target) } };
  },
});

/**
 * PATCH /api/v1/admin/users/[id] — change role and/or status.
 * Role changes additionally require `user.role.assign`; role/status changes
 * revoke every session of the target user.
 */
export const PATCH = createHandler({
  method: 'PATCH',
  auth: 'required',
  permission: 'user.manage',
  schema: { params: paramsSchema, body: bodySchema },
  handler: async ({ params, body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const target = await db.user.findUnique({
      where: { id: params.id },
      select: { id: true, role: true, status: true },
    });
    if (!target) throw ApiError.notFound('User not found');

    if (target.id === user.id && (body.role !== undefined || body.status !== undefined)) {
      throw ApiError.badRequest('SELF_MODIFY', 'You cannot change your own role or status');
    }
    if (target.role === 'SUPER_ADMIN' && user.role !== 'SUPER_ADMIN') {
      throw ApiError.forbidden('Only a super admin can modify a super admin');
    }
    if (body.role !== undefined && !roleHasPermission(user.role, 'user.role.assign')) {
      throw ApiError.forbidden('Missing permission: user.role.assign');
    }

    const roleChanged = body.role !== undefined && body.role !== target.role;
    const statusChanged = body.status !== undefined && body.status !== target.status;

    if (!roleChanged && !statusChanged) {
      const unchanged = await db.user.findUnique({ where: { id: target.id }, select: userSelect });
      if (!unchanged) throw ApiError.notFound('User not found');
      return { data: { user: toAdminUser(unchanged) } };
    }

    const updated = await db.user.update({
      where: { id: target.id },
      data: {
        ...(roleChanged && body.role !== undefined ? { role: body.role } : {}),
        ...(statusChanged && body.status !== undefined ? { status: body.status } : {}),
      },
      select: userSelect,
    });

    // Any role/status change invalidates existing sessions immediately.
    await revokeAllSessions(target.id);

    if (roleChanged && body.role !== undefined) {
      void audit({
        actorId: user.id,
        action: AUDIT_ACTIONS.roleChanged,
        entityType: 'user',
        entityId: target.id,
        metadata: { from: target.role, to: body.role },
        ip,
      });
    }
    if (statusChanged && body.status === 'SUSPENDED') {
      void audit({
        actorId: user.id,
        action: AUDIT_ACTIONS.userSuspended,
        entityType: 'user',
        entityId: target.id,
        metadata: { from: target.status, to: 'SUSPENDED' },
        ip,
      });
    }

    return { data: { user: toAdminUser(updated) } };
  },
});
