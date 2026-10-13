import type { PublicationStatus } from '@prisma/client';
import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { roleHasPermission } from '@/lib/auth/permissions';

const TRANSITIONS: Record<string, { from: readonly PublicationStatus[]; to: PublicationStatus }> = {
  submit: { from: ['DRAFT', 'REJECTED'], to: 'PENDING_REVIEW' },
  approve: { from: ['PENDING_REVIEW'], to: 'APPROVED' },
  reject: { from: ['PENDING_REVIEW'], to: 'REJECTED' },
  publish: { from: ['APPROVED'], to: 'PUBLISHED' },
  archive: {
    from: ['DRAFT', 'PENDING_REVIEW', 'APPROVED', 'PUBLISHED', 'REJECTED'],
    to: 'ARCHIVED',
  },
};

export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  permission: 'content.update',
  schema: {
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      action: z.enum(['submit', 'approve', 'reject', 'publish', 'archive']),
    }),
  },
  handler: async ({ params, body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const content = await db.content.findUnique({ where: { id: params.id } });
    if (!content) throw ApiError.notFound();

    if (body.action === 'publish' && !roleHasPermission(user.role, 'content.publish')) {
      throw ApiError.forbidden('Only a user with content.publish can publish content');
    }

    const transition = TRANSITIONS[body.action];
    if (!transition || !transition.from.includes(content.status)) {
      throw ApiError.conflict(
        'INVALID_TRANSITION',
        `Cannot ${body.action} content in status ${content.status}`,
      );
    }

    if (body.action === 'publish') {
      const en = await db.contentTranslation.findUnique({
        where: { contentId_locale: { contentId: content.id, locale: 'en' } },
        select: { title: true },
      });
      if (!en || !en.title) {
        throw ApiError.badRequest(
          'MISSING_EN_TITLE',
          'An English translation with a title is required before publishing',
        );
      }
    }

    const updated = await db.content.update({
      where: { id: content.id },
      data: {
        status: transition.to,
        ...(body.action === 'publish' &&
          content.publishedAt === null && {
            publishedAt: new Date(),
          }),
      },
    });

    if (body.action === 'publish') {
      void audit({
        actorId: user.id,
        action: AUDIT_ACTIONS.contentPublished,
        entityType: 'content',
        entityId: content.id,
        ip,
        metadata: { slug: content.slug, kind: content.kind },
      });
    }

    return { data: { content: updated } };
  },
});
