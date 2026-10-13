import type { Role } from '@prisma/client';
import { getCurrentUser, type SessionUser } from '@/lib/auth/session';
import { roleHasPermission, type Permission } from '@/lib/auth/permissions';

/**
 * Server-side RBAC + ownership enforcement (spec sections 28–29).
 *
 * Every protected operation must call these helpers — hiding UI buttons is
 * never sufficient.
 */

export class AuthError extends Error {
  constructor(
    public readonly status: 401 | 403,
    public readonly code: 'UNAUTHENTICATED' | 'FORBIDDEN' | 'EMAIL_NOT_VERIFIED',
    message: string,
  ) {
    super(message);
  }
}

export async function requireUser(): Promise<SessionUser> {
  const user = await getCurrentUser();
  if (!user) throw new AuthError(401, 'UNAUTHENTICATED', 'Authentication required');
  return user;
}

export async function requireVerifiedUser(): Promise<SessionUser> {
  const user = await requireUser();
  if (!user.emailVerifiedAt) {
    throw new AuthError(401, 'EMAIL_NOT_VERIFIED', 'Email verification required');
  }
  return user;
}

export async function requireRole(...roles: Role[]): Promise<SessionUser> {
  const user = await requireUser();
  if (!roles.includes(user.role)) {
    throw new AuthError(403, 'FORBIDDEN', 'Insufficient role');
  }
  return user;
}

export async function requirePermission(permission: Permission): Promise<SessionUser> {
  const user = await requireUser();
  if (!roleHasPermission(user.role, permission)) {
    throw new AuthError(403, 'FORBIDDEN', 'Insufficient permissions');
  }
  return user;
}

export function hasPermission(user: SessionUser, permission: Permission): boolean {
  return roleHasPermission(user.role, permission);
}

export function isAdminRole(role: Role): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN';
}

/**
 * Ownership guard for IDOR protection.
 *
 * Preferred pattern: scope database queries by owner id so foreign resources
 * simply do not exist (404). Use this as a defence-in-depth assertion when a
 * resource was fetched by id.
 *
 * ADMIN/SUPER_ADMIN are allowed through (operational necessity), everything
 * else must match the owner.
 */
export function assertOwnership(
  user: SessionUser,
  ownerIds: string | string[] | null | undefined,
  opts: { allowAdmin?: boolean } = {},
): void {
  const allowAdmin = opts.allowAdmin ?? true;
  if (allowAdmin && (user.role === 'SUPER_ADMIN' || user.role === 'ADMIN')) return;
  const list = Array.isArray(ownerIds) ? ownerIds : [ownerIds];
  if (!user || !list || list.every((id) => id !== user.id)) {
    throw new AuthError(403, 'FORBIDDEN', 'Not allowed to access this resource');
  }
}
