import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { formatDate } from "@/lib/currency";
import { getContentBySlug, getJournal } from "@/lib/data/content";
import { Badge, statusTone } from "@/components/ui/badge";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/alert";
import { SmartImage } from "@/components/ui/image";
import { Container, PageHero, Section, SectionHeader } from "@/components/ui/card";
import { JournalCard, kindLabel } from "@/components/editorial/journal-card";

/**
 * Journal article — header (kicker/kind, title, date), body rendered into
 * simple paragraphs (plus `#`-style headings, which .cms-body already styles).
 * No markdown parser: anything else stays plain text.
 */

type BodyBlock =
  | { kind: "heading"; level: 2 | 3; text: string }
  | { kind: "paragraph"; text: string };

function toBlocks(body: string): BodyBlock[] {
  const blocks: BodyBlock[] = [];
  for (const chunk of body.split(/\n{2,}/)) {
    const block = chunk.trim();
    if (!block) continue;

    const heading = /^(#{1,6})\s+(.+)$/.exec(block);
    if (heading?.[1] && heading[2]) {
      blocks.push({
        kind: "heading",
        level: heading[1].length <= 2 ? 2 : 3,
        text: heading[2].trim(),
      });
      continue;
    }
    blocks.push({
      kind: "paragraph",
      text: block.replace(/\s*\n\s*/g, " ").trim(),
    });
  }
  return blocks;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const l = isLocale(locale) ? locale : "en";
  const item = await getContentBySlug(slug, l);
  if (!item) notFound();

  const dict = getDictionary(l);
  return buildMetadata({
    locale: l,
    path: `/journal/${item.slug}`,
    title: item.seoTitle ?? item.title,
    description: item.seoDescription ?? item.summary ?? dict.journal.subtitle,
    type: "article",
    noIndex: item.noIndex,
    ogImage: item.hero ? { url: item.hero.url, alt: item.hero.alt } : null,
  });
}

export default async function JournalArticlePage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<ReactNode> {
  const { locale, slug } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale;
  const dict = getDictionary(l);

  const item = await getContentBySlug(slug, l);
  if (!item) notFound();

  const kicker = kindLabel(item.kind, dict);
  const verificationLabel = (
    dict.common.verification as Record<string, string | undefined>
  )[item.verificationStatus];
  const blocks = item.body ? toBlocks(item.body) : [];

  const related = await getJournal(l, { perPage: 12 });
  const others = related.items.filter((entry) => entry.slug !== item.slug).slice(0, 2);

  return (
    <>
      <PageHero
        kicker={kicker ?? undefined}
        title={item.title}
        description={item.summary ?? undefined}
      >
        <div className="flex flex-wrap items-center gap-3 text-sm text-rocky-500">
          {item.publishedAt ? (
            <time dateTime={item.publishedAt.toISOString()}>
              {formatDate(item.publishedAt, l)}
            </time>
          ) : null}
          {verificationLabel ? (
            <Badge tone={statusTone(item.verificationStatus)}>{verificationLabel}</Badge>
          ) : null}
          <ButtonLink href={`/${l}/journal`} variant="ghost" size="sm">
            {dict.journal.backToJournal}
          </ButtonLink>
        </div>
      </PageHero>

      <Section>
        <Container>
          <article className="mx-auto max-w-3xl">
            {item.hero ? (
              <SmartImage
                image={item.hero}
                alt={item.title}
                ratio="aspect-[16/9]"
                priority
                sizes="(max-width: 768px) 100vw, 768px"
                className="mb-8 overflow-hidden rounded-card"
              />
            ) : null}

            {blocks.length > 0 ? (
              <div className="cms-body">
                {blocks.map((block, index) =>
                  block.kind === "heading" ? (
                    block.level === 2 ? (
                      <h2 key={index}>{block.text}</h2>
                    ) : (
                      <h3 key={index}>{block.text}</h3>
                    )
                  ) : (
                    <p key={index}>{block.text}</p>
                  ),
                )}
              </div>
            ) : (
              <EmptyState compact title={dict.common.empty} />
            )}
          </article>
        </Container>
      </Section>

      {others.length > 0 ? (
        <Section className="pt-0">
          <Container>
            <SectionHeader
              title={dict.journal.title}
              action={
                <ButtonLink href={`/${l}/journal`} variant="secondary" size="sm">
                  {dict.common.viewAll}
                </ButtonLink>
              }
            />
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              {others.map((entry) => (
                <JournalCard
                  key={entry.id}
                  item={entry}
                  locale={l}
                  href={`/${l}/journal/${entry.slug}`}
                />
              ))}
            </div>
          </Container>
        </Section>
      ) : null}
    </>
  );
}
