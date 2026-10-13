/**
 * Shared Prisma include for booking detail/list queries.
 * Lives in lib so route modules only export HTTP handlers (Next.js rule).
 */
export const bookingInclude = {
  business: { select: { id: true, name: true, slug: true, ownerId: true, type: true } },
  items: {
    include: {
      bookable: {
        select: {
          slug: true,
          category: true,
          unit: { select: { name: true } },
          guideService: { select: { name: true } },
        },
      },
    },
  },
  payments: { orderBy: { createdAt: 'desc' as const } },
} as const;
