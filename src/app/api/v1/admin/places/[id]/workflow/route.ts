import type { PublicationStatus } from '@prisma/client';
import { z } from 'zod';
import { AUDIT_ACTIONS, audit } from '@/lib/audit';
import { ApiError } from '@/lib/api/errors';
import { createHandler } from '@/lib/api/handler';
import { db } from '@/lib/db';

const TRANSITIONS: Record<string, { from: readonly PublicationStatus[]; to: PublicationStatus }> = {
  submit: { from: ['DRAFT', 'REJECTED'], to: 'PENDING_REVIEW' },
  approve: { from: ['PENDING_REVIEW'], to: 'APPROVED' },
  reject: { from: ['PENDING_REVIEW'], to: 'REJECTED' },
  publish: { from: ['APPROVED'], to: 'PUBLISHED' },
  unpublish: { from: ['PUBLISHED'], to: 'DRAFT' },
};

export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  permission: 'place.manage',
  schema: {
    params: z.object({ id: z.string().min(1) }),
    body: z.object({
      action: z.enum(['submit', 'approve', 'reject', 'publish', 'unpublish']),
    }),
  },
  handler: async ({ params, body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const place = await db.place.findUnique({ where: { id: params.id } });
    if (!place) throw ApiError.notFound();

    const transition = TRANSITIONS[body.action];
    if (!transition || !transition.from.includes(place.status)) {
      throw ApiError.conflict(
        'INVALID_TRANSITION',
        `Cannot ${body.action} a place in status ${place.status}`,
      );
    }

    if (body.action === 'publish') {
      const en = await db.placeTranslation.findUnique({
        where: { placeId_locale: { placeId: place.id, locale: 'en' } },
        select: { name: true },
      });
      if (!en || !en.name) {
        throw ApiError.badRequest(
          'MISSING_EN_TRANSLATION',
          'An English translation with a name is required before publishing',
        );
      }
    }

    const updated = await db.place.update({
      where: { id: place.id },
      data: { status: transition.to },
    });

    if (body.action === 'publish') {
      void audit({
        actorId: user.id,
        action: AUDIT_ACTIONS.contentPublished,
        entityType: 'place',
        entityId: place.id,
        ip,
        metadata: { slug: place.slug },
      });
    }

    return { data: { place: updated } };
  },
});
