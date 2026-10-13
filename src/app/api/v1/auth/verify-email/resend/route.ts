import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { issueEmailVerification } from '@/lib/auth/service';
import type { Locale } from '@/i18n/config';

/** POST /api/v1/auth/verify-email/resend — re-send the mail for the signed-in user. */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_LIMITS.emailVerify,
  handler: async ({ user }) => {
    const actor = user!;
    const locale: Locale = actor.locale === 'fr' ? 'fr' : actor.locale === 'ar' ? 'ar' : 'en';
    await issueEmailVerification(actor.id, actor.email, locale);
    return { data: { ok: true } };
  },
});
