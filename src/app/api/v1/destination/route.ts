import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { ApiError } from '@/lib/api/errors';
import { getDestination } from '@/lib/data/destinations';

export const GET = createHandler({
  method: 'GET',
  auth: 'optional',
  schema: {
    query: z.object({ locale: z.enum(['en', 'fr', 'ar']).optional() }),
  },
  handler: async ({ query }) => {
    const item = await getDestination(query.locale ?? 'en');
    if (!item) throw ApiError.notFound();
    return { data: item };
  },
});
