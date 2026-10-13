"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch, qs, type PaginationMeta } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink, LoadingBlock } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/alert";
import { Field, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { Pagination } from "@/components/ui/pagination";
import { useRequireAuth } from "@/components/auth/helpers";
import { ErrorAlert } from "@/components/provider/ui";
import type { ProviderReview } from "@/components/provider/types";

type StatusFilter = "" | "PENDING" | "APPROVED" | "REJECTED";

const STATUS_OPTIONS: readonly StatusFilter[] = ["", "PENDING", "APPROVED", "REJECTED"];

/** Read-only review feed — GET /api/v1/provider/reviews (status + pagination). */
export function ProviderReviewsView({
  locale,
  initialPage,
  initialStatus,
}: {
  locale: Locale;
  initialPage: number;
  initialStatus: StatusFilter;
}) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { ready } = useRequireAuth(locale);

  const [items, setItems] = useState<ProviderReview[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const page = initialPage;
  const status = initialStatus;

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ProviderReview[]>(
        `/api/v1/provider/reviews${qs({ page, perPage: 10, status })}`,
      );
      setItems(res.data ?? []);
      setPagination(res.pagination ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const hrefFor = (target: number) =>
    `/${locale}/provider/reviews${qs({ page: target, status })}`;

  function onStatusChange(value: StatusFilter) {
    router.push(`/${locale}/provider/reviews${qs({ page: 1, status: value })}`);
  }

  if (!ready) return null;

  return (
    <Card>
      <CardHeader
        title={t(dict, "provider.reviews")}
        action={
          <div className="w-full sm:w-56">
            <Field label={t(dict, "common.filters")} htmlFor="provider-review-status">
              <Select
                id="provider-review-status"
                value={status}
                onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
                disabled={loading}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option || "all"} value={option}>
                    {option === ""
                      ? t(dict, "common.all")
                      : option === "PENDING"
                        ? t(dict, "booking.statuses.PENDING")
                        : t(dict, `common.status.${option}`)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
        }
      />
      <CardBody>
        {loading ? (
          <LoadingBlock text={t(dict, "common.loading")} />
        ) : error !== null ? (
          <ErrorAlert dict={dict} error={error} onRetry={() => void load()} />
        ) : items.length === 0 ? (
          status ? (
            <EmptyState
              title={t(dict, "common.noResults")}
              action={{
                href: `/${locale}/provider/reviews`,
                label: t(dict, "common.clearFilters"),
              }}
            />
          ) : (
            <EmptyState title={t(dict, "provider.reviewsEmpty")} />
          )
        ) : (
          <div className="space-y-4">
            <Table>
              <THead>
                <tr>
                  <TH>{t(dict, "booking.fullName")}</TH>
                  <TH>{t(dict, "reviews.rating")}</TH>
                  <TH>{t(dict, "reviews.comment")}</TH>
                  <TH>{t(dict, "provider.serviceName")}</TH>
                  <TH>{t(dict, "common.updated")}</TH>
                </tr>
              </THead>
              <tbody>
                {items.map((review) => (
                  <TR key={review.id}>
                    <TD>
                      <span className="font-medium text-rocky-900">
                        {review.customer?.name ?? "—"}
                      </span>
                      <div className="mt-1">
                        <StatusBadge status={review.status} />
                      </div>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {t(dict, "reviews.stars", { n: review.rating })}
                    </TD>
                    <TD className="max-w-64">
                      <span className="line-clamp-2 whitespace-pre-wrap">
                        {review.comment ?? "—"}
                      </span>
                    </TD>
                    <TD>
                      {review.bookable
                        ? review.bookable.unit?.name ??
                          review.bookable.guideService?.name ??
                          review.bookable.slug
                        : "—"}
                    </TD>
                    <TD className="whitespace-nowrap">
                      {formatDate(review.createdAt, locale)}
                    </TD>
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
  );
}
