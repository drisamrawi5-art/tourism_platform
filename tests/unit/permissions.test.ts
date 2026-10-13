import { describe, expect, it } from 'vitest';
import type { Role } from '@prisma/client';
import {
  ALL_PERMISSIONS,
  ROLE_PERMISSIONS,
  isPermission,
  roleHasPermission,
  type Permission,
} from '@/lib/auth/permissions';

const ROLES: Role[] = [
  'SUPER_ADMIN',
  'ADMIN',
  'CONTENT_MANAGER',
  'BUSINESS_OWNER',
  'GUIDE',
  'CUSTOMER',
];

const ALL_KEYS = Object.keys(ALL_PERMISSIONS);

describe('RBAC matrix', () => {
  it('covers every role with no duplicates', () => {
    expect(Object.keys(ROLE_PERMISSIONS).sort()).toEqual([...ROLES].sort());
    for (const role of ROLES) {
      const list = ROLE_PERMISSIONS[role];
      expect(Array.isArray(list)).toBe(true);
      expect(new Set(list).size).toBe(list.length);
    }
  });

  it('grants only permissions that exist', () => {
    for (const role of ROLES) {
      for (const permission of ROLE_PERMISSIONS[role]) {
        expect(isPermission(permission)).toBe(true);
      }
    }
  });

  it('assigns every declared permission to at least one role (no orphans)', () => {
    const granted = new Set<string>(ROLES.flatMap((r) => ROLE_PERMISSIONS[r]));
    for (const key of ALL_KEYS) {
      expect(granted.has(key)).toBe(true);
    }
  });

  it('SUPER_ADMIN holds every permission', () => {
    expect([...ROLE_PERMISSIONS.SUPER_ADMIN].sort()).toEqual([...ALL_KEYS].sort());
  });

  it('ADMIN is a strict subset of SUPER_ADMIN without role assignment', () => {
    const admin = new Set(ROLE_PERMISSIONS.ADMIN);
    const superAdmin = new Set(ROLE_PERMISSIONS.SUPER_ADMIN);
    for (const p of admin) expect(superAdmin.has(p)).toBe(true);
    expect(admin.has('user.role.assign')).toBe(false); // super admin only
    expect(superAdmin.has('user.role.assign')).toBe(true);
  });

  it('CUSTOMER has no operational/administrative powers', () => {
    const customer = new Set<string>(ROLE_PERMISSIONS.CUSTOMER);
    expect([...customer].sort()).toEqual(
      ['booking.create', 'booking.read', 'payment.create', 'review.create'].sort(),
    );
    for (const forbidden of [
      'user.manage',
      'business.approve',
      'settings.manage',
      'payment.refund',
      'audit.read',
      'content.publish',
      'place.manage',
      'media.moderate',
      'revenue.read',
      'booking.confirm',
    ] as Permission[]) {
      expect(customer.has(forbidden)).toBe(false);
    }
  });

  it('provider roles (BUSINESS_OWNER, GUIDE) share the same capabilities', () => {
    expect([...ROLE_PERMISSIONS.BUSINESS_OWNER].sort()).toEqual([...ROLE_PERMISSIONS.GUIDE].sort());
    const provider = new Set<string>(ROLE_PERMISSIONS.BUSINESS_OWNER);
    expect(provider.has('business.create')).toBe(true);
    expect(provider.has('pricing.manage')).toBe(true);
    expect(provider.has('revenue.read')).toBe(true);
    expect(provider.has('business.approve')).toBe(false); // cannot self-approve
    expect(provider.has('payment.refund')).toBe(false);
    expect(provider.has('user.manage')).toBe(false);
  });

  it('CONTENT_MANAGER is limited to content/media capabilities', () => {
    const cm = new Set<string>(ROLE_PERMISSIONS.CONTENT_MANAGER);
    expect(cm.has('place.manage')).toBe(true);
    expect(cm.has('media.moderate')).toBe(true);
    expect(cm.has('business.approve')).toBe(false);
    expect(cm.has('payment.refund')).toBe(false);
    expect(cm.has('settings.manage')).toBe(false);
  });

  it('roleHasPermission answers strictly from the matrix', () => {
    expect(roleHasPermission('SUPER_ADMIN', 'settings.manage')).toBe(true);
    expect(roleHasPermission('ADMIN', 'settings.manage')).toBe(true);
    expect(roleHasPermission('CUSTOMER', 'settings.manage')).toBe(false);
    expect(roleHasPermission('CUSTOMER', 'booking.create')).toBe(true);
    expect(roleHasPermission('BUSINESS_OWNER', 'revenue.read')).toBe(true);
    expect(roleHasPermission('CONTENT_MANAGER', 'revenue.read')).toBe(false);
  });
});
