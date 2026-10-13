import { createHandler } from '@/lib/api/handler';

/** GET /api/v1/auth/me — current session user, or null when anonymous. */
export const GET = createHandler({
  method: 'GET',
  auth: 'optional',
  handler: async ({ user }) => ({
    data: {
      user: user
        ? {
            id: user.id,
            email: user.email,
            name: user.name,
            role: user.role,
            locale: user.locale,
            emailVerifiedAt: user.emailVerifiedAt,
          }
        : null,
    },
  }),
});
