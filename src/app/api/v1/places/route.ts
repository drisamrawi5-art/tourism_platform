import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { getPlaces } from '@/lib/data/places';

/** Integer-in-range check for query params (createHandler requires string-valued query output). */
const intInRange =
  (min: number, max: number) =>
  (value: string): boolean => {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max;
  };

const querySchema = z.object({
  locale: z.enum(['en', 'fr', 'ar']).optional(),
  featured: z.enum(['1', 'true']).optional(),
  take: z.string().refine(intInRange(1, 50), 'take must be an integer between 1 and 50').optional(),
});

export const GET = createHandler({
  method: 'GET',
  auth: 'optional',
  schema: { query: querySchema },
  handler: async ({ query }) => {
    const result = await getPlaces(query.locale ?? 'en', {
      featured: query.featured !== undefined,
      take: query.take === undefined ? undefined : Number(query.take),
    });
    return { data: result };
  },
});
