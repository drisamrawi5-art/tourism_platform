import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { ApiError } from '@/lib/api/errors';
import { createHandler, paginated, parsePagination } from '@/lib/api/handler';
import { db } from '@/lib/db';
import { zMediaKind, zPublicationStatus } from '../_shared/queries';

const querySchema = z.object({
  status: zPublicationStatus.optional(),
  kind: zMediaKind.optional(),
  placeId: z.string().max(64).optional(),
  businessId: z.string().max(64).optional(),
  contentId: z.string().max(64).optional(),
  page: z.string().optional(),
  perPage: z.string().optional(),
});

/** GET /api/v1/admin/media — moderation list of uploads (all statuses). */
export const GET = createHandler({
  method: 'GET',
  auth: 'required',
  permission: 'media.moderate',
  schema: { query: querySchema },
  handler: async ({ query, user, requestId }) => {
    if (!user) throw ApiError.unauthenticated();
    const pagination = parsePagination(query);

    const where: Prisma.MediaWhereInput = {
      ...(query.status !== undefined && { status: query.status }),
      ...(query.kind !== undefined && { kind: query.kind }),
      ...(query.placeId !== undefined && { placeId: query.placeId }),
      ...(query.businessId !== undefined && { businessId: query.businessId }),
      ...(query.contentId !== undefined && { contentId: query.contentId }),
    };

    const [rows, total] = await Promise.all([
      db.media.findMany({
        where,
        select: {
          id: true,
          kind: true,
          storageKey: true,
          mimeType: true,
          sizeBytes: true,
          alt: true,
          caption: true,
          status: true,
          verificationStatus: true,
          createdAt: true,
          uploadedBy: { select: { id: true, name: true, email: true } },
          place: { select: { id: true, slug: true } },
          business: { select: { id: true, slug: true } },
          content: { select: { id: true, slug: true } },
          albumId: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.media.count({ where }),
    ]);

    const items = rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      storageKey: row.storageKey,
      mimeType: row.mimeType,
      sizeBytes: row.sizeBytes,
      alt: row.alt,
      caption: row.caption,
      status: row.status,
      verificationStatus: row.verificationStatus,
      createdAt: row.createdAt,
      uploadedBy: row.uploadedBy,
      target: {
        placeId: row.place?.id ?? null,
        businessId: row.business?.id ?? null,
        contentId: row.content?.id ?? null,
        albumId: row.albumId,
      },
    }));

    return paginated(items, total, pagination, requestId);
  },
});
