import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';

const bodySchema = z.object({
  name: z.string().max(120).nullish(),
  phone: z.string().max(40).nullish(),
  locale: z.enum(['en', 'fr', 'ar']).optional(),
});

/** PATCH /api/v1/account/profile — update the caller's own profile only. */
export const PATCH = createHandler({
  method: 'PATCH',
  auth: 'required',
  schema: { body: bodySchema },
  handler: async ({ body, user }) => {
    const data: { name?: string | null; phone?: string | null; locale?: string } = {};
    if (body.name !== undefined) data.name = body.name;
    if (body.phone !== undefined) data.phone = body.phone;
    if (body.locale !== undefined) data.locale = body.locale;

    const updated = await db.user.update({
      where: { id: user!.id },
      data,
      select: {
        id: true,
        email: true,
        name: true,
        phone: true,
        role: true,
        locale: true,
        emailVerifiedAt: true,
      },
    });

    return { data: { user: updated } };
  },
});
