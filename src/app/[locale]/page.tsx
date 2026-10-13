import { isLocale, slogans, type Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { getHomeView } from "@/lib/home-content";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/alert";
import { Container, Section, SectionHeader } from "@/components/ui/card";
import { PlaceCard } from "@/components/discovery/place-card";
import { AccommodationCard } from "@/components/discovery/accommodation-card";
import { GuideCard } from "@/components/discovery/guide-card";
import { JournalCard } from "@/components/editorial/journal-card";
import { getPlaces } from "@/lib/data/places";
import { getAccommodations, getGuides } from "@/lib/data/businesses";
import { getJournal } from "@/lib/data/content";

/**
 * Homepage — editorial composition built strictly from published data and
 * official copy. Sections whose data does not exist yet (stay, guides,
 * journal) are omitted entirely: the page never fabricates listings.
 * Metadata is inherited from the root layout (title template + slogan).
 */
export default async function HomePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const l: Locale = isLocale(locale) ? locale : "en";
  const baseDict = getDictionary(l);
  // Database-backed editorial overrides layered over the built-in copy
  // (empty fields keep the dictionary text — never invented translations).
  const view = await getHomeView(l);
  const dict = { ...baseDict, home: view.home };

  const [places, stays, guides, journal] = await Promise.all([
    getPlaces(l, { take: 6 }),
    getAccommodations(l, { perPage: 3 }),
    getGuides(l, { perPage: 3 }),
    getJournal(l, { perPage: 3 }),
  ]);

  return (
    <>
      {/* Hero — official slogan/editorial copy; optional CMS image behind a
          contrast scrim (only approved/published media is ever served). */}
      <section
        className={`relative overflow-hidden border-b border-rocky-200 ${
          view.heroImage
            ? "bg-rocky-950"
            : "bg-gradient-to-b from-forest-50 via-water-50 to-paper"
        }`}
      >
        {view.heroImage ? (
          <>
            {/* eslint-disable-next-line @next/next/no-img-element -- same-origin media file endpoint */}
            <img
              src={`/api/v1/media/file/${view.heroImage.storageKey}`}
              alt={view.heroImage.alt}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 bg-gradient-to-r from-rocky-950/90 via-rocky-950/75 to-rocky-950/60"
            />
          </>
        ) : null}
        <Container className="relative py-16 sm:py-24">
          <p
            className={`text-xs font-semibold uppercase tracking-[0.18em] ${
              view.heroImage ? "text-white/80" : "text-forest-700"
            }`}
          >
            {dict.home.heroEyebrow}
          </p>
          <h1
            className={`mt-4 max-w-3xl font-display text-4xl font-semibold leading-tight sm:text-5xl ${
              view.heroImage ? "text-white" : "text-rocky-900"
            }`}
          >
            {view.heroHeading || slogans[l]}
          </h1>
          <p
            className={`mt-5 max-w-2xl text-base leading-relaxed sm:text-lg ${
              view.heroImage ? "text-white/85" : "text-rocky-600"
            }`}
          >
            {dict.home.heroSubtitle}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <ButtonLink href={`/${l}/places`} size="lg">
              {view.heroCtas.places}
            </ButtonLink>
            <ButtonLink href={`/${l}/stay`} variant="accent" size="lg">
              {view.heroCtas.book}
            </ButtonLink>
            <ButtonLink href={`/${l}/plan`} variant="secondary" size="lg">
              {view.heroCtas.plan}
            </ButtonLink>
          </div>
        </Container>
      </section>

      {/* Intro */}
      {!view.hidden.has("intro") && (
        <Section>
          <Container>
            <SectionHeader
              align="center"
              kicker={dict.home.intro.eyebrow}
              title={dict.home.intro.title}
              description={dict.home.intro.body}
            />
          </Container>
        </Section>
      )}

      {/* Discover — published places straight from the data layer */}
      {!view.hidden.has("discover") && (
        <Section className="border-y border-rocky-200 bg-water-50/50">
        <Container>
          <SectionHeader
            kicker={dict.home.discoverSubtitle}
            title={dict.home.discoverTitle}
            action={
              <div className="flex flex-wrap gap-3">
                <ButtonLink href={`/${l}/discover`} variant="secondary">
                  {dict.home.explore}
                </ButtonLink>
                <ButtonLink href={`/${l}/places`} variant="ghost">
                  {dict.common.viewAll}
                </ButtonLink>
              </div>
            }
          />
          {places.length === 0 ? (
            <EmptyState
              title={dict.common.empty}
              description={dict.home.discoverSubtitle}
              action={{ href: `/${l}/discover`, label: dict.home.explore }}
            />
          ) : (
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {places.map((place) => (
                <PlaceCard key={place.slug} place={place} locale={l} dict={dict} />
              ))}
            </div>
          )}
        </Container>
        </Section>
      )}

      {/* Stay — rendered only once real published listings exist */}
      {!view.hidden.has("stay") && stays.items.length > 0 && (
        <Section>
          <Container>
            <SectionHeader
              kicker={dict.home.placesSubtitle}
              title={dict.home.stayTitle}
              description={dict.home.staySubtitle}
              action={
                <ButtonLink href={`/${l}/stay`} variant="secondary">
                  {dict.common.viewAll}
                </ButtonLink>
              }
            />
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {stays.items.map((item) => (
                <AccommodationCard key={item.slug} item={item} locale={l} dict={dict} />
              ))}
            </div>
          </Container>
        </Section>
      )}

      {/* Guides — rendered only once real published guides exist */}
      {!view.hidden.has("guides") && guides.items.length > 0 && (
        <Section>
          <Container>
            <SectionHeader
              title={dict.home.guidesTitle}
              description={dict.home.guidesSubtitle}
              action={
                <ButtonLink href={`/${l}/guides`} variant="secondary">
                  {dict.common.viewAll}
                </ButtonLink>
              }
            />
            <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {guides.items.map((item) => (
                <GuideCard key={item.slug} item={item} locale={l} dict={dict} />
              ))}
            </div>
          </Container>
        </Section>
      )}

      {/* Story + journal */}
      {!view.hidden.has("story") && (
        <Section>
          <Container>
            <SectionHeader
              kicker={dict.home.story.eyebrow}
              title={dict.home.story.title}
              description={dict.home.story.body}
              action={
                <ButtonLink href={`/${l}/journal`} variant="secondary">
                  {dict.home.story.cta}
                </ButtonLink>
              }
            />
            {journal.items.length > 0 && (
              <div className="mt-8 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {journal.items.map((item) => (
                  <JournalCard
                    key={item.slug}
                    item={item}
                    locale={l}
                    href={`/${l}/journal/${item.slug}`}
                    priority={item.featured}
                  />
                ))}
              </div>
            )}
          </Container>
        </Section>
      )}

      {/* Plan visit */}
      {!view.hidden.has("plan") && (
        <Section>
          <Container>
            <div className="rounded-2xl border border-rocky-200 bg-water-50 px-6 py-12 text-center sm:px-10">
              <SectionHeader
                align="center"
                title={dict.home.planTitle}
                description={dict.home.planSubtitle}
              />
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <ButtonLink href={`/${l}/plan`} size="lg">
                  {dict.home.planVisit}
                </ButtonLink>
                <ButtonLink href={`/${l}/gallery`} variant="secondary" size="lg">
                  {view.planGalleryLabel}
                </ButtonLink>
              </div>
            </div>
          </Container>
        </Section>
      )}
    </>
  );
}
