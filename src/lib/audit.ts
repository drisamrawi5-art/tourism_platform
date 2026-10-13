import { db } from '@/lib/db';
import { logger } from '@/lib/logger';

/**
 * Audit logging (spec section 58).
 * Records security and business-critical events. Never logs secrets —
 * metadata passes through the same redaction used by the structured logger.
 */

// Local redaction mirroring logger rules (kept independent so audit.ts can be
// imported without pulling route code).
const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'token',
  'tokenhash',
  'secret',
  'apikey',
  'authorization',
  'cookie',
  'cardnumber',
  'cvv',
  'cvc',
  'payload',
]);

function sanitize(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 5) return '[deep]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => sanitize(v, depth + 1));
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = SENSITIVE_KEYS.has(k.toLowerCase()) ? '[redacted]' : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 2000) return `${value.slice(0, 500)}…[truncated]`;
  return value;
}

export type AuditEntry = {
  actorId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  metadata?: Record<string, unknown>;
  ip?: string | null;
  userAgent?: string | null;
};

export async function audit(entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: entry.actorId ?? null,
        action: entry.action,
        entityType: entry.entityType ?? null,
        entityId: entry.entityId ?? null,
        metadata: entry.metadata ? (sanitize(entry.metadata) as object) : undefined,
        ip: entry.ip ?? null,
        userAgent: entry.userAgent ? entry.userAgent.slice(0, 300) : null,
      },
    });
  } catch (error) {
    // Auditing must never break the main operation, but failures are loud.
    logger.error('audit_write_failed', {
      action: entry.action,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

/** Well-known action names (keep centralised for admin filtering). */
export const AUDIT_ACTIONS = {
  loginSuccess: 'auth.login.success',
  loginFailed: 'auth.login.failed',
  loginLocked: 'auth.login.locked',
  logout: 'auth.logout',
  register: 'auth.register',
  emailVerified: 'auth.email.verified',
  passwordResetRequest: 'auth.password.reset.request',
  passwordResetDone: 'auth.password.reset.done',
  roleChanged: 'user.role.changed',
  userSuspended: 'user.suspended',
  businessSubmitted: 'business.submitted',
  businessApproved: 'business.approved',
  businessRejected: 'business.rejected',
  contentPublished: 'content.published',
  priceChanged: 'booking.price.changed',
  availabilityChanged: 'booking.availability.changed',
  bookingCreated: 'booking.created',
  bookingConfirmed: 'booking.confirmed',
  bookingCancelled: 'booking.cancelled',
  bookingCompleted: 'booking.completed',
  paymentCreated: 'payment.created',
  paymentSucceeded: 'payment.succeeded',
  paymentFailed: 'payment.failed',
  refundIssued: 'refund.issued',
  refundSucceeded: 'refund.succeeded',
  reviewCreated: 'review.created',
  reviewModerated: 'review.moderated',
  settingsChanged: 'settings.changed',
  flagChanged: 'feature_flag.changed',
} as const;
