import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { getAccommodations } from '@/lib/data/businesses';

/** Integer-in-range check for query params (createHandler requires string-valued query output). */
const intInRange =
  (min: number, max: number) =>
  (value: string): boolean => {
    const n = Number(value);
    return Number.isInteger(n) && n >= min && n <= max;
  };

const querySchema = z.object({
  locale: z.enum(['en', 'fr', 'ar']).optional(),
  capacity: z
    .string()
    .refine(intInRange(1, 100), 'capacity must be an integer between 1 and 100')
    .optional(),
  page: z
    .string()
    .refine(intInRange(1, 1000), 'page must be an integer between 1 and 1000')
    .optional(),
  perPage: z
    .string()
    .refine(intInRange(1, 100), 'perPage must be an integer between 1 and 100')
    .optional(),
});

export const GET = createHandler({
  method: 'GET',
  auth: 'optional',
  schema: { query: querySchema },
  handler: async ({ query }) => {
    const result = await getAccommodations(query.locale ?? 'en', {
      capacity: query.capacity === undefined ? undefined : Number(query.capacity),
      page: query.page === undefined ? undefined : Number(query.page),
      perPage: query.perPage === undefined ? undefined : Number(query.perPage),
    });
    return {
      data: {
        items: result.items,
        total: result.total,
        page: result.page,
        perPage: result.perPage,
      },
    };
  },
});
