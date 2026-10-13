import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { roleHasPermission } from '@/lib/auth/permissions';
import { db } from '@/lib/db';
import {
  contentTranslationInput,
  isForeignKeyError,
  zPublicationStatus,
  zVerificationStatus,
  type ContentTranslationInput,
} from '../../_shared/queries';

const paramsSchema = z.object({ id: z.string().min(1) });

const patchBodySchema = z.object({
  status: zPublicationStatus.optional(),
  featured: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  noIndex: z.boolean().optional(),
  verificationStatus: zVerificationStatus.optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  translations: z
    .object({
      en: contentTranslationInput.optional(),
      fr: contentTranslationInput.optional(),
      ar: contentTranslationInput.optional(),
    })
    .optional(),
});

/** GET /api/v1/admin/content/[id] — content detail incl. drafts and author. */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'content.read.draft',
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    if (!user) throw ApiError.unauthenticated();
    const content = await db.content.findUnique({
      where: { id: params.id },
      include: {
        translations: true,
        author: { select: { id: true, name: true, email: true } },
      },
    });
    if (!content) throw ApiError.notFound('Content not found');
    return { data: { content } };
  },
});

/**
 * PATCH /api/v1/admin/content/[id] — update fields and translations.
 * Transitioning to PUBLISHED additionally requires `content.publish`.
 */
export const PATCH = createHandler({
  method: 'PATCH',
  auth: 'required',
  permission: 'content.update',
  schema: { params: paramsSchema, body: patchBodySchema },
  handler: async ({ params, body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const existing = await db.content.findUnique({
      where: { id: params.id },
      select: { id: true, slug: true, status: true },
    });
    if (!existing) throw ApiError.notFound('Content not found');

    const publishing = body.status === 'PUBLISHED' && existing.status !== 'PUBLISHED';
    if (publishing && !roleHasPermission(user.role, 'content.publish')) {
      throw ApiError.forbidden('Missing permission: content.publish');
    }

    const entries: Array<{ locale: 'en' | 'fr' | 'ar'; value: ContentTranslationInput }> = [];
    if (body.translations?.en) entries.push({ locale: 'en', value: body.translations.en });
    if (body.translations?.fr) entries.push({ locale: 'fr', value: body.translations.fr });
    if (body.translations?.ar) entries.push({ locale: 'ar', value: body.translations.ar });

    const updated = await db.content.update({
      where: { id: existing.id },
      data: {
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.featured !== undefined ? { featured: body.featured } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.noIndex !== undefined ? { noIndex: body.noIndex } : {}),
        ...(body.verificationStatus !== undefined
          ? { verificationStatus: body.verificationStatus }
          : {}),
        ...(publishing
          ? { publishedAt: body.publishedAt ?? new Date() }
          : body.publishedAt !== undefined
            ? { publishedAt: body.publishedAt }
            : {}),
        ...(entries.length > 0
          ? {
              translations: {
                upsert: entries.map(({ locale, value }) => ({
                  where: { contentId_locale: { contentId: existing.id, locale } },
                  update: {
                    title: value.title,
                    summary: value.summary ?? null,
                    body: value.body ?? null,
                  },
                  create: {
                    locale,
                    title: value.title,
                    summary: value.summary ?? null,
                    body: value.body ?? null,
                  },
                })),
              },
            }
          : {}),
      },
      include: {
        translations: true,
        author: { select: { id: true, name: true, email: true } },
      },
    });

    if (publishing) {
      void audit({
        actorId: user.id,
        action: AUDIT_ACTIONS.contentPublished,
        entityType: 'content',
        entityId: existing.id,
        metadata: { slug: existing.slug, from: existing.status, to: 'PUBLISHED' },
        ip,
      });
    }

    return { data: { content: updated } };
  },
});

/** DELETE /api/v1/admin/content/[id] — only when no media is attached. */
export const DELETE = createHandler({
  method: 'DELETE',
  auth: 'required',
  permission: 'content.update',
  schema: { params: paramsSchema },
  handler: async ({ params, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const existing = await db.content.findUnique({
      where: { id: params.id },
      select: { id: true },
    });
    if (!existing) throw ApiError.notFound('Content not found');

    const mediaCount = await db.media.count({ where: { contentId: existing.id } });
    if (mediaCount > 0) {
      throw ApiError.conflict(
        'CONTENT_IN_USE',
        'Content still has media attached — remove it before deleting',
      );
    }

    try {
      await db.content.delete({ where: { id: existing.id } });
    } catch (error) {
      if (isForeignKeyError(error)) {
        throw ApiError.conflict('CONTENT_IN_USE', 'Content is still referenced');
      }
      throw error;
    }

    return { data: { deleted: true } };
  },
});
