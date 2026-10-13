import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, t } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getAccommodationBySlug } from "@/lib/data/businesses";
import { EmptyState } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import {
  Card,
  CardBody,
  CardHeader,
  Container,
  PageHero,
  Section,
  SectionHeader,
} from "@/components/ui/card";
import { SmartImage } from "@/components/ui/image";
import {
  BackLink,
  CmsBody,
  PriceText,
  RatingBadge,
  VerificationBadge,
} from "@/components/discovery/bits";
import { PlaceMapLink } from "@/components/discovery/map-link";

/**
 * Accommodation detail — overview, address/coordinates (honest pending
 * state), the provider's units with real unit prices, and a booking CTA
 * only for units that actually have a bookable.
 */

type Params = { locale: string; slug: string };

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const item = await getAccommodationBySlug(slug, locale);
  if (!item) notFound();

  return buildMetadata({
    locale,
    path: `/stay/${item.slug}`,
    title: item.name,
    description: item.description ?? dict.stay.subtitle,
    ogImage: item.hero ? { url: item.hero.url, alt: item.hero.alt } : null,
  });
}

export default async function StayDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  const item = await getAccommodationBySlug(slug, locale);
  if (!item) notFound();

  const firstBookableId = item.bookableIds[0];

  return (
    <>
      <PageHero kicker={dict.nav.stay} title={item.name}>
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status={item.verificationStatus} dict={dict} />
          {item.rating !== null ? (
            <RatingBadge
              rating={item.rating}
              reviewCount={item.reviewCount}
              locale={locale}
              dict={dict}
            />
          ) : null}
          {item.capacity !== null ? (
            <Badge tone="neutral">
              {t(dict, "stay.capacity", { n: item.capacity })}
            </Badge>
          ) : null}
        </div>
      </PageHero>

      <Section>
        <Container>
          <BackLink
            href={`/${locale}/stay`}
            label={dict.common.back}
            className="mb-6"
          />

          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-card border border-rocky-200 bg-rocky-100">
                <SmartImage
                  image={item.hero}
                  alt={item.name}
                  ratio="aspect-[16/9]"
                  priority
                  sizes="(max-width: 1024px) 100vw, 58vw"
                />
              </div>

              <div className="mt-8 max-w-3xl">
                <SectionHeader title={dict.plan.staySection} />
                <PriceText
                  price={item.priceFrom}
                  locale={locale}
                  dict={dict}
                  className="text-base"
                />
                <div className="mt-4">
                  {item.description ? (
                    <CmsBody body={item.description} />
                  ) : (
                    <EmptyState compact title={dict.stay.noDescription} />
                  )}
                </div>
              </div>
            </div>

            <aside className="lg:col-span-5">
              <Card>
                <CardHeader title={dict.map.title} />
                <CardBody className="space-y-3">
                  {item.address ? (
                    <p className="text-sm leading-relaxed text-rocky-600">
                      {item.address}
                    </p>
                  ) : (
                    <p className="text-sm text-rocky-500">
                      {dict.stay.detailsPending}
                    </p>
                  )}
                  <PlaceMapLink lat={item.lat} lng={item.lng} dict={dict} />
                  {item.lat !== null && item.lng !== null ? (
                    <p className="text-xs text-rocky-500">{dict.common.newTab}</p>
                  ) : null}
                </CardBody>
              </Card>
            </aside>
          </div>
        </Container>
      </Section>

      <Section className="border-t border-rocky-200 bg-white">
        <Container>
          <SectionHeader title={dict.stay.rooms} />

          {item.units.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {item.units.map((unit) => (
                <li key={unit.id}>
                  <Card className="h-full">
                    <CardBody className="flex h-full flex-col gap-3">
                      <div className="flex flex-wrap items-center gap-2">
                        {unit.capacity !== null ? (
                          <Badge tone="neutral">
                            {t(dict, "stay.capacity", { n: unit.capacity })}
                          </Badge>
                        ) : null}
                      </div>
                      <div>
                        <h3 className="text-base font-semibold text-rocky-900">
                          {unit.name}
                        </h3>
                        {unit.description ? (
                          <p className="mt-1 text-sm leading-relaxed text-rocky-600">
                            {unit.description}
                          </p>
                        ) : null}
                      </div>
                      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-rocky-100 pt-3">
                        <PriceText
                          price={unit.priceFrom}
                          locale={locale}
                          dict={dict}
                        />
                        {unit.bookableId ? (
                          <ButtonLink
                            href={`/${locale}/book/${unit.bookableId}`}
                            size="sm"
                          >
                            {dict.nav.bookNow}
                          </ButtonLink>
                        ) : null}
                      </div>
                    </CardBody>
                  </Card>
                </li>
              ))}
            </ul>
          ) : firstBookableId ? (
            <Card>
              <CardBody className="flex flex-wrap items-center justify-between gap-4">
                <div>
                  <h3 className="text-base font-semibold text-rocky-900">
                    {dict.stay.checkAvailability}
                  </h3>
                  <p className="mt-1 text-sm text-rocky-600">
                    {dict.stay.detailsPending}
                  </p>
                </div>
                <ButtonLink href={`/${locale}/book/${firstBookableId}`}>
                  {dict.nav.bookNow}
                </ButtonLink>
              </CardBody>
            </Card>
          ) : (
            <EmptyState
              compact
              title={dict.common.empty}
              description={dict.stay.detailsPending}
            />
          )}
        </Container>
      </Section>
    </>
  );
}
