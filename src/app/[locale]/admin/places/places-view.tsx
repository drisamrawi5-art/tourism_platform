"use client";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { qs } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { useAdminFetch } from "@/components/admin/use-admin";
import { TableSkeleton } from "@/components/admin/skeleton";
import { FilterSelect } from "@/components/admin/filters";
import { PUBLICATION_STATUSES } from "@/components/admin/enums";
import { statusLabel, verificationLabel } from "@/components/admin/labels";

type PlaceTranslation = {
  locale: string;
  name: string;
  typeLabel: string | null;
  summary: string | null;
};

type PlaceRow = {
  id: string;
  slug: string;
  typeLabel: string | null;
  status: string;
  verificationStatus: string;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  translations: PlaceTranslation[];
};

export function placeDisplayName(translations: PlaceTranslation[]): string {
  const en = translations.find((entry) => entry.locale === "en");
  return en?.name ?? translations[0]?.name ?? "";
}

export function PlacesView({
  locale,
  initialPage,
  initialStatus,
}: {
  locale: Locale;
  initialPage: number;
  initialStatus: string;
}) {
  const dict = getDictionary(locale);
  const router = useRouter();

  const path = `/api/v1/admin/places${qs({
    page: initialPage,
    perPage: 20,
    status: initialStatus,
  })}`;
  const { data, pagination, loading, error, reload } = useAdminFetch<PlaceRow[]>(path);

  function push(next: { status?: string; page?: number }) {
    router.push(
      `/${locale}/admin/places${qs({
        page: next.page ?? 1,
        status: next.status ?? initialStatus,
      })}`,
    );
  }

  const hrefFor = (p: number) =>
    `/${locale}/admin/places${qs({
      page: p,
      status: initialStatus,
    })}`;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t(dict, "admin.places")}
          action={
            <ButtonLink href={`/${locale}/admin/places/new`} size="sm">
              {t(dict, "admin.createPlace")}
            </ButtonLink>
          }
        />
        <CardBody className="space-y-4">
          <FilterSelect
            id="place-status"
            label={t(dict, "admin.status")}
            value={initialStatus}
            onChange={(value) => push({ status: value })}
            options={[
              { value: "", label: t(dict, "common.all") },
              ...PUBLICATION_STATUSES.map((value) => ({
                value,
                label: statusLabel(dict, value),
              })),
            ]}
          />

          {loading && !data ? (
            <TableSkeleton rows={6} cols={6} label={t(dict, "common.loading")} />
          ) : error && !data ? (
            <div className="space-y-4">
              <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
                {t(dict, "errors.serverErrorBody")}
              </Alert>
              <Button variant="secondary" onClick={() => reload()}>
                {t(dict, "common.retry")}
              </Button>
            </div>
          ) : !data || data.length === 0 ? (
            <EmptyState
              title={t(dict, "common.noResults")}
              action={{ href: `/${locale}/admin/places/new`, label: t(dict, "admin.createPlace") }}
            />
          ) : (
            <div className="space-y-4">
              <Table>
                <caption className="sr-only">{t(dict, "admin.places")}</caption>
                <THead>
                  <tr>
                    <TH>{t(dict, "auth.name")}</TH>
                    <TH>{t(dict, "admin.slug")}</TH>
                    <TH>{t(dict, "places.typeLabel")}</TH>
                    <TH>{t(dict, "admin.status")}</TH>
                    <TH>{t(dict, "admin.featured")}</TH>
                    <TH>{t(dict, "admin.verification")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.map((row) => {
                    const name = placeDisplayName(row.translations);
                    const typeLabel =
                      row.typeLabel ??
                      row.translations.find((entry) => entry.locale === "en")?.typeLabel ??
                      null;
                    return (
                      <TR key={row.id}>
                        <TD>
                          <Link
                            href={`/${locale}/admin/places/${row.id}`}
                            className="font-medium text-water-700 underline-offset-2 hover:underline"
                          >
                            {name || `/${row.slug}`}
                          </Link>
                        </TD>
                        <TD className="font-mono text-xs">{row.slug}</TD>
                        <TD>{typeLabel ?? "—"}</TD>
                        <TD>
                          <StatusBadge status={row.status} />
                          <span className="ms-2 text-rocky-600">
                            {statusLabel(dict, row.status)}
                          </span>
                        </TD>
                        <TD>
                          {row.featured ? (
                            <Badge tone="info">{t(dict, "admin.featured")}</Badge>
                          ) : (
                            <span className="text-rocky-400">—</span>
                          )}
                        </TD>
                        <TD>
                          <Badge tone="outline">
                            {verificationLabel(dict, row.verificationStatus)}
                          </Badge>
                        </TD>
                      </TR>
                    );
                  })}
                </tbody>
              </Table>

              {pagination ? (
                <Pagination
                  page={pagination.page}
                  labels={{
                    previous: t(dict, "common.previous"),
                    next: t(dict, "common.next"),
                    pagination: t(dict, "common.pagination"),
                  }}
                  totalPages={pagination.totalPages}
                  hrefFor={hrefFor}
                />
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
