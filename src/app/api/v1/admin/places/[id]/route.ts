import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';
import {
  isForeignKeyError,
  placeTranslationInput,
  zPublicationStatus,
  zVerificationStatus,
  type PlaceTranslationInput,
} from '../../_shared/queries';

const paramsSchema = z.object({ id: z.string().min(1) });

const patchBodySchema = z.object({
  typeLabel: z.string().max(120).nullable().optional(),
  status: zPublicationStatus.optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  noIndex: z.boolean().optional(),
  verificationStatus: zVerificationStatus.optional(),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  translations: z
    .object({
      en: placeTranslationInput.optional(),
      fr: placeTranslationInput.optional(),
      ar: placeTranslationInput.optional(),
    })
    .optional(),
});

/** PATCH /api/v1/admin/places/[id] — partial update incl. per-locale translations. */
export const PATCH = createHandler({
  method: 'PATCH',
  auth: 'required',
  permission: 'place.manage',
  schema: { params: paramsSchema, body: patchBodySchema },
  handler: async ({ params, body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const existing = await db.place.findUnique({
      where: { id: params.id },
      select: { id: true, slug: true, status: true, lat: true, lng: true },
    });
    if (!existing) throw ApiError.notFound('Place not found');

    // Coordinates are all-or-nothing — never half a coordinate pair, never
    // an invented one.
    if ((body.lat === undefined) !== (body.lng === undefined)) {
      throw ApiError.badRequest('COORDINATES_REQUIRED', 'Provide both lat and lng, or neither');
    }

    const entries: Array<{ locale: 'en' | 'fr' | 'ar'; value: PlaceTranslationInput }> = [];
    if (body.translations?.en) entries.push({ locale: 'en', value: body.translations.en });
    if (body.translations?.fr) entries.push({ locale: 'fr', value: body.translations.fr });
    if (body.translations?.ar) entries.push({ locale: 'ar', value: body.translations.ar });

    const updated = await db.place.update({
      where: { id: existing.id },
      data: {
        ...(body.typeLabel !== undefined ? { typeLabel: body.typeLabel } : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.featured !== undefined ? { featured: body.featured } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.noIndex !== undefined ? { noIndex: body.noIndex } : {}),
        ...(body.verificationStatus !== undefined
          ? { verificationStatus: body.verificationStatus }
          : {}),
        ...(body.lat !== undefined && body.lng !== undefined
          ? { lat: body.lat, lng: body.lng }
          : {}),
        ...(entries.length > 0
          ? {
              translations: {
                upsert: entries.map(({ locale, value }) => ({
                  where: { placeId_locale: { placeId: existing.id, locale } },
                  update: {
                    name: value.name,
                    typeLabel: value.typeLabel ?? null,
                    summary: value.summary ?? null,
                  },
                  create: {
                    locale,
                    name: value.name,
                    typeLabel: value.typeLabel ?? null,
                    summary: value.summary ?? null,
                  },
                })),
              },
            }
          : {}),
      },
      include: { translations: true },
    });

    if (body.status === 'PUBLISHED' && existing.status !== 'PUBLISHED') {
      void audit({
        actorId: user.id,
        action: AUDIT_ACTIONS.contentPublished,
        entityType: 'place',
        entityId: existing.id,
        metadata: { slug: existing.slug, from: existing.status, to: 'PUBLISHED' },
        ip,
      });
    }

    return { data: { place: updated } };
  },
});

/** DELETE /api/v1/admin/places/[id] — only when nothing references the place. */
export const DELETE = createHandler({
  method: 'DELETE',
  auth: 'required',
  permission: 'place.manage',
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const existing = await db.place.findUnique({
      where: { id: params.id },
      select: { id: true, slug: true },
    });
    if (!existing) throw ApiError.notFound('Place not found');

    const [mediaCount, albumCount] = await Promise.all([
      db.media.count({ where: { placeId: existing.id } }),
      db.mediaAlbum.count({ where: { placeId: existing.id } }),
    ]);
    if (mediaCount > 0 || albumCount > 0) {
      throw ApiError.conflict(
        'PLACE_IN_USE',
        'Place still has media attached — remove it before deleting',
      );
    }

    try {
      await db.place.delete({ where: { id: existing.id } });
    } catch (error) {
      if (isForeignKeyError(error)) {
        throw ApiError.conflict('PLACE_IN_USE', 'Place is still referenced');
      }
      throw error;
    }

    return { data: { deleted: true } };
  },
});
