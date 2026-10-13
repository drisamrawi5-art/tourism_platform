import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getDictionary, t } from "@/i18n";
import { isLocale } from "@/i18n/config";
import { buildMetadata } from "@/lib/seo";
import { getAccommodations } from "@/lib/data/businesses";
import { EmptyState } from "@/components/ui/alert";
import { Container, PageHero, Section } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { AccommodationCard } from "@/components/discovery/accommodation-card";
import { FilterBar } from "@/components/discovery/filter-bar";
import {
  queryHref,
  readInt,
  type SearchParams,
} from "@/components/discovery/query";

/**
 * Stay — published accommodations with a server-side capacity filter and
 * real pagination from the data layer. Prices/ratings are whatever the data
 * layer reports; missing values render as pending states, never numbers.
 */

const PER_PAGE = 12;
const CAPACITY_MAX = 12;

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
    path: "/stay",
    title: dict.stay.title,
    description: dict.stay.subtitle,
  });
}

export default async function StayPage({
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

  const capacity = readInt(sp.capacity, 1, CAPACITY_MAX);
  const page = readInt(sp.page, 1) ?? 1;

  const result = await getAccommodations(locale, {
    page,
    perPage: PER_PAGE,
    ...(capacity ? { capacity } : {}),
  });

  const totalPages = Math.ceil(result.total / result.perPage);
  const overPaged = result.total > 0 && result.page > totalPages;
  const hasFilter = capacity !== null;

  const capacityOptions = [
    { value: "", label: dict.common.all },
    ...Array.from({ length: CAPACITY_MAX }, (_, index) => {
      const n = index + 1;
      return {
        value: String(n),
        label: n === 1 ? dict.booking.guestsOne : t(dict, "booking.guestsMany", { n }),
      };
    }),
  ];

  return (
    <>
      <PageHero
        kicker={dict.nav.stay}
        title={dict.stay.title}
        description={dict.stay.subtitle}
      />

      <Section>
        <Container>
          <div className="mb-8">
            <FilterBar
              action={`/${locale}/stay`}
              id="stay-capacity"
              name="capacity"
              label={dict.filters.capacity}
              value={capacity !== null ? String(capacity) : null}
              options={capacityOptions}
              submitLabel={dict.filters.apply}
              clearHref={queryHref(locale, "/stay", sp, {
                capacity: undefined,
                page: undefined,
              })}
              clearLabel={dict.common.clearFilters}
            />
          </div>

          {result.items.length > 0 ? (
            <>
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {result.items.map((item) => (
                  <AccommodationCard
                    key={item.id}
                    item={item}
                    locale={locale}
                    dict={dict}
                  />
                ))}
              </div>
              <Pagination
                page={result.page}
                labels={{
                  previous: dict.common.previous,
                  next: dict.common.next,
                  pagination: dict.common.pagination,
                }}
                totalPages={totalPages}
                className="mt-8"
                hrefFor={(target) =>
                  queryHref(locale, "/stay", sp, {
                    page: target === 1 ? undefined : target,
                  })
                }
              />
            </>
          ) : hasFilter || overPaged ? (
            <EmptyState
              title={dict.common.noResults}
              action={{
                href: queryHref(locale, "/stay", sp, {
                  capacity: undefined,
                  page: undefined,
                }),
                label: dict.common.clearFilters,
              }}
            />
          ) : (
            <EmptyState
              title={dict.stay.noAccommodations}
              description={dict.stay.noAccommodationsBody}
              action={{ href: `/${locale}/places`, label: dict.nav.places }}
            />
          )}
        </Container>
      </Section>
    </>
  );
}
