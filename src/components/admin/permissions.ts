import type { Role } from "@prisma/client";
import { roleHasPermission, type Permission } from "@/lib/auth/permissions";
import type { AuthUser } from "@/components/auth/helpers";

/**
 * Client-side permission check that mirrors the server RBAC matrix
 * (src/lib/auth/permissions.ts). The API enforces the same permissions —
 * this only decides what the admin UI offers before a request is made.
 */
export function can(user: AuthUser | null, permission: Permission): boolean {
  return user !== null && roleHasPermission(user.role as Role, permission);
}
