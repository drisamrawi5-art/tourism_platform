import type { Prisma } from '@prisma/client';
import { z } from 'zod';
import { createHandler, parsePagination } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { audit } from '@/lib/audit';
import { db } from '@/lib/db';
import { RATE_LIMITS } from '@/lib/rate-limit';

export const GET = createHandler({
  method: 'GET',
  auth: 'none',
  schema: {
    params: z.object({ id: z.string().min(1).max(60) }),
    query: z.object({
      page: z.string().max(10).optional(),
      perPage: z.string().max(10).optional(),
    }),
  },
  handler: async ({ params, query }) => {
    const pagination = parsePagination(
      { page: query.page ?? '', perPage: query.perPage ?? '' },
      { perPage: 20 },
    );
    const where: Prisma.MediaCommentWhereInput = {
      mediaId: params.id,
      status: 'APPROVED',
      parentId: null,
    };

    const [rows, total] = await Promise.all([
      db.mediaComment.findMany({
        where,
        include: {
          author: { select: { name: true } },
          replies: {
            where: { status: 'APPROVED' },
            orderBy: { createdAt: 'asc' },
            include: { author: { select: { name: true } } },
          },
        },
        orderBy: { createdAt: 'asc' },
        skip: pagination.skip,
        take: pagination.take,
      }),
      db.mediaComment.count({ where }),
    ]);

    return Response.json({
      data: rows,
      pagination: {
        page: pagination.page,
        perPage: pagination.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.perPage)),
      },
    });
  },
});

export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  verifiedEmail: true,
  rateLimit: RATE_LIMITS.comment,
  schema: {
    params: z.object({ id: z.string().min(1).max(60) }),
    body: z.object({
      body: z.string().min(1).max(2000),
      parentId: z.string().min(1).max(60).optional(),
    }),
  },
  handler: async ({ params, body, user, ip }) => {
    if (!user) throw ApiError.unauthenticated();

    const media = await db.media.findUnique({ where: { id: params.id }, select: { id: true } });
    if (!media) throw ApiError.notFound();

    let parentId: string | null = null;
    if (body.parentId) {
      // Replies nest exactly one level: parent must be a top-level comment of
      // this same media.
      const parent = await db.mediaComment.findFirst({
        where: { id: body.parentId, mediaId: params.id, parentId: null },
        select: { id: true },
      });
      if (!parent) throw ApiError.notFound();
      parentId = parent.id;
    }

    const comment = await db.mediaComment.create({
      data: {
        mediaId: params.id,
        authorId: user.id,
        parentId,
        body: body.body,
        status: 'PENDING',
      },
    });

    void audit({
      actorId: user.id,
      action: 'media.comment.created',
      entityType: 'media',
      entityId: comment.id,
      ip,
    });

    return { status: 201, data: { comment } };
  },
});
