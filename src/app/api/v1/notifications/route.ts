import { z } from "zod";
import { createHandler } from "@/lib/api/handler";
import { db } from "@/lib/db";
import { getNotifications, markAllRead } from "@/lib/notifications";

/** GET /api/v1/notifications — the signed-in user's in-app notifications. */
const querySchema = z.object({
  page: z.string().optional(),
  perPage: z.string().optional(),
  unread: z.enum(["1", "true"]).optional(),
});

export const GET = createHandler({
  method: "GET",
  auth: "required",
  schema: { query: querySchema },
  handler: async ({ query, user }) => {
    const page = Number.parseInt(query.page ?? "1", 10);
    const perPage = Number.parseInt(query.perPage ?? "20", 10);
    const result = await getNotifications(user!.id, {
      page: Number.isFinite(page) && page > 0 ? page : 1,
      perPage: Number.isFinite(perPage) && perPage > 0 ? Math.min(perPage, 50) : 20,
      unreadOnly: query.unread !== undefined,
    });
    return {
      data: {
        items: result.items.map((n) => ({
          id: n.id,
          type: n.type,
          channel: n.channel,
          data: n.data,
          readAt: n.readAt ? n.readAt.toISOString() : null,
          createdAt: n.createdAt.toISOString(),
        })),
        total: result.total,
        unread: result.unread,
      },
    };
  },
});

/** POST /api/v1/notifications/read-all */
export const POST = createHandler({
  method: "POST",
  auth: "required",
  handler: async ({ user }) => {
    await markAllRead(user!.id);
    return { data: { read: true } };
  },
});
