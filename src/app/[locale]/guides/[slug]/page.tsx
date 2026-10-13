import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getGuideBySlug } from "@/lib/data/businesses";
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
  PriceText,
  RatingBadge,
  VerificationBadge,
  languageLabel,
  pricingUnitLabel,
} from "@/components/discovery/bits";
import { PlaceMapLink } from "@/components/discovery/map-link";

/**
 * Guide detail — languages and areas come from the provider's own data,
 * services show real prices (with their pricing unit when declared) and a
 * booking CTA only when a service actually has a bookable.
 */

type Params = { locale: string; slug: string };

const SUBTITLE =
  "text-xs font-semibold uppercase tracking-[0.14em] text-forest-700";

export async function generateMetadata({
  params,
}: {
  params: Promise<Params>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const guide = await getGuideBySlug(slug, locale);
  if (!guide) notFound();

  return buildMetadata({
    locale,
    path: `/guides/${guide.slug}`,
    title: guide.name,
    description: guide.description ?? dict.guides.subtitle,
    ogImage: guide.hero ? { url: guide.hero.url, alt: guide.hero.alt } : null,
  });
}

export default async function GuideDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  const guide = await getGuideBySlug(slug, locale);
  if (!guide) notFound();

  const hasProfile = guide.languages.length > 0 || Boolean(guide.areasCovered);

  return (
    <>
      <PageHero
        kicker={dict.nav.guides}
        title={guide.name}
        description={guide.description ?? undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          <VerificationBadge status={guide.verificationStatus} dict={dict} />
          {guide.rating !== null ? (
            <RatingBadge
              rating={guide.rating}
              reviewCount={guide.reviewCount}
              locale={locale}
              dict={dict}
            />
          ) : null}
        </div>
      </PageHero>

      <Section>
        <Container>
          <BackLink
            href={`/${locale}/guides`}
            label={dict.common.back}
            className="mb-6"
          />

          <div className="grid gap-8 lg:grid-cols-12">
            <div className="space-y-6 lg:col-span-7">
              {guide.languages.length > 0 ? (
                <div>
                  <h2 className={SUBTITLE}>{dict.guides.languages}</h2>
                  <div className="mt-2 flex flex-wrap items-center gap-1.5">
                    {guide.languages.map((code) => (
                      <Badge key={code} tone="info">
                        {languageLabel(code, locale)}
                      </Badge>
                    ))}
                  </div>
                </div>
              ) : null}

              {guide.areasCovered ? (
                <div>
                  <h2 className={SUBTITLE}>{dict.guides.areas}</h2>
                  <p className="mt-2 text-base leading-relaxed text-rocky-600">
                    {guide.areasCovered}
                  </p>
                </div>
              ) : null}

              {!hasProfile ? (
                <EmptyState compact title={dict.common.empty} />
              ) : null}
            </div>

            <aside className="lg:col-span-5">
              <Card>
                <CardHeader title={dict.map.title} />
                <CardBody className="space-y-3">
                  <div className="overflow-hidden rounded-card border border-rocky-200 bg-rocky-100">
                    <SmartImage
                      image={guide.hero}
                      alt={guide.name}
                      ratio="aspect-[4/3]"
                      sizes="(max-width: 1024px) 100vw, 40vw"
                    />
                  </div>
                  <PlaceMapLink lat={guide.lat} lng={guide.lng} dict={dict} />
                  {guide.lat !== null && guide.lng !== null ? (
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
          <SectionHeader title={dict.guides.services} />

          {guide.services.length > 0 ? (
            <ul className="grid gap-4 sm:grid-cols-2">
              {guide.services.map((service) => {
                const unitLabel = pricingUnitLabel(service.pricingUnit, dict);
                return (
                  <li key={service.id}>
                    <Card className="h-full">
                      <CardBody className="flex h-full flex-col gap-3">
                        <div>
                          <h3 className="text-base font-semibold text-rocky-900">
                            {service.name}
                          </h3>
                          {service.description ? (
                            <p className="mt-1 text-sm leading-relaxed text-rocky-600">
                              {service.description}
                            </p>
                          ) : null}
                        </div>
                        <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-rocky-100 pt-3">
                          <span className="flex flex-wrap items-baseline gap-2">
                            <PriceText
                              price={service.priceFrom}
                              locale={locale}
                              dict={dict}
                            />
                            {unitLabel ? (
                              <span className="text-xs text-rocky-500">
                                {unitLabel}
                              </span>
                            ) : null}
                          </span>
                          {service.bookableId ? (
                            <ButtonLink
                              href={`/${locale}/book/${service.bookableId}`}
                              size="sm"
                            >
                              {dict.guides.bookGuide}
                            </ButtonLink>
                          ) : null}
                        </div>
                      </CardBody>
                    </Card>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState
              compact
              title={dict.common.empty}
              description={dict.common.notConfigured}
            />
          )}
        </Container>
      </Section>
    </>
  );
}
