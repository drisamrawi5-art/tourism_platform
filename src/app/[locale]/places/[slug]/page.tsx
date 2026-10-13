import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDictionary, t } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getPlaceBySlug, getPlaces } from "@/lib/data/places";
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
  VerificationBadge,
} from "@/components/discovery/bits";
import { PlaceMapLink } from "@/components/discovery/map-link";

/**
 * Place detail — description from the CMS body, map link only when the
 * verified coordinates exist (otherwise the pending copy), plus a strip of
 * the other published places.
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
  const place = await getPlaceBySlug(slug, locale);
  if (!place) notFound();

  return buildMetadata({
    locale,
    path: `/places/${place.slug}`,
    title: place.name,
    description: place.summary ?? dict.places.subtitle,
    ogImage: place.hero ? { url: place.hero.url, alt: place.hero.alt } : null,
  });
}

export default async function PlaceDetailPage({
  params,
}: {
  params: Promise<Params>;
}) {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);

  const place = await getPlaceBySlug(slug, locale);
  if (!place) notFound();

  const others = (await getPlaces(locale)).filter((item) => item.slug !== slug);

  return (
    <>
      <PageHero
        kicker={dict.nav.places}
        title={place.name}
        description={place.summary ?? undefined}
      >
        <div className="flex flex-wrap items-center gap-2">
          {place.typeLabel ? <Badge tone="info">{place.typeLabel}</Badge> : null}
          <VerificationBadge status={place.verificationStatus} dict={dict} />
        </div>
      </PageHero>

      <Section>
        <Container>
          <BackLink
            href={`/${locale}/places`}
            label={dict.places.backToPlaces}
            className="mb-6"
          />

          <div className="grid gap-8 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="overflow-hidden rounded-card border border-rocky-200 bg-rocky-100">
                <SmartImage
                  image={place.hero}
                  alt={place.name}
                  ratio="aspect-[16/9]"
                  priority
                  sizes="(max-width: 1024px) 100vw, 58vw"
                />
              </div>

              <div className="mt-8">
                <SectionHeader
                  title={t(dict, "places.discover", { name: place.name })}
                />
                {place.body ? (
                  <CmsBody body={place.body} />
                ) : (
                  <EmptyState compact title={dict.common.empty} />
                )}
              </div>
            </div>

            <aside className="lg:col-span-5">
              <Card>
                <CardHeader title={dict.map.title} />
                <CardBody className="space-y-3">
                  <PlaceMapLink lat={place.lat} lng={place.lng} dict={dict} />
                  {place.lat !== null && place.lng !== null ? (
                    <p className="text-xs text-rocky-500">
                      {dict.common.newTab}
                    </p>
                  ) : null}
                </CardBody>
              </Card>
            </aside>
          </div>
        </Container>
      </Section>

      <Section className="border-t border-rocky-200 bg-white">
        <Container>
          <SectionHeader
            title={dict.places.allPlaces}
            action={
              <ButtonLink href={`/${locale}/places`} variant="ghost">
                {dict.common.viewAll}
              </ButtonLink>
            }
          />
          {others.length > 0 ? (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {others.map((item) => (
                <li key={item.id}>
                  <Link
                    href={`/${locale}/places/${item.slug}`}
                    className="flex items-center justify-between gap-3 rounded-card border border-rocky-200 bg-white px-4 py-3 transition-colors hover:border-forest-600"
                  >
                    <span className="font-medium text-rocky-900">
                      {item.name}
                    </span>
                    {item.typeLabel ? (
                      <Badge tone="info">{item.typeLabel}</Badge>
                    ) : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState compact title={dict.common.empty} />
          )}
        </Container>
      </Section>
    </>
  );
}
