import type { Role } from '@prisma/client';

/**
 * RBAC permission matrix — the single code-level source of truth.
 *
 * - Permissions gate WHAT operation type is allowed.
 * - Ownership checks (src/lib/auth/rbac.ts) gate WHICH resource is reachable
 *   (IDOR protection). Both are enforced server-side; the UI merely reflects
 *   them.
 * - The matrix is mirrored to the `permissions` / `role_permissions` tables by
 *   the seed for auditability (seed reads this map — never the reverse).
 *
 * Reserved permissions for future modules (restaurants, experiences, events,
 * transport, AI) exist so RBAC does not need redesigning at V2.
 */

export const ALL_PERMISSIONS = {
  // users & roles
  'user.read': 'View users',
  'user.manage': 'Manage users (suspend, delete)',
  'user.role.assign': 'Assign roles (super admin only)',

  // businesses / providers
  'business.create': 'Register a business',
  'business.read': 'View any business',
  'business.update': 'Update a business',
  'business.approve': 'Approve or reject a business',
  'business.submit': 'Submit a business for review',

  // services & pricing & availability
  'service.manage': 'Manage bookable services',
  'pricing.manage': 'Manage prices',
  'availability.manage': 'Manage availability',

  // content / CMS
  'content.read.draft': 'View unpublished content',
  'content.create': 'Create content',
  'content.update': 'Update content',
  'content.publish': 'Publish content',
  'place.manage': 'Manage destination places',
  'translations.manage': 'Manage content translations',
  'seo.manage': 'Manage SEO metadata',

  // media
  'media.upload': 'Upload media',
  'media.moderate': 'Moderate media and comments',

  // bookings
  'booking.create': 'Create a booking',
  'booking.read': 'View bookings',
  'booking.confirm': 'Confirm a booking',
  'booking.cancel': 'Cancel a booking',
  'booking.complete': 'Mark a booking completed',

  // payments
  'payment.create': 'Initiate a payment',
  'payment.read': 'View payments',
  'payment.refund': 'Issue refunds',

  // reviews
  'review.create': 'Write a review',
  'review.moderate': 'Moderate reviews',

  // commerce reporting
  'revenue.read': 'View revenue',

  // platform
  'settings.read': 'View settings',
  'settings.manage': 'Manage settings and feature flags',
  'analytics.read': 'View analytics',
  'audit.read': 'Read audit logs',
  'approvals.manage': 'Manage approval queues',
  'notification.manage': 'Send platform notifications',
} as const;

export type Permission = keyof typeof ALL_PERMISSIONS;
export type PermissionKey = Permission;

const CONTENT_MANAGER: Permission[] = [
  'content.read.draft',
  'content.create',
  'content.update',
  'content.publish',
  'place.manage',
  'translations.manage',
  'seo.manage',
  'media.upload',
  'media.moderate',
];

const PROVIDER: Permission[] = [
  'business.create',
  'business.update',
  'business.submit',
  'service.manage',
  'pricing.manage',
  'availability.manage',
  'media.upload',
  'booking.read',
  'booking.confirm',
  'booking.cancel',
  'booking.complete',
  'revenue.read',
];

const CUSTOMER: Permission[] = [
  'booking.create',
  'booking.read',
  'payment.create',
  'review.create',
];

export const ROLE_PERMISSIONS: Record<Role, Permission[]> = {
  SUPER_ADMIN: Object.keys(ALL_PERMISSIONS) as Permission[],

  ADMIN: [
    'user.read',
    'user.manage',
    'business.read',
    'business.update',
    'business.approve',
    'service.manage',
    'pricing.manage',
    'availability.manage',
    'content.read.draft',
    'content.create',
    'content.update',
    'content.publish',
    'place.manage',
    'translations.manage',
    'seo.manage',
    'media.upload',
    'media.moderate',
    'booking.read',
    'booking.confirm',
    'booking.cancel',
    'booking.complete',
    'payment.read',
    'payment.refund',
    'review.moderate',
    'revenue.read',
    'settings.read',
    'settings.manage',
    'analytics.read',
    'audit.read',
    'approvals.manage',
    'notification.manage',
  ],

  CONTENT_MANAGER: CONTENT_MANAGER,

  BUSINESS_OWNER: PROVIDER,
  GUIDE: PROVIDER,
  CUSTOMER: CUSTOMER,
};

export function isPermission(key: string): key is Permission {
  return key in ALL_PERMISSIONS;
}

export function roleHasPermission(role: Role, permission: Permission): boolean {
  const list = ROLE_PERMISSIONS[role];
  return Array.isArray(list) && list.includes(permission);
}
