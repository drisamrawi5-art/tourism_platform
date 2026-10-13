import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getPlaces } from "@/lib/data/places";
import { EmptyState } from "@/components/ui/alert";
import { Container, PageHero, Section } from "@/components/ui/card";
import { FilterBar } from "@/components/discovery/filter-bar";
import { PlaceCard } from "@/components/discovery/place-card";
import { readString, type SearchParams } from "@/components/discovery/query";

/**
 * Places — every published place of the published destination.
 *
 * `getPlaces` has no pagination in the data layer, so the full list is
 * rendered (well under the 50-item ceiling) and the optional ?type filter
 * matches against type labels that come from the data itself.
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
    path: "/places",
    title: dict.places.title,
    description: dict.places.subtitle,
  });
}

export default async function PlacesPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<SearchParams>;
}) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const dict = getDictionary(locale);
  const sp = await searchParams;

  const all = await getPlaces(locale);
  const typeLabels = [
    ...new Set(
      all
        .map((place) => place.typeLabel)
        .filter((value): value is string => typeof value === "string" && value !== ""),
    ),
  ].sort();
  const selectedType = readString(sp.type);
  const items = selectedType
    ? all.filter((place) => place.typeLabel === selectedType)
    : all;

  return (
    <>
      <PageHero
        kicker={dict.nav.places}
        title={dict.places.title}
        description={dict.places.subtitle}
      />

      <Section>
        <Container>
          {typeLabels.length > 0 ? (
            <div className="mb-8">
              <FilterBar
                action={`/${locale}/places`}
                id="place-type"
                name="type"
                label={dict.places.typeLabel}
                value={selectedType}
                options={[
                  { value: "", label: dict.common.all },
                  ...typeLabels.map((label) => ({ value: label, label })),
                ]}
                submitLabel={dict.filters.apply}
                clearHref={`/${locale}/places`}
                clearLabel={dict.common.clearFilters}
              />
            </div>
          ) : null}

          {items.length > 0 ? (
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {items.map((place) => (
                <PlaceCard key={place.id} place={place} locale={locale} dict={dict} />
              ))}
            </div>
          ) : selectedType ? (
            <EmptyState
              title={dict.common.noResults}
              action={{ href: `/${locale}/places`, label: dict.common.clearFilters }}
            />
          ) : (
            <EmptyState title={dict.common.empty} />
          )}
        </Container>
      </Section>
    </>
  );
}
