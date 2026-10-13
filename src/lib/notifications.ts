import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { getMailer } from '@/lib/mail';
import { bookingEmail, businessStatusEmail } from '@/lib/mail/templates';
import type { Locale } from '@/i18n/config';

/**
 * Notification service (spec section 59).
 *
 * - In-app notifications are always persisted.
 * - Email is sent for business-critical events via the mail abstraction.
 * - Email failures never break the main operation (logged, retriable via
 *   emailSentAt remaining null).
 * - SMS / WhatsApp channels are reserved for a future channel abstraction.
 */

const EMAIL_TYPES = new Set([
  'booking.created',
  'booking.confirmed',
  'booking.cancelled',
  'payment.succeeded',
  'payment.failed',
  'review.requested',
  'business.approved',
  'business.rejected',
]);

function isLocale(value: string | null | undefined): value is Locale {
  return value === 'en' || value === 'fr' || value === 'ar';
}

export type NotifyData = { ref?: string; reason?: string; approved?: boolean } & Record<
  string,
  unknown
>;

export async function notify(
  userId: string,
  type: string,
  data: NotifyData = {},
  opts: { sendEmail?: boolean } = {},
): Promise<void> {
  try {
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, locale: true, status: true },
    });
    if (!user || user.status !== 'ACTIVE') return;

    const locale: Locale = isLocale(user.locale) ? user.locale : 'en';
    const shouldEmail = (opts.sendEmail ?? true) && EMAIL_TYPES.has(type);

    const row = await db.notification.create({
      data: {
        userId,
        type,
        locale,
        data: data as object,
        emailSentAt: null,
      },
    });

    if (shouldEmail) {
      const result = await sendTypeEmail(user.email, locale, type, data);
      if (result) {
        await db.notification.update({
          where: { id: row.id },
          data: { emailSentAt: new Date() },
        });
      }
    }
  } catch (error) {
    logger.error('notify_failed', {
      userId,
      type,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

async function sendTypeEmail(
  to: string,
  locale: Locale,
  type: string,
  data: NotifyData,
): Promise<boolean> {
  try {
    const mailer = getMailer();
    const reference = typeof data.ref === 'string' ? data.ref : '';

    let message;
    if (type.startsWith('booking.') || type.startsWith('payment.') || type === 'review.requested') {
      message = bookingEmail(type as never, {
        to,
        locale,
        reference,
        extra: typeof data.reason === 'string' ? data.reason : undefined,
      });
    } else if (type === 'business.approved' || type === 'business.rejected') {
      message = businessStatusEmail({
        to,
        locale,
        approved: type === 'business.approved',
        reason: typeof data.reason === 'string' ? data.reason : undefined,
      });
    } else {
      return false;
    }

    const res = await mailer.send(message);
    return res.status !== 'failed';
  } catch (error) {
    logger.error('notify_email_failed', {
      to,
      type,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

export async function getNotifications(
  userId: string,
  opts: { page: number; perPage: number; unreadOnly?: boolean },
) {
  const where = { userId, ...(opts.unreadOnly ? { readAt: null } : {}) };
  const [items, total, unread] = await Promise.all([
    db.notification.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (opts.page - 1) * opts.perPage,
      take: opts.perPage,
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { userId, readAt: null } }),
  ]);
  return { items, total, unread };
}

export async function markAllRead(userId: string): Promise<void> {
  await db.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
