import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { verifyEmailToken } from '@/lib/auth/service';

const bodySchema = z.object({ token: z.string().min(10) });

/** POST /api/v1/auth/verify-email — consume a mailed verification token. */
export const POST = createHandler({
  method: 'POST',
  rateLimit: RATE_LIMITS.emailVerify,
  schema: { body: bodySchema },
  handler: async ({ body }) => {
    await verifyEmailToken(body.token);
    return { data: { ok: true } };
  },
});
