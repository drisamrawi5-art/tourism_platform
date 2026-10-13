import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { registerUser } from '@/lib/auth/service';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(128),
  name: z.string().max(120).optional(),
  locale: z.enum(['en', 'fr', 'ar']).optional(),
  wantsProvider: z.boolean().optional(),
});

/** POST /api/v1/auth/register — public, rate-limited, anti-enumeration. */
export const POST = createHandler({
  method: 'POST',
  rateLimit: RATE_LIMITS.register,
  schema: { body: bodySchema },
  handler: async ({ body, ip, userAgent }) => {
    try {
      await registerUser({
        email: body.email,
        password: body.password,
        name: body.name,
        locale: body.locale,
        wantsProvider: body.wantsProvider,
        ip,
        userAgent,
      });
    } catch (error) {
      // Anti-enumeration: an already-registered e-mail answers exactly like a
      // success so the form cannot be used to probe for accounts.
      if (!(error instanceof ApiError && error.code === 'EMAIL_TAKEN')) throw error;
    }
    return { status: 201, data: { ok: true } };
  },
});
