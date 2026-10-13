import { createHandler } from '@/lib/api/handler';
import { destroySession, getSession } from '@/lib/auth/session';
import { audit, AUDIT_ACTIONS } from '@/lib/audit';

/** POST /api/v1/auth/logout — idempotent; safe to call anonymously. */
export const POST = createHandler({
  method: 'POST',
  auth: 'optional',
  handler: async ({ user, ip }) => {
    const session = await getSession();
    await destroySession();
    void audit({
      actorId: user?.id,
      action: AUDIT_ACTIONS.logout,
      entityType: 'session',
      entityId: session?.id,
      ip,
    });
    return { data: { ok: true } };
  },
});
