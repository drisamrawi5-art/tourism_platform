import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { db } from '@/lib/db';

export const POST = createHandler({
  method: 'POST',
  auth: 'required',
  schema: {
    params: z.object({ id: z.string().min(1).max(60) }),
  },
  handler: async ({ params, user }) => {
    if (!user) throw ApiError.unauthenticated();

    const media = await db.media.findUnique({
      where: { id: params.id },
      select: { status: true },
    });
    const served = media !== null && (media.status === 'PUBLISHED' || media.status === 'APPROVED');
    if (!served) throw ApiError.notFound();

    const existing = await db.mediaLike.findFirst({
      where: { mediaId: params.id, userId: user.id },
    });

    let liked: boolean;
    if (existing) {
      await db.mediaLike.delete({ where: { id: existing.id } });
      liked = false;
    } else {
      await db.mediaLike.create({ data: { mediaId: params.id, userId: user.id } });
      liked = true;
    }

    const count = await db.mediaLike.count({ where: { mediaId: params.id } });
    return { data: { liked, count } };
  },
});
