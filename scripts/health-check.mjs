/* One-off health check after the C: → D: project move. */
import { PrismaClient } from "@prisma/client";

const db = new PrismaClient();
const [places, destinations, permissions, admins, arSample] = await Promise.all([
  db.place.count(),
  db.destination.count(),
  db.permission.count(),
  db.user.count({ where: { role: "SUPER_ADMIN" } }),
  db.placeTranslation.findFirst({ where: { locale: "ar" } }),
]);
console.log(
  JSON.stringify({
    places,
    destinations,
    permissions,
    admins,
    arSample: arSample?.name ?? null,
    settings: await db.setting.count(),
    flags: await db.featureFlag.count(),
  }),
);
await db.$disconnect();
