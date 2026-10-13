"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, qs, type PaginationMeta } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate, formatMoney, defaultCurrency, isCurrencyCode } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink, LoadingBlock } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { Pagination } from "@/components/ui/pagination";
import { formError, useRequireAuth } from "@/components/auth/helpers";
import { ErrorAlert } from "@/components/provider/ui";
import type {
  ProviderBookingListRow,
  ProviderBookingScalars,
} from "@/components/provider/types";

type StatusFilter = "" | "PENDING" | "CONFIRMED" | "COMPLETED" | "CANCELLED" | "REFUNDED";

const STATUS_OPTIONS: readonly StatusFilter[] = [
  "",
  "PENDING",
  "CONFIRMED",
  "COMPLETED",
  "CANCELLED",
  "REFUNDED",
];

/**
 * Provider bookings — GET /api/v1/provider/bookings with status + reference
 * filters and pagination. Row actions POST the two state transitions the API
 * exposes (confirm / complete) and patch the row in place from the response.
 */
export function ProviderBookingsView({
  locale,
  initialPage,
  initialStatus,
  initialReference,
}: {
  locale: Locale;
  initialPage: number;
  initialStatus: StatusFilter;
  initialReference: string;
}) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { ready } = useRequireAuth(locale);

  const [items, setItems] = useState<ProviderBookingListRow[]>([]);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [referenceInput, setReferenceInput] = useState(initialReference);

  const page = initialPage;
  const status = initialStatus;
  const reference = initialReference;

  useEffect(() => {
    setReferenceInput(initialReference);
  }, [initialReference]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setActionError(null);
    try {
      const res = await apiFetch<ProviderBookingListRow[]>(
        `/api/v1/provider/bookings${qs({ page, perPage: 10, status, reference })}`,
      );
      setItems(res.data ?? []);
      setPagination(res.pagination ?? null);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, [page, status, reference]);

  useEffect(() => {
    void load();
  }, [load]);

  const hrefFor = (target: number) =>
    `/${locale}/provider/bookings${qs({ page: target, status, reference })}`;

  function onStatusChange(value: StatusFilter) {
    router.push(`/${locale}/provider/bookings${qs({ page: 1, status: value, reference })}`);
  }

  function onSearch(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    router.push(
      `/${locale}/provider/bookings${qs({ page: 1, status, reference: referenceInput.trim() })}`,
    );
  }

  async function act(row: ProviderBookingListRow, kind: "confirm" | "complete") {
    if (busyId) return;
    setBusyId(row.id);
    setActionError(null);
    try {
      const res = await apiFetch<{ booking: ProviderBookingScalars }>(
        `/api/v1/provider/bookings/${row.id}/${kind}`,
        { method: "POST", body: {} },
      );
      const updated = res.data.booking;
      setItems((prev) => prev.map((b) => (b.id === row.id ? { ...b, ...updated } : b)));
    } catch (err) {
      setActionError(formError(err, dict));
    } finally {
      setBusyId(null);
    }
  }

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t(dict, "provider.bookings")}
          action={
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-end">
              <div className="w-full sm:w-48">
                <Field label={t(dict, "common.filters")} htmlFor="provider-booking-status">
                  <Select
                    id="provider-booking-status"
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
              <form onSubmit={onSearch} className="flex w-full items-end gap-2 sm:w-64">
                <Field
                  label={t(dict, "booking.reference")}
                  htmlFor="provider-booking-reference"
                  className="flex-1"
                >
                  <Input
                    id="provider-booking-reference"
                    name="reference"
                    type="search"
                    maxLength={30}
                    value={referenceInput}
                    onChange={(e) => setReferenceInput(e.target.value)}
                    disabled={loading}
                  />
                </Field>
                <Button type="submit" variant="secondary" disabled={loading}>
                  {t(dict, "common.search")}
                </Button>
              </form>
            </div>
          }
        />
        <CardBody>
          {actionError ? (
            <div className="mb-4">
              <Alert tone="danger" role="alert">
                {actionError}
              </Alert>
            </div>
          ) : null}

          {loading ? (
            <LoadingBlock text={t(dict, "common.loading")} />
          ) : error !== null ? (
            <ErrorAlert dict={dict} error={error} onRetry={() => void load()} />
          ) : items.length === 0 ? (
            <EmptyState
              title={t(dict, "provider.bookingsEmpty")}
              description={reference ? t(dict, "common.noResults") : undefined}
              action={
                reference
                  ? {
                      href: `/${locale}/provider/bookings`,
                      label: t(dict, "common.clearFilters"),
                    }
                  : undefined
              }
            />
          ) : (
            <div className="space-y-4">
              <Table>
                <THead>
                  <tr>
                    <TH>{t(dict, "booking.reference")}</TH>
                    <TH>{t(dict, "booking.fullName")}</TH>
                    <TH>{t(dict, "booking.steps.dates")}</TH>
                    <TH align="end">{t(dict, "booking.total")}</TH>
                    <TH>{t(dict, "booking.paymentStatus")}</TH>
                    <TH>{t(dict, "booking.bookingStatus")}</TH>
                    <TH align="end" />
                  </tr>
                </THead>
                <tbody>
                  {items.map((booking) => (
                    <TR key={booking.id}>
                      <TD>
                        <Link
                          href={`/${locale}/provider/bookings/${booking.id}`}
                          className="font-medium text-water-700 underline-offset-2 hover:underline"
                        >
                          {booking.reference}
                        </Link>
                      </TD>
                      <TD>{booking.customer?.name ?? booking.customerName ?? "—"}</TD>
                      <TD className="whitespace-nowrap">
                        {formatDate(booking.startDate, locale)} –{" "}
                        {formatDate(booking.endDate, locale)}
                      </TD>
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
                      <TD align="end">
                        {booking.status === "PENDING" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busyId === booking.id}
                            disabled={busyId !== null && busyId !== booking.id}
                            onClick={() => void act(booking, "confirm")}
                          >
                            {t(dict, "provider.confirmBooking")}
                          </Button>
                        ) : booking.status === "CONFIRMED" ? (
                          <Button
                            size="sm"
                            variant="secondary"
                            loading={busyId === booking.id}
                            disabled={busyId !== null && busyId !== booking.id}
                            onClick={() => void act(booking, "complete")}
                          >
                            {t(dict, "provider.markCompleted")}
                          </Button>
                        ) : null}
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
        <ButtonLink href={`/${locale}/provider`} variant="ghost">
          {t(dict, "common.back")}
        </ButtonLink>
      </div>
    </div>
  );
}
