import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { RATE_LIMITS, rateLimit } from '@/lib/rate-limit';
import { loginUser } from '@/lib/auth/service';
import { db } from '@/lib/db';

const bodySchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(128),
});

/** POST /api/v1/auth/login — per-IP (handler) + per-account (manual) limits. */
export const POST = createHandler({
  method: 'POST',
  rateLimit: RATE_LIMITS.login,
  schema: { body: bodySchema },
  handler: async ({ body, ip, userAgent }) => {
    const decision = await rateLimit(`login:${body.email.trim().toLowerCase()}`, RATE_LIMITS.login);
    if (!decision.ok) {
      throw ApiError.rateLimited(Math.ceil(decision.retryAfterMs / 1000));
    }

    const { userId } = await loginUser({
      email: body.email,
      password: body.password,
      ip,
      userAgent,
    });

    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        locale: true,
        emailVerifiedAt: true,
      },
    });
    if (!user) throw ApiError.unauthenticated();

    return { data: { user } };
  },
});
