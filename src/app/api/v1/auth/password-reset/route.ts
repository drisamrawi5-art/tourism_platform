import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { resetPasswordWithToken } from '@/lib/auth/service';

const bodySchema = z.object({
  token: z.string().min(10),
  password: z.string().min(10).max(128),
});

/** POST /api/v1/auth/password-reset — consume a mailed reset token. */
export const POST = createHandler({
  method: 'POST',
  rateLimit: RATE_LIMITS.passwordReset,
  schema: { body: bodySchema },
  handler: async ({ body }) => {
    await resetPasswordWithToken(body.token, body.password);
    return { data: { ok: true } };
  },
});
