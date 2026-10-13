import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { formatDate } from "@/lib/currency";
import { getPlaces } from "@/lib/data/places";
import { getAccommodations, getGuides } from "@/lib/data/businesses";
import { getJournal } from "@/lib/data/content";
import { EmptyState } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import {
  Card,
  CardBody,
  Container,
  PageHero,
  Section,
  SectionHeader,
} from "@/components/ui/card";
import { VerificationBadge } from "@/components/discovery/bits";
import { AccommodationCard } from "@/components/discovery/accommodation-card";
import { GuideCard } from "@/components/discovery/guide-card";
import { PlaceCard } from "@/components/discovery/place-card";

/**
 * Discover — the editorial overview of the destination.
 *
 * Composition is deliberately asymmetric (lead place, split intro/journal
 * band, preview rows) instead of one uniform grid. Every section shows an
 * honest empty state when the data layer has nothing published yet.
 */

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  return buildMetadata({
    locale,
    path: "/discover",
    title: dict.home.discoverTitle,
    description: dict.home.heroSubtitle,
  });
}

export default async function DiscoverPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  const [featured, allPlaces, stays, guides, journal] = await Promise.all([
    getPlaces(locale, { featured: true }),
    getPlaces(locale),
    getAccommodations(locale, { page: 1, perPage: 3 }),
    getGuides(locale, { page: 1, perPage: 3 }),
    getJournal(locale, { page: 1, perPage: 3 }),
  ]);
  const places = featured.length > 0 ? featured : allPlaces;

  return (
    <>
      <PageHero
        kicker={dict.brand.tagline}
        title={dict.home.discoverTitle}
        description={dict.home.heroSubtitle}
      >
        <div className="flex flex-wrap gap-3">
          <ButtonLink href={`/${locale}/places`}>{dict.nav.places}</ButtonLink>
          <ButtonLink href={`/${locale}/stay`} variant="accent">
            {dict.nav.stay}
          </ButtonLink>
          <ButtonLink href={`/${locale}/guides`} variant="secondary">
            {dict.nav.guides}
          </ButtonLink>
        </div>
      </PageHero>

      {/* Lead place + supporting tiles */}
      <Section>
        <Container>
          <SectionHeader
            title={dict.home.placesTitle}
            description={dict.home.placesSubtitle}
            action={
              <ButtonLink href={`/${locale}/places`} variant="ghost">
                {dict.common.viewAll}
              </ButtonLink>
            }
          />
          {places.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {places.map((place, index) => (
                <PlaceCard
                  key={place.id}
                  place={place}
                  locale={locale}
                  dict={dict}
                  imageRatio={index === 0 ? "aspect-[16/9]" : "aspect-[4/3]"}
                  className={index === 0 ? "sm:col-span-2" : undefined}
                />
              ))}
            </div>
          ) : (
            <EmptyState title={dict.common.empty} />
          )}
        </Container>
      </Section>

      {/* Editorial split: the destination intro beside the journal teaser */}
      <Section className="border-y border-rocky-200 bg-white">
        <Container>
          <div className="grid gap-10 lg:grid-cols-12">
            <div className="lg:col-span-5">
              <p className="text-xs font-semibold uppercase tracking-[0.14em] text-forest-700">
                {dict.home.intro.eyebrow}
              </p>
              <h2 className="mt-2 font-display text-2xl font-semibold text-rocky-900 sm:text-3xl">
                {dict.home.intro.title}
              </h2>
              <p className="mt-3 text-base leading-relaxed text-rocky-600">
                {dict.home.intro.body}
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <ButtonLink href={`/${locale}/plan`} variant="secondary">
                  {dict.plan.title}
                </ButtonLink>
                <ButtonLink href={`/${locale}/journal`} variant="link">
                  {dict.nav.journal}
                </ButtonLink>
              </div>
            </div>
            <div className="lg:col-span-7">
              <SectionHeader
                title={dict.home.journalTitle}
                description={dict.journal.subtitle}
                action={
                  <ButtonLink href={`/${locale}/journal`} variant="ghost">
                    {dict.common.viewAll}
                  </ButtonLink>
                }
              />
              {journal.items.length > 0 ? (
                <ul className="grid gap-4 sm:grid-cols-2">
                  {journal.items.map((item) => (
                    <li key={item.id}>
                      <Card className="h-full">
                        <CardBody className="flex h-full flex-col gap-2 p-5">
                          <VerificationBadge
                            status={item.verificationStatus}
                            dict={dict}
                            className="self-start"
                          />
                          <h3 className="font-display text-base font-semibold text-rocky-900">
                            {item.title}
                          </h3>
                          {item.summary ? (
                            <p className="line-clamp-3 text-sm leading-relaxed text-rocky-600">
                              {item.summary}
                            </p>
                          ) : null}
                          {item.publishedAt ? (
                            <p className="mt-auto pt-2 text-xs text-rocky-500">
                              {`${dict.common.published} · ${formatDate(item.publishedAt, locale)}`}
                            </p>
                          ) : null}
                        </CardBody>
                      </Card>
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState compact title={dict.journal.empty} />
              )}
            </div>
          </div>
        </Container>
      </Section>

      {/* Stay preview */}
      <Section>
        <Container>
          <SectionHeader
            title={dict.home.stayTitle}
            description={dict.home.staySubtitle}
            action={
              <ButtonLink href={`/${locale}/stay`} variant="ghost">
                {dict.common.viewAll}
              </ButtonLink>
            }
          />
          {stays.items.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {stays.items.map((item) => (
                <AccommodationCard
                  key={item.id}
                  item={item}
                  locale={locale}
                  dict={dict}
                />
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              title={dict.stay.noAccommodations}
              description={dict.stay.noAccommodationsBody}
              action={{ href: `/${locale}/places`, label: dict.nav.places }}
            />
          )}
        </Container>
      </Section>

      {/* Guides preview (compact editorial rows) */}
      <Section className="border-t border-rocky-200 bg-white">
        <Container>
          <SectionHeader
            title={dict.home.guidesTitle}
            description={dict.home.guidesSubtitle}
            action={
              <ButtonLink href={`/${locale}/guides`} variant="ghost">
                {dict.common.viewAll}
              </ButtonLink>
            }
          />
          {guides.items.length > 0 ? (
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {guides.items.map((item) => (
                <GuideCard
                  key={item.id}
                  item={item}
                  locale={locale}
                  dict={dict}
                  compact
                />
              ))}
            </div>
          ) : (
            <EmptyState
              compact
              title={dict.guides.noGuides}
              description={dict.guides.noGuidesBody}
              action={{ href: `/${locale}/plan`, label: dict.plan.title }}
            />
          )}
        </Container>
      </Section>

      {/* Closing CTA */}
      <Section className="border-t border-rocky-200 bg-forest-50">
        <Container className="text-center">
          <h2 className="mx-auto max-w-2xl font-display text-2xl font-semibold text-rocky-900 sm:text-3xl">
            {dict.home.finalCtaTitle}
          </h2>
          <p className="mx-auto mt-3 max-w-2xl text-base leading-relaxed text-rocky-600">
            {dict.home.finalCtaBody}
          </p>
          <div className="mt-6 flex flex-wrap justify-center gap-3">
            <ButtonLink href={`/${locale}/plan`}>{dict.plan.title}</ButtonLink>
            <ButtonLink href={`/${locale}/places`} variant="secondary">
              {dict.nav.places}
            </ButtonLink>
          </div>
        </Container>
      </Section>
    </>
  );
}
