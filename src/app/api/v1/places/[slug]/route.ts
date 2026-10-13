import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { getPlaceBySlug } from '@/lib/data/places';

export const GET = createHandler({
  method: 'GET',
  auth: 'optional',
  schema: {
    params: z.object({ slug: z.string().min(1).max(120) }),
    query: z.object({ locale: z.enum(['en', 'fr', 'ar']).optional() }),
  },
  handler: async ({ params, query }) => {
    const item = await getPlaceBySlug(params.slug, query.locale ?? 'en');
    if (!item) throw ApiError.notFound();
    return { data: item };
  },
});
