import { z } from 'zod';
import { createHandler, parsePagination } from '@/lib/api/handler';
import { getNotifications } from '@/lib/notifications';

const querySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
});

/** GET /api/v1/account/notifications — the caller's notifications, paginated. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  schema: { query: querySchema },
  handler: async ({ query, user }) => {
    const pagination = parsePagination(query, { perPage: 10, maxPerPage: 50 });
    const { items, total, unread } = await getNotifications(user!.id, {
      page: pagination.page,
      perPage: pagination.perPage,
    });
    return { data: { items, total, unread } };
  },
});
