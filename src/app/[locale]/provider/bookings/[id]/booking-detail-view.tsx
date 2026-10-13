"use client";

import { useCallback, useEffect, useState } from "react";
import { notFound } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate, formatMoney, defaultCurrency, isCurrencyCode } from "@/lib/currency";
import { Button, ButtonLink, LoadingBlock } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { formError, useRequireAuth } from "@/components/auth/helpers";
import { ErrorAlert } from "@/components/provider/ui";
import type {
  ProviderBookingDetail,
  ProviderBookingScalars,
} from "@/components/provider/types";

/**
 * Provider booking detail — GET /api/v1/provider/bookings/[id] plus the two
 * status transitions the API exposes: POST …/confirm (PENDING → CONFIRMED)
 * and POST …/complete (→ COMPLETED). After an action the returned scalars are
 * merged into the loaded row so the relations (customer/items/payments) stay.
 */
export function ProviderBookingDetailView({
  locale,
  bookingId,
}: {
  locale: Locale;
  bookingId: string;
}) {
  const dict = getDictionary(locale);
  const { ready } = useRequireAuth(locale);

  const [booking, setBooking] = useState<ProviderBookingDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<unknown>(null);
  const [missing, setMissing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [busyAction, setBusyAction] = useState<"confirm" | "complete" | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    setMissing(false);
    try {
      const res = await apiFetch<{ booking: ProviderBookingDetail }>(
        `/api/v1/provider/bookings/${bookingId}`,
      );
      setBooking(res.data.booking);
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) setMissing(true);
      else setLoadError(err);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(kind: "confirm" | "complete") {
    if (busyAction || !booking) return;
    setBusyAction(kind);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await apiFetch<{ booking: ProviderBookingScalars }>(
        `/api/v1/provider/bookings/${booking.id}/${kind}`,
        { method: "POST", body: {} },
      );
      const updated = res.data.booking;
      setBooking((prev) => (prev ? { ...prev, ...updated } : prev));
      setActionInfo(
        kind === "confirm"
          ? t(dict, "notifications.types.booking.confirmed", { ref: updated.reference })
          : t(dict, "notifications.types.booking.completed", { ref: updated.reference }),
      );
    } catch (err) {
      setActionError(formError(err, dict));
    } finally {
      setBusyAction(null);
    }
  }

  if (!ready) return null;
  if (missing) notFound();

  if (loading && !booking) return <LoadingBlock text={t(dict, "common.loading")} />;
  if (loadError !== null && !booking) {
    return <ErrorAlert dict={dict} error={loadError} onRetry={() => void load()} />;
  }
  if (!booking) return <LoadingBlock text={t(dict, "common.loading")} />;

  const currency = isCurrencyCode(booking.currency) ? booking.currency : defaultCurrency;
  const money = (amount: string) => formatMoney(amount, currency, locale);
  const canConfirm = booking.status === "PENDING";
  const canComplete = booking.status === "CONFIRMED";
  const customerName = booking.customer?.name ?? booking.customerName;
  const customerEmail = booking.customer?.email ?? booking.customerEmail;
  const customerPhone = booking.customer?.phone ?? booking.customerPhone;

  const itemsTitle =
    booking.items[0]?.bookable?.category === "ACCOMMODATION"
      ? t(dict, "stay.rooms")
      : t(dict, "guides.services");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-3">
              <span>{booking.reference}</span>
              <StatusBadge status={booking.status} />
              <StatusBadge status={booking.paymentStatus} />
            </span>
          }
          description={booking.business?.name ?? undefined}
          action={
            <div className="flex flex-wrap gap-2">
              {canConfirm ? (
                <Button
                  variant="accent"
                  loading={busyAction === "confirm"}
                  disabled={busyAction !== null && busyAction !== "confirm"}
                  onClick={() => void act("confirm")}
                >
                  {t(dict, "provider.confirmBooking")}
                </Button>
              ) : null}
              {canComplete ? (
                <Button
                  variant="primary"
                  loading={busyAction === "complete"}
                  disabled={busyAction !== null && busyAction !== "complete"}
                  onClick={() => void act("complete")}
                >
                  {t(dict, "provider.markCompleted")}
                </Button>
              ) : null}
            </div>
          }
        />
        <CardBody className="space-y-4">
          {actionError ? (
            <Alert tone="danger" role="alert">
              {actionError}
            </Alert>
          ) : null}
          {actionInfo ? (
            <Alert tone="success" role="status">
              {actionInfo}
            </Alert>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.startDate")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">
                {formatDate(booking.startDate, locale)}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.endDate")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{formatDate(booking.endDate, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.guests")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{booking.guests}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.paymentStatus")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">
                {t(dict, `booking.paymentStatuses.${booking.paymentStatus}`)}
              </dd>
            </div>
            {booking.confirmedAt ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                  {t(dict, "booking.statuses.CONFIRMED")}
                </dt>
                <dd className="mt-0.5 text-rocky-800">
                  {formatDate(booking.confirmedAt, locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            ) : null}
            {booking.completedAt ? (
              <div>
                <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                  {t(dict, "booking.statuses.COMPLETED")}
                </dt>
                <dd className="mt-0.5 text-rocky-800">
                  {formatDate(booking.completedAt, locale, {
                    dateStyle: "medium",
                    timeStyle: "short",
                  })}
                </dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      {/* Customer */}
      <Card>
        <CardHeader title={t(dict, "booking.yourDetails")} />
        <CardBody>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.fullName")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{customerName ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.email")}
              </dt>
              <dd className="mt-0.5 break-all text-rocky-800">{customerEmail ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.phone")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{customerPhone ?? "—"}</dd>
            </div>
          </dl>
          {booking.customerNote ? (
            <div className="mt-4 border-t border-rocky-100 pt-4 text-sm">
              <p className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.note")}
              </p>
              <p className="mt-1 whitespace-pre-wrap leading-relaxed text-rocky-700">
                {booking.customerNote}
              </p>
            </div>
          ) : null}
        </CardBody>
      </Card>

      {/* Items */}
      <Card>
        <CardHeader title={itemsTitle} />
        <CardBody>
          {booking.items.length === 0 ? (
            <EmptyState compact title={t(dict, "common.empty")} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t(dict, "provider.serviceName")}</TH>
                  <TH>{t(dict, "booking.startDate")}</TH>
                  <TH>{t(dict, "booking.endDate")}</TH>
                  <TH>{t(dict, "booking.guests")}</TH>
                  <TH align="end">{t(dict, "booking.total")}</TH>
                </tr>
              </THead>
              <tbody>
                {booking.items.map((item) => (
                  <TR key={item.bookableId}>
                    <TD className="font-medium text-rocky-900">
                      {item.bookable
                        ? item.bookable.unit?.name ??
                          item.bookable.guideService?.name ??
                          item.bookable.slug
                        : item.bookableId}
                    </TD>
                    <TD className="whitespace-nowrap">{formatDate(item.startDate, locale)}</TD>
                    <TD className="whitespace-nowrap">{formatDate(item.endDate, locale)}</TD>
                    <TD>{item.guests}</TD>
                    <TD align="end" className="whitespace-nowrap font-medium tabular-nums">
                      {money(item.subtotal)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Price summary */}
      <Card>
        <CardHeader title={t(dict, "booking.priceSummary")} />
        <CardBody>
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-rocky-600">{t(dict, "booking.subtotal")}</dt>
              <dd className="font-medium tabular-nums text-rocky-900">
                {money(booking.subtotal)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 border-t border-rocky-200 pt-2">
              <dt className="font-semibold text-rocky-900">{t(dict, "booking.total")}</dt>
              <dd className="text-base font-semibold tabular-nums text-rocky-900">
                {money(booking.total)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-1">
              <dt className="text-rocky-600">{t(dict, "booking.paymentStatuses.PAID")}</dt>
              <dd className="font-medium tabular-nums text-forest-700">
                {money(booking.amountPaid)}
              </dd>
            </div>
            {Number(booking.amountRefunded) > 0 ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-rocky-600">
                  {t(dict, "booking.paymentStatuses.REFUNDED")}
                </dt>
                <dd className="font-medium tabular-nums text-rocky-900">
                  {money(booking.amountRefunded)}
                </dd>
              </div>
            ) : null}
          </dl>
          <div className="mt-6">
            <h3 className="text-sm font-semibold text-rocky-800">
              {t(dict, "booking.cancellationPolicy")}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-rocky-600">
              {booking.cancellationPolicyText ?? t(dict, "booking.noCancellationPolicy")}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* Payments */}
      <Card>
        <CardHeader title={t(dict, "payment.title")} />
        <CardBody>
          {booking.payments.length === 0 ? (
            <EmptyState compact title={t(dict, "common.empty")} />
          ) : (
            <ul className="divide-y divide-rocky-100">
              {booking.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
                >
                  <span className="font-medium text-rocky-900">
                    {formatMoney(
                      payment.amount,
                      isCurrencyCode(payment.currency) ? payment.currency : currency,
                      locale,
                    )}
                  </span>
                  <span className="text-sm text-rocky-600">
                    {payment.mode === "DEPOSIT"
                      ? t(dict, "booking.payDeposit")
                      : t(dict, "booking.payFull")}
                  </span>
                  <StatusBadge status={payment.status} />
                  <span className="ms-auto text-sm text-rocky-500">
                    {formatDate(payment.createdAt, locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Reviews left for this booking */}
      {booking.reviews.length > 0 ? (
        <Card>
          <CardHeader title={t(dict, "reviews.title")} />
          <CardBody>
            <ul className="divide-y divide-rocky-100">
              {booking.reviews.map((review) => (
                <li key={review.id} className="py-3 first:pt-0 last:pb-0">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-medium text-rocky-900">
                      {t(dict, "reviews.stars", { n: review.rating })}
                    </span>
                    <StatusBadge status={review.status} />
                    <span className="ms-auto text-sm text-rocky-500">
                      {formatDate(review.createdAt, locale)}
                    </span>
                  </div>
                  {review.comment ? (
                    <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-rocky-600">
                      {review.comment}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        <ButtonLink href={`/${locale}/provider/bookings`} variant="ghost">
          {t(dict, "common.back")}
        </ButtonLink>
        <ButtonLink href={`/${locale}/provider`} variant="secondary">
          {t(dict, "provider.overview")}
        </ButtonLink>
      </div>
    </div>
  );
}
