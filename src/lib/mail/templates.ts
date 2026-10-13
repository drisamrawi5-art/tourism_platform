import type { Locale } from '@/i18n/config';
import { getDictionary } from '@/i18n';
import { env } from '@/lib/env';
import type { MailMessage } from '@/lib/mail';

/**
 * Email templates — rendered from the i18n dictionaries (single source of
 * copy; no duplicated strings). All templates include the platform footer.
 */

function footer(locale: Locale): string {
  return getDictionary(locale).emails.footerNote;
}

function withFooter(body: string, locale: Locale): string {
  return `${body}\n\n—\n${footer(locale)}`;
}

export function verificationEmail(input: {
  to: string;
  locale: Locale;
  token: string;
}): MailMessage {
  const d = getDictionary(input.locale).emails;
  const link = `${env.appUrl}/${input.locale}/verify-email?token=${encodeURIComponent(input.token)}`;
  return {
    to: input.to,
    subject: d.verifySubject,
    text: withFooter(`${d.verifyIntro}\n\n${d.verifyCta}: ${link}`, input.locale),
  };
}

export function passwordResetEmail(input: {
  to: string;
  locale: Locale;
  token: string;
}): MailMessage {
  const d = getDictionary(input.locale).emails;
  const link = `${env.appUrl}/${input.locale}/password-reset?token=${encodeURIComponent(input.token)}`;
  return {
    to: input.to,
    subject: d.resetSubject,
    text: withFooter(`${d.resetIntro}\n\n${d.resetCta}: ${link}`, input.locale),
  };
}

type BookingEmailKind =
  | 'booking.created'
  | 'booking.confirmed'
  | 'booking.cancelled'
  | 'payment.succeeded'
  | 'payment.failed'
  | 'review.requested';

const SUBJECTS: Record<BookingEmailKind, keyof ReturnType<typeof getDictionary>['emails']> = {
  'booking.created': 'bookingCreatedSubject',
  'booking.confirmed': 'bookingConfirmedSubject',
  'booking.cancelled': 'bookingCancelledSubject',
  'payment.succeeded': 'paymentSucceededSubject',
  'payment.failed': 'paymentFailedSubject',
  'review.requested': 'reviewRequestSubject',
};

export function bookingEmail(
  kind: BookingEmailKind,
  input: { to: string; locale: Locale; reference: string; extra?: string },
): MailMessage {
  const emails = getDictionary(input.locale).emails;
  const key = SUBJECTS[kind];
  const subject = String(emails[key]).replaceAll('{ref}', input.reference);
  const body = input.extra ? `${subject}\n\n${input.extra}` : subject;
  return { to: input.to, subject, text: withFooter(body, input.locale) };
}

export function businessStatusEmail(input: {
  to: string;
  locale: Locale;
  approved: boolean;
  reason?: string;
}): MailMessage {
  const emails = getDictionary(input.locale).emails;
  const subject = input.approved ? emails.businessApprovedSubject : emails.businessRejectedSubject;
  const body = input.reason ? `${subject}\n\n${input.reason}` : subject;
  return { to: input.to, subject, text: withFooter(body, input.locale) };
}
