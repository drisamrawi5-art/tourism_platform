import { z } from 'zod';
import { createHandler } from '@/lib/api/handler';
import { RATE_LIMITS } from '@/lib/rate-limit';
import { quoteBooking } from '@/lib/booking/service';

const dateOnly = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD');

const bodySchema = z.object({
  bookableId: z.string().min(1),
  startDate: dateOnly,
  endDate: dateOnly,
  guests: z.number().int().min(1).max(50),
});

/** POST /api/v1/bookings/quote — authoritative price + availability preview. */
export const POST = createHandler({
  method: 'POST',
  auth: 'optional',
  rateLimit: RATE_LIMITS.generic,
  schema: { body: bodySchema },
  handler: async ({ body }) => {
    const quote = await quoteBooking({
      bookableId: body.bookableId,
      startDate: body.startDate,
      endDate: body.endDate,
      guests: body.guests,
    });
    return { data: quote };
  },
});
