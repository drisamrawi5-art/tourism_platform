import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { changePassword } from '@/lib/auth/service';
import { getSession } from '@/lib/auth/session';

const bodySchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(10).max(128),
});

/**
 * POST /api/v1/auth/password-change — rotates the password while keeping the
 * calling session alive (every other session is revoked by the service).
 */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  rateLimit: RATE_LIMITS.passwordReset,
  schema: { body: bodySchema },
  handler: async ({ body, user, ip }) => {
    const keepSessionId = (await getSession())?.id;
    await changePassword({
      userId: user!.id,
      currentPassword: body.currentPassword,
      newPassword: body.newPassword,
      keepSessionId,
      ip,
    });
    return { data: { ok: true } };
  },
});
