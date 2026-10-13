"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { qs } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/lib/currency";
import { useRequireAuth } from "@/components/auth/helpers";
import { can } from "@/components/admin/permissions";
import { useApi } from "@/components/admin/api";
import { LoadError, PermissionDenied } from "@/components/admin/feedback";
import {
  BUSINESS_TYPES,
  PUBLICATION_STATUSES,
  type BusinessListRow,
  type BusinessType,
  type PublicationStatus,
} from "@/components/admin/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, LoadingBlock } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";

const PER_PAGE = 20;

export function BusinessesView({
  locale,
  initialPage,
  initialQ,
  initialType,
  initialStatus,
}: {
  locale: Locale;
  initialPage: number;
  initialQ: string;
  initialType: BusinessType | "";
  initialStatus: PublicationStatus | "";
}) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { user, ready } = useRequireAuth(locale);
  const allowed = can(user, "business.read");

  const [q, setQ] = useState(initialQ);

  const list = useApi<BusinessListRow[]>(
    allowed
      ? `/api/v1/admin/businesses${qs({
          page: initialPage,
          perPage: PER_PAGE,
          q: initialQ,
          type: initialType,
          status: initialStatus,
        })}`
      : null,
  );

  if (!ready) return null;
  if (!allowed) return <PermissionDenied locale={locale} />;
  if (list.error && !list.data) {
    return <LoadError locale={locale} error={list.error} onRetry={list.reload} />;
  }
  if (list.loading && !list.data) {
    return <LoadingBlock text={t(dict, "common.loading")} />;
  }

  const items = list.data ?? [];
  const hasFilters = Boolean(initialQ || initialType || initialStatus);

  function push(next: { page?: number; q?: string; type?: string; status?: string }) {
    router.push(
      `/${locale}/admin/businesses${qs({
        page: next.page ?? 1,
        q: next.q ?? "",
        type: next.type ?? "",
        status: next.status ?? "",
      })}`,
    );
  }

  const hrefFor = (page: number) =>
    `/${locale}/admin/businesses${qs({
      page,
      q: initialQ,
      type: initialType,
      status: initialStatus,
    })}`;

  return (
    <Card>
      <CardHeader
        title={t(dict, "admin.businesses")}
        action={
          <div className="flex flex-wrap items-end gap-3">
            <Field label={t(dict, "common.search")} htmlFor="business-q">
              <Input
                id="business-q"
                type="search"
                value={q}
                placeholder={t(dict, "search.placeholder")}
                onChange={(event) => setQ(event.target.value)}
                className="w-44"
              />
            </Field>
            <Field label={t(dict, "provider.businessType")} htmlFor="business-type">
              <Select
                id="business-type"
                value={initialType}
                onChange={(event) => push({ type: event.target.value })}
                className="w-44"
              >
                <option value="">{t(dict, "common.all")}</option>
                {BUSINESS_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {t(dict, `admin.businessTypes.${type}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label={t(dict, "admin.status")} htmlFor="business-status">
              <Select
                id="business-status"
                value={initialStatus}
                onChange={(event) => push({ status: event.target.value })}
                className="w-44"
              >
                <option value="">{t(dict, "common.all")}</option>
                {PUBLICATION_STATUSES.map((status) => (
                  <option key={status} value={status}>
                    {t(dict, `common.status.${status}`)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex gap-2">
              <Button size="sm" onClick={() => push({ q })}>
                {t(dict, "common.filters")}
              </Button>
              {hasFilters ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setQ("");
                    push({});
                  }}
                >
                  {t(dict, "common.clearFilters")}
                </Button>
              ) : null}
            </div>
          </div>
        }
      />
      <CardBody>
        {items.length === 0 ? (
          hasFilters ? (
            <EmptyState
              title={t(dict, "common.noResults")}
              action={{
                href: `/${locale}/admin/businesses`,
                label: t(dict, "common.clearFilters"),
              }}
            />
          ) : (
            <EmptyState title={t(dict, "common.empty")} />
          )
        ) : (
          <div className="space-y-4">
            <Table>
              <THead>
                <tr>
                  <TH>{t(dict, "provider.businessName")}</TH>
                  <TH>{t(dict, "provider.businessType")}</TH>
                  <TH>{t(dict, "admin.status")}</TH>
                  <TH>{t(dict, "admin.verification")}</TH>
                  <TH>{t(dict, "admin.owner")}</TH>
                  <TH align="end">{t(dict, "admin.servicesCount")}</TH>
                  <TH align="end">{t(dict, "admin.bookings")}</TH>
                  <TH>{t(dict, "admin.createdAt")}</TH>
                </tr>
              </THead>
              <tbody>
                {items.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <Link
                        href={`/${locale}/admin/businesses/${row.id}`}
                        className="font-medium text-water-700 underline-offset-2 hover:underline"
                      >
                        {row.name}
                      </Link>
                      <span className="block text-xs text-rocky-500">{row.slug}</span>
                    </TD>
                    <TD>{t(dict, `admin.businessTypes.${row.type}`)}</TD>
                    <TD>
                      <StatusBadge status={row.status} />
                      {row.featured ? (
                        <span className="ms-2 text-xs text-forest-700">
                          {t(dict, "admin.featured")}
                        </span>
                      ) : null}
                    </TD>
                    <TD>
                      {t(dict, `common.verification.${row.verificationStatus}`)}
                    </TD>
                    <TD>
                      <span className="block truncate">{row.owner.name ?? "—"}</span>
                      <span className="block truncate text-xs text-rocky-500">
                        {row.owner.email}
                      </span>
                    </TD>
                    <TD align="end" className="tabular-nums">
                      {row.bookableCount}
                    </TD>
                    <TD align="end" className="tabular-nums">
                      {row.bookingCount}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {formatDate(row.createdAt, locale)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>

            {list.pagination ? (
              <Pagination
                page={list.pagination.page}
                labels={{
                  previous: t(dict, "common.previous"),
                  next: t(dict, "common.next"),
                  pagination: t(dict, "common.pagination"),
                }}
                totalPages={list.pagination.totalPages}
                hrefFor={hrefFor}
              />
            ) : null}
          </div>
        )}
      </CardBody>
    </Card>
  );
}
