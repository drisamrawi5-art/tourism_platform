import { createHandler } from '@/lib/api/handler';
import { markAllRead } from '@/lib/notifications';

/** POST /api/v1/account/notifications/read-all — mark every notification read. */
export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  handler: async ({ user }) => {
    await markAllRead(user!.id);
    return { data: { ok: true } };
  },
});
