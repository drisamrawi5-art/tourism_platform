import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound } from "next/navigation";
import type { Prisma, PublicationStatus } from "@prisma/client";
import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n";
import { buildMetadata } from "@/lib/seo";
import { db } from "@/lib/db";
import { clampPage } from "@/lib/data/common";
import { EmptyState } from "@/components/ui/alert";
import { ImagePlaceholder, SmartImage } from "@/components/ui/image";
import { Pagination } from "@/components/ui/pagination";
import { Container, PageHero, Section } from "@/components/ui/card";

/**
 * Gallery — published media grid (no gallery data function exists yet, so the
 * page queries moderated media directly).
 *
 * Only APPROVED/PUBLISHED media is shown; file URLs resolve through the
 * /api/v1/media/file endpoint (storage keys never leak). Seed content ships
 * without media, so the empty state is the normal first-run view.
 */

const GALLERY_STATUSES: PublicationStatus[] = ["PUBLISHED", "APPROVED"];
const PER_PAGE = 60;

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const l = isLocale(locale) ? locale : "en";
  const dict = getDictionary(l);
  return buildMetadata({
    locale: l,
    path: "/gallery",
    title: dict.gallery.title,
    description: dict.gallery.subtitle,
  });
}

export default async function GalleryPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ page?: string | string[] }>;
}): Promise<ReactNode> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const l = locale;
  const dict = getDictionary(l);

  const { page: pageParam } = await searchParams;
  const rawPage =
    typeof pageParam === "string" && pageParam.trim() !== "" ? Number(pageParam) : Number.NaN;
  const { skip, take, page, perPage } = clampPage(rawPage, PER_PAGE);

  const where: Prisma.MediaWhereInput = { status: { in: GALLERY_STATUSES } };
  const [rows, total] = await Promise.all([
    db.media.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip,
      take,
    }),
    db.media.count({ where }),
  ]);

  const totalPages = Math.ceil(total / perPage);

  return (
    <>
      <PageHero kicker={dict.brand.tagline} title={dict.gallery.title} description={dict.gallery.subtitle} />

      <Section>
        <Container>
          {rows.length === 0 ? (
            <EmptyState title={dict.common.empty} description={dict.gallery.empty} />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {rows.map((media) => {
                const caption = media.caption ?? media.alt;
                return (
                  <figure
                    key={media.id}
                    className="overflow-hidden rounded-card border border-rocky-200 bg-white shadow-[0_1px_2px_rgba(16,26,36,0.05)]"
                  >
                    {media.kind === "IMAGE" ? (
                      <SmartImage
                        image={{
                          url: `/api/v1/media/file/${media.storageKey}`,
                          alt: media.alt,
                          width: media.width,
                          height: media.height,
                        }}
                        alt={media.alt}
                        ratio="aspect-[4/3]"
                      />
                    ) : (
                      <ImagePlaceholder className="aspect-[4/3]" label={media.alt} />
                    )}
                    {caption ? (
                      <figcaption className="px-4 py-3 text-sm leading-relaxed text-rocky-600">
                        {caption}
                      </figcaption>
                    ) : null}
                  </figure>
                );
              })}
            </div>
          )}

          <Pagination
            page={page}
            labels={{
              previous: dict.common.previous,
              next: dict.common.next,
              pagination: dict.common.pagination,
            }}
            totalPages={totalPages}
            hrefFor={(p) => `/${l}/gallery?page=${p}`}
            className="mt-8"
          />
        </Container>
      </Section>
    </>
  );
}
