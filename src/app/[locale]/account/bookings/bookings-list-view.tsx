"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, qs, type PaginationMeta } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate, formatMoney, defaultCurrency, isCurrencyCode } from "@/lib/currency";
import type { PublicBooking } from "@/lib/booking/serialize";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink, LoadingBlock } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Field, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { Pagination } from "@/components/ui/pagination";
import { useRequireAuth } from "@/components/auth/helpers";

type StatusFilter = "" | "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "REFUNDED";

const STATUS_OPTIONS: readonly StatusFilter[] = [
  "",
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

export function BookingsListView({
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

  const [items, setItems] = useState<PublicBooking[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const page = initialPage;
  const status = initialStatus;

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      const res = await apiFetch<PublicBooking[]>(
        `/api/v1/bookings/mine${qs({ page, perPage: 10, status })}`,
      );
      setItems(res.data ?? []);
      setPagination(res.pagination ?? null);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

  useEffect(() => {
    void load();
  }, [load]);

  const hrefFor = (target: number) =>
    `/${locale}/account/bookings${qs({ page: target, status })}`;

  function onStatusChange(value: StatusFilter) {
    router.push(`/${locale}/account/bookings${qs({ page: 1, status: value })}`);
  }

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t(dict, "booking.myBookings")}
          action={
            <div className="w-full sm:w-56">
              <Field label={t(dict, "common.filters")} htmlFor="booking-status">
                <Select
                  id="booking-status"
                  value={status}
                  onChange={(e) => onStatusChange(e.target.value as StatusFilter)}
                  disabled={loading}
                >
                  {STATUS_OPTIONS.map((option) => (
                    <option key={option || "all"} value={option}>
                      {option === ""
                        ? t(dict, "common.all")
                        : t(dict, `booking.statuses.${option}`)}
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
          ) : error ? (
            <div className="space-y-4">
              <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
                {t(dict, "errors.serverErrorBody")}
              </Alert>
              <Button variant="secondary" onClick={() => void load()}>
                {t(dict, "common.retry")}
              </Button>
            </div>
          ) : items.length === 0 ? (
            <EmptyState
              title={t(dict, "booking.noBookings")}
              description={t(dict, "booking.noBookingsBody")}
              action={{ href: `/${locale}/stay`, label: t(dict, "nav.bookNow") }}
            />
          ) : (
            <div className="space-y-4">
              <Table>
                <THead>
                  <tr>
                    <TH>{t(dict, "booking.reference")}</TH>
                    <TH>{t(dict, "provider.businessName")}</TH>
                    <TH>{t(dict, "booking.steps.dates")}</TH>
                    <TH>{t(dict, "booking.guests")}</TH>
                    <TH align="end">{t(dict, "booking.total")}</TH>
                    <TH>{t(dict, "booking.paymentStatus")}</TH>
                    <TH>{t(dict, "booking.bookingStatus")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {items.map((booking) => (
                    <TR key={booking.id}>
                      <TD>
                        <Link
                          href={`/${locale}/account/bookings/${booking.id}`}
                          className="font-medium text-water-700 underline-offset-2 hover:underline"
                        >
                          {booking.reference}
                        </Link>
                      </TD>
                      <TD>{booking.business?.name ?? "—"}</TD>
                      <TD>
                        <span className="whitespace-nowrap">
                          {formatDate(booking.startDate, locale)} – {formatDate(booking.endDate, locale)}
                        </span>
                      </TD>
                      <TD>{booking.guests}</TD>
                      <TD align="end" className="whitespace-nowrap font-medium tabular-nums">
                        {formatMoney(
                          booking.total,
                          isCurrencyCode(booking.currency) ? booking.currency : defaultCurrency,
                          locale,
                        )}
                      </TD>
                      <TD>
                        <StatusBadge status={booking.paymentStatus} />
                      </TD>
                      <TD>
                        <StatusBadge status={booking.status} />
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

      <div className="flex justify-end">
        <ButtonLink href={`/${locale}/stay`} variant="secondary">
          {t(dict, "nav.bookNow")}
        </ButtonLink>
      </div>
    </div>
  );
}
