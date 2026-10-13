import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { getAllSettings, setSetting, SETTING_DEFAULTS, type SettingKey } from '@/lib/settings';

function isSettingKey(key: string): key is SettingKey {
  return Object.prototype.hasOwnProperty.call(SETTING_DEFAULTS, key);
}

/**
 * Validate an incoming value against the shape implied by the setting's
 * typed default. Nullable settings (per-category overrides) accept null plus
 * the primitive implied by the key suffix (`.enabled` → boolean,
 * `.percent`/`.ratePercent` → number).
 */
function assertValidSettingValue(key: SettingKey, value: unknown): void {
  const invalid = () =>
    ApiError.badRequest(
      'INVALID_SETTING_VALUE',
      `Value for ${key} does not match the expected type`,
    );

  const def = SETTING_DEFAULTS[key];
  if (def === null) {
    if (value === null) return;
    if (key.endsWith('.enabled') && typeof value === 'boolean') return;
    if (
      (key.endsWith('.percent') || key.endsWith('.ratePercent')) &&
      typeof value === 'number' &&
      Number.isFinite(value)
    ) {
      return;
    }
    throw invalid();
  }
  if (typeof def === 'number') {
    if (typeof value !== 'number' || !Number.isFinite(value)) throw invalid();
    return;
  }
  if (typeof def === 'boolean') {
    if (typeof value !== 'boolean') throw invalid();
    return;
  }
  if (typeof def === 'string') {
    if (typeof value !== 'string') throw invalid();
    return;
  }
  if (Array.isArray(def)) {
    if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
      throw invalid();
    }
    return;
  }
  // Localised content objects (homepage copy): a plain object whose fields
  // all exist on the default and hold strings. Unknown fields are rejected
  // so a typo can never persist silently; an empty string means "inherit
  // the built-in copy" — it never invents text. Missing fields are allowed
  // (they simply keep the default) so partial saves stay safe.
  if (typeof def === 'object' && def !== null) {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) {
      throw invalid();
    }
    const defaults = def as Record<string, unknown>;
    const incoming = value as Record<string, unknown>;
    for (const [field, fieldValue] of Object.entries(incoming)) {
      if (!Object.prototype.hasOwnProperty.call(defaults, field)) throw invalid();
      if (typeof fieldValue !== 'string' || fieldValue.length > 5000) throw invalid();
    }
    return;
  }
  throw invalid();
}

/** GET /api/v1/admin/settings — effective settings (defaults + overrides). */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'settings.read',
  handler: async ({ user }) => {
    if (!user) throw ApiError.unauthenticated();
    const settings = await getAllSettings();
    return { data: { settings } };
  },
});

/** PUT /api/v1/admin/settings — update one known setting with a typed value. */
export const PUT = createHandler({
  method: 'PUT',
  auth: 'required',
  permission: 'settings.manage',
  schema: {
    body: z.object({
      key: z.string().min(1).max(120),
      value: z.unknown(),
    }),
  },
  handler: async ({ body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    if (!isSettingKey(body.key)) {
      throw new ApiError(404, 'UNKNOWN_SETTING', `Unknown setting key: ${body.key}`);
    }
    assertValidSettingValue(body.key, body.value);

    await setSetting(body.key, body.value, user.id);

    void audit({
      actorId: user.id,
      action: AUDIT_ACTIONS.settingsChanged,
      entityType: 'setting',
      entityId: body.key,
      metadata: { key: body.key },
      ip,
    });

    const settings = await getAllSettings();
    return { data: { settings } };
  },
});
