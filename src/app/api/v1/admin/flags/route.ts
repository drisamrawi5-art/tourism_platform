import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { FEATURE_FLAG_KEYS, setFeatureFlag, type FeatureFlagKey } from '@/lib/settings';

async function currentFlags(): Promise<Array<{ key: string; enabled: boolean }>> {
  const rows = await db.featureFlag.findMany();
  const byKey = new Map(rows.map((row) => [row.key, row.enabled]));
  return FEATURE_FLAG_KEYS.map((key) => ({
    key,
    enabled: byKey.get(key) ?? false,
  }));
}

/** GET /api/v1/admin/flags — feature flag states (default off). */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'settings.read',
  handler: async ({ user }) => {
    if (!user) throw ApiError.unauthenticated();
    const flags = await currentFlags();
    return { data: { flags } };
  },
});

/** PUT /api/v1/admin/flags — toggle one known feature flag. */
export const PUT = createHandler({
  method: 'PUT',
  auth: 'required',
  permission: 'settings.manage',
  schema: {
    body: z.object({
      key: z.string().min(1).max(60),
      enabled: z.boolean(),
    }),
  },
  handler: async ({ body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    if (!(FEATURE_FLAG_KEYS as readonly string[]).includes(body.key)) {
      throw new ApiError(404, 'UNKNOWN_FLAG', `Unknown feature flag: ${body.key}`);
    }
    const key = body.key as FeatureFlagKey;

    await setFeatureFlag(key, body.enabled);

    void audit({
      actorId: user.id,
      action: AUDIT_ACTIONS.flagChanged,
      entityType: 'feature_flag',
      entityId: key,
      metadata: { key, enabled: body.enabled },
      ip,
    });

    const flags = await currentFlags();
    return { data: { flags } };
  },
});
