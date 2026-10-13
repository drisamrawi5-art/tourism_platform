"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { qs } from "@/lib/api/client";
import { formatDate } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { useAdminFetch } from "@/components/admin/use-admin";
import { TableSkeleton } from "@/components/admin/skeleton";
import { FilterSelect } from "@/components/admin/filters";
import { CONTENT_KINDS, PUBLICATION_STATUSES } from "@/components/admin/enums";
import { contentKindLabel, statusLabel } from "@/components/admin/labels";

type ContentRow = {
  id: string;
  kind: string;
  slug: string;
  status: string;
  featured: boolean;
  publishedAt: string | null;
  updatedAt: string;
  translations: Array<{ locale: string; title: string }>;
  author: { id: string; name: string | null; email: string } | null;
};

function contentTitle(translations: Array<{ locale: string; title: string }>): string {
  const en = translations.find((entry) => entry.locale === "en");
  return en?.title ?? translations[0]?.title ?? "";
}

export function ContentView({
  locale,
  initialPage,
  initialKind,
  initialStatus,
}: {
  locale: Locale;
  initialPage: number;
  initialKind: string;
  initialStatus: string;
}) {
  const dict = getDictionary(locale);
  const router = useRouter();

  const path = `/api/v1/admin/content${qs({
    page: initialPage,
    perPage: 20,
    kind: initialKind,
    status: initialStatus,
  })}`;
  const { data, pagination, loading, error, reload } = useAdminFetch<ContentRow[]>(path);

  function push(next: { kind?: string; status?: string; page?: number }) {
    router.push(
      `/${locale}/admin/content${qs({
        page: next.page ?? 1,
        kind: next.kind ?? initialKind,
        status: next.status ?? initialStatus,
      })}`,
    );
  }

  const hrefFor = (p: number) =>
    `/${locale}/admin/content${qs({
      page: p,
      kind: initialKind,
      status: initialStatus,
    })}`;

  const allOption = { value: "", label: t(dict, "common.all") };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t(dict, "admin.content")}
          action={
            <ButtonLink href={`/${locale}/admin/content/new`} size="sm">
              {t(dict, "admin.createContent")}
            </ButtonLink>
          }
        />
        <CardBody>
          <div className="flex flex-wrap items-end gap-3">
            <FilterSelect
              id="content-kind"
              label={t(dict, "admin.kind")}
              value={initialKind}
              onChange={(value) => push({ kind: value })}
              options={[
                allOption,
                ...CONTENT_KINDS.map((value) => ({
                  value,
                  label: contentKindLabel(dict, value),
                })),
              ]}
            />
            <FilterSelect
              id="content-status"
              label={t(dict, "admin.status")}
              value={initialStatus}
              onChange={(value) => push({ status: value })}
              options={[
                allOption,
                ...PUBLICATION_STATUSES.map((value) => ({
                  value,
                  label: statusLabel(dict, value),
                })),
              ]}
            />
            <Button size="sm" variant="ghost" onClick={() => router.push(`/${locale}/admin/content`)}>
              {t(dict, "common.clearFilters")}
            </Button>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardBody>
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
              action={{
                href: `/${locale}/admin/content/new`,
                label: t(dict, "admin.createContent"),
              }}
            />
          ) : (
            <div className="space-y-4">
              <Table>
                <caption className="sr-only">{t(dict, "admin.content")}</caption>
                <THead>
                  <tr>
                    <TH>{t(dict, "journal.title")}</TH>
                    <TH>{t(dict, "admin.slug")}</TH>
                    <TH>{t(dict, "admin.kind")}</TH>
                    <TH>{t(dict, "admin.status")}</TH>
                    <TH>{t(dict, "common.updated")}</TH>
                    <TH>{t(dict, "admin.actor")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {data.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link
                          href={`/${locale}/admin/content/${row.id}`}
                          className="font-medium text-water-700 underline-offset-2 hover:underline"
                        >
                          {contentTitle(row.translations) || `/${row.slug}`}
                        </Link>
                      </TD>
                      <TD className="font-mono text-xs">{row.slug}</TD>
                      <TD>{contentKindLabel(dict, row.kind)}</TD>
                      <TD>
                        <StatusBadge status={row.status} />
                        <span className="ms-2 text-rocky-600">
                          {statusLabel(dict, row.status)}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap">{formatDate(row.updatedAt, locale)}</TD>
                      <TD>{row.author?.email ?? t(dict, "common.none")}</TD>
                    </TR>
                  ))}
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
