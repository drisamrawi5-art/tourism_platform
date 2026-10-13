import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { requestPasswordReset } from '@/lib/auth/service';

const bodySchema = z.object({
  email: z.string().email(),
  locale: z.enum(['en', 'fr', 'ar']).optional(),
});

/** POST /api/v1/auth/password-forgot — always the same response (no enumeration). */
export const POST = createHandler({
  method: 'POST',
  rateLimit: RATE_LIMITS.passwordReset,
  schema: { body: bodySchema },
  handler: async ({ body, ip }) => {
    await requestPasswordReset({
      email: body.email,
      locale: body.locale ?? 'en',
      ip,
    });
    return { data: { ok: true } };
  },
});
