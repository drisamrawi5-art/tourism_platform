"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate, formatMoney } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge, StatusBadge, statusTone } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Textarea } from "@/components/ui/field";
import { ConfirmAction } from "@/components/admin/confirm";
import { newIdempotencyKey } from "@/components/admin/query";

/**
 * Admin booking detail — full booking lifecycle management:
 * confirm / complete / cancel (with reason) / refund (idempotent), plus the
 * complete price breakdown, payments and reviews. All actions call the same
 * audited backend rules the provider portal uses (no parallel logic here).
 */

type Booking = {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  startDate: string;
  endDate: string;
  guests: number;
  customerNote: string | null;
  subtotal: string;
  total: string;
  currency: string;
  depositEnabled: boolean;
  depositAmount: string | null;
  amountPaid: string;
  amountRefunded: string;
  commissionRate: string;
  commissionAmount: string;
  cancellationPolicyText: string | null;
  cancelReason: string | null;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  customer: { id: string; name: string | null; email: string; phone: string | null } | null;
  business: { id: string; name: string; slug: string };
  items: Array<{
    id: string;
    startDate: string;
    endDate: string;
    guests: number;
    quantity: number;
    pricingUnit: string;
    unitPrice: string;
    subtotal: string;
    bookable: {
      slug: string;
      category: string;
      unit: { name: string } | null;
      guideService: { name: string } | null;
    };
  }>;
  payments: Array<{
    id: string;
    status: string;
    amount: string;
    currency: string;
    mode: string;
    provider: string | null;
    paidAt: string | null;
    createdAt: string;
  }>;
  reviews: Array<{ id: string; rating: number; comment: string | null; status: string }>;
};

const money = (value: string, currency: string, locale: string) =>
  formatMoney(value, currency as "MAD", locale as "en");

export default function AdminBookingDetail() {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [refundResult, setRefundResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch<{ booking: Booking }>(`/api/v1/admin/bookings/${params.id}`);
      setBooking(res.data.booking);
    } catch {
      setError(true);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const run = async (
    fn: () => Promise<unknown>,
    successMessage: string,
  ) => {
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await fn();
      setActionOk(successMessage);
      await load();
    } catch (err) {
      setActionError(
        err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"),
      );
    } finally {
      setBusy(false);
    }
  };

  const act = (action: "confirm" | "complete") =>
    run(
      () => apiFetch(`/api/v1/admin/bookings/${params.id}/${action}`, { method: "POST" }),
      t(dict, "admin.bookingUpdated"),
    );

  const cancel = () =>
    run(
      () =>
        apiFetch(`/api/v1/bookings/${params.id}/cancel`, {
          method: "POST",
          body: cancelReason.trim() ? { reason: cancelReason.trim() } : {},
        }),
      t(dict, "booking.cancelled"),
    );

  const refund = () =>
    run(async () => {
      const parsed = refundAmount.trim() ? Number(refundAmount) : undefined;
      if (parsed !== undefined && (!Number.isFinite(parsed) || parsed <= 0)) {
        throw new ApiClientError(400, "INVALID_AMOUNT", t(dict, "admin.refundAmountInvalid"));
      }
      const res = await apiFetch<{ refundId: string; amount: string; status: string }>(
        `/api/v1/admin/bookings/${params.id}/refund`,
        {
          method: "POST",
          body: {
            ...(parsed !== undefined ? { amount: parsed } : {}),
            ...(refundReason.trim() ? { reason: refundReason.trim() } : {}),
            idempotencyKey: newIdempotencyKey(),
          },
        },
      );
      const data = res.data;
      setRefundResult(
        `${t(dict, "admin.refundResult")}: ${money(data.amount ?? refundAmount, booking?.currency ?? "MAD", locale)} · ${data.status ?? ""}`,
      );
      setRefundAmount("");
      setRefundReason("");
    }, t(dict, "payment.refunded"));

  if (error) {
    return (
      <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
        {t(dict, "errors.serverErrorBody")}
      </Alert>
    );
  }
  if (!booking) return <div className="skeleton h-48 w-full" aria-busy="true" />;

  const cur = booking.currency;
  const statusLabel = t(dict, `booking.statuses.${booking.status}`);
  const paymentStatusLabel = t(dict, `booking.paymentStatuses.${booking.paymentStatus}`);
  // Money was captured (fully or partially) → a refund may be requested;
  // the backend still enforces the real refundability rules.
  const refundable = Number(booking.amountPaid) > 0 && booking.paymentStatus !== "UNPAID";

  return (
    <div className="space-y-6">
      <p className="text-sm">
        <Link href={`/${locale}/admin/bookings`} className="text-forest-700 underline">
          {t(dict, "admin.bookings")}
        </Link>
      </p>

      {actionOk ? (
        <Alert tone="success" role="status">
          {actionOk}
        </Alert>
      ) : null}
      {actionError ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {actionError}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={booking.reference}
          description={booking.business?.name ?? "—"}
          action={
            <div className="flex flex-wrap gap-2">
              {booking.status === "PENDING" ? (
                <Button onClick={() => void act("confirm")} disabled={busy}>
                  {t(dict, "provider.confirmBooking")}
                </Button>
              ) : null}
              {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
                <Button variant="secondary" onClick={() => void act("complete")} disabled={busy}>
                  {t(dict, "provider.markCompleted")}
                </Button>
              ) : null}
              {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
                <ConfirmAction
                  label={t(dict, "booking.cancelBooking")}
                  confirmLabel={t(dict, "admin.confirm")}
                  cancelLabel={t(dict, "common.cancel")}
                  onConfirm={() => void cancel()}
                  busy={busy}
                />
              ) : null}
            </div>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusTone(booking.status)}>{statusLabel}</Badge>
            <Badge tone={statusTone(booking.paymentStatus)}>{paymentStatusLabel}</Badge>
            <span className="text-sm text-rocky-600">
              {t(dict, "admin.mode")}: {booking.paymentMode}
            </span>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-rocky-500">{t(dict, "admin.customer")}</dt>
              <dd className="font-medium text-rocky-900">
                {booking.customer?.name ?? "—"}{" "}
                <span className="font-normal text-rocky-600">({booking.customer?.email ?? "—"})</span>
              </dd>
            </div>
            <div>
              <dt className="text-rocky-500">{t(dict, "common.phone")}</dt>
              <dd className="font-medium text-rocky-900">{booking.customer?.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-rocky-500">{t(dict, "booking.startDate")}</dt>
              <dd className="font-medium text-rocky-900">{formatDate(booking.startDate, locale)}</dd>
            </div>
            <div>
              <dt className="text-rocky-500">{t(dict, "booking.endDate")}</dt>
              <dd className="font-medium text-rocky-900">{formatDate(booking.endDate, locale)}</dd>
            </div>
            <div>
              <dt className="text-rocky-500">{t(dict, "booking.guests")}</dt>
              <dd className="font-medium text-rocky-900">{booking.guests}</dd>
            </div>
            <div>
              <dt className="text-rocky-500">{t(dict, "admin.createdAt")}</dt>
              <dd className="font-medium text-rocky-900">{formatDate(booking.createdAt, locale)}</dd>
            </div>
            {booking.confirmedAt ? (
              <div>
                <dt className="text-rocky-500">{t(dict, "booking.statuses.CONFIRMED")}</dt>
                <dd className="font-medium text-rocky-900">{formatDate(booking.confirmedAt, locale)}</dd>
              </div>
            ) : null}
            {booking.completedAt ? (
              <div>
                <dt className="text-rocky-500">{t(dict, "booking.statuses.COMPLETED")}</dt>
                <dd className="font-medium text-rocky-900">{formatDate(booking.completedAt, locale)}</dd>
              </div>
            ) : null}
            {booking.cancelledAt ? (
              <div>
                <dt className="text-rocky-500">{t(dict, "booking.statuses.CANCELLED")}</dt>
                <dd className="font-medium text-rocky-900">{formatDate(booking.cancelledAt, locale)}</dd>
              </div>
            ) : null}
          </dl>

          {booking.customerNote ? (
            <div className="rounded-lg bg-rocky-50 p-3 text-sm">
              <span className="font-medium text-rocky-800">{t(dict, "booking.note")}: </span>
              <span className="text-rocky-700">{booking.customerNote}</span>
            </div>
          ) : null}

          {booking.cancelReason ? (
            <div className="rounded-lg bg-danger-50 p-3 text-sm">
              <span className="font-medium text-danger-700">{t(dict, "admin.cancelReason")}: </span>
              <span className="text-rocky-700">{booking.cancelReason}</span>
            </div>
          ) : null}

          <div className="border-t border-rocky-100 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-rocky-800">
              {t(dict, "admin.bookedItems")}
            </h3>
            <ul className="space-y-2 text-sm">
              {booking.items.map((item) => (
                <li key={item.id} className="rounded-lg bg-rocky-50 p-3">
                  <p className="font-medium text-rocky-900">
                    {item.bookable?.unit?.name ??
                      item.bookable?.guideService?.name ??
                      item.bookable?.slug ??
                      "—"}
                  </p>
                  <p className="text-xs text-rocky-500">
                    {formatDate(item.startDate, locale)} → {formatDate(item.endDate, locale)} ·{" "}
                    {item.quantity} × {money(item.unitPrice, cur, locale)} · {item.pricingUnit}
                  </p>
                  <p className="mt-1 tabular-nums font-medium">
                    {money(item.subtotal, cur, locale)}
                  </p>
                </li>
              ))}
            </ul>
          </div>

          <div className="border-t border-rocky-100 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-rocky-800">
              {t(dict, "booking.priceSummary")}
            </h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-rocky-600">{t(dict, "booking.subtotal")}</dt>
                <dd className="tabular-nums font-medium">{money(booking.subtotal, cur, locale)}</dd>
              </div>
              {booking.depositEnabled && booking.depositAmount ? (
                <div className="flex justify-between">
                  <dt className="text-rocky-600">{t(dict, "provider.depositPercent")}</dt>
                  <dd className="tabular-nums font-medium">
                    {money(booking.depositAmount, cur, locale)}
                  </dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-rocky-600">{t(dict, "admin.amountPaid")}</dt>
                <dd className="tabular-nums font-medium">{money(booking.amountPaid, cur, locale)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-rocky-600">{t(dict, "admin.amountRefunded")}</dt>
                <dd className="tabular-nums font-medium">
                  {money(booking.amountRefunded, cur, locale)}
                </dd>
              </div>
              <div className="flex justify-between border-t border-rocky-100 pt-2">
                <dt className="font-medium text-rocky-900">{t(dict, "booking.total")}</dt>
                <dd className="tabular-nums font-semibold">{money(booking.total, cur, locale)}</dd>
              </div>
              <div className="flex justify-between text-rocky-500">
                <dt>
                  {t(dict, "admin.commission")} ({booking.commissionRate}%)
                </dt>
                <dd className="tabular-nums">{money(booking.commissionAmount, cur, locale)}</dd>
              </div>
            </dl>
          </div>

          {booking.payments.length > 0 ? (
            <div className="border-t border-rocky-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-rocky-800">{t(dict, "admin.payments")}</h3>
              <ul className="space-y-2 text-sm">
                {booking.payments.map((p) => (
                  <li key={p.id} className="rounded-lg bg-rocky-50 p-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="flex items-center gap-2">
                        <Badge tone={statusTone(p.status)}>
                          {t(dict, `booking.paymentStatuses.${p.status}`)}
                        </Badge>
                        <span className="text-rocky-600">
                          {p.mode}
                          {p.provider ? ` · ${p.provider}` : ""}
                        </span>
                      </span>
                      <span className="tabular-nums font-medium">
                        {money(p.amount, p.currency || cur, locale)}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-rocky-500">
                      {p.paidAt
                        ? `${t(dict, "admin.paidAt")}: ${formatDate(p.paidAt, locale)}`
                        : formatDate(p.createdAt, locale)}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {refundable ? (
            <div className="border-t border-rocky-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-rocky-800">{t(dict, "admin.refund")}</h3>
              <p className="mb-3 text-xs text-peach-700">{t(dict, "admin.refundConfirm")}</p>
              <div className="grid gap-3 sm:grid-cols-2">
                <Field
                  label={t(dict, "admin.refundAmount")}
                  hint={t(dict, "admin.refundAmountHint")}
                  htmlFor="refund-amount"
                >
                  <Input
                    value={refundAmount}
                    onChange={(e) => setRefundAmount(e.target.value)}
                    disabled={busy}
                    inputMode="decimal"
                    placeholder={booking.amountPaid}
                  />
                </Field>
                <Field label={t(dict, "admin.refundReason")} htmlFor="refund-reason">
                  <Textarea
                    value={refundReason}
                    onChange={(e) => setRefundReason(e.target.value)}
                    disabled={busy}
                    maxLength={500}
                    rows={2}
                  />
                </Field>
              </div>
              <div className="mt-3">
                <ConfirmAction
                  label={t(dict, "admin.refund")}
                  confirmLabel={t(dict, "admin.confirm")}
                  cancelLabel={t(dict, "common.cancel")}
                  onConfirm={() => void refund()}
                  busy={busy}
                />
              </div>
              {refundResult ? (
                <p className="mt-2 text-sm text-forest-700" role="status">
                  {refundResult}
                </p>
              ) : null}
            </div>
          ) : null}

          {booking.reviews.length > 0 ? (
            <div className="border-t border-rocky-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-rocky-800">
                {t(dict, "provider.reviews")}
              </h3>
              <ul className="space-y-2 text-sm">
                {booking.reviews.map((r) => (
                  <li key={r.id} className="rounded-lg bg-rocky-50 p-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-rocky-900">{"★".repeat(r.rating)}</span>
                      <StatusBadge status={r.status} />
                    </div>
                    {r.comment ? <p className="mt-1 text-rocky-600">{r.comment}</p> : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {booking.cancellationPolicyText ? (
            <div className="border-t border-rocky-100 pt-4">
              <h3 className="mb-1 text-sm font-semibold text-rocky-800">
                {t(dict, "booking.cancellationPolicy")}
              </h3>
              <p className="text-sm text-rocky-600">{booking.cancellationPolicyText}</p>
            </div>
          ) : null}

          {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
            <div className="border-t border-rocky-100 pt-4">
              <h3 className="mb-1 text-sm font-semibold text-rocky-800">
                {t(dict, "admin.cancelReason")}
              </h3>
              <Field label={t(dict, "admin.cancelReason")} htmlFor="cancel-reason">
                <Input
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  disabled={busy}
                  maxLength={500}
                />
              </Field>
            </div>
          ) : null}
        </CardBody>
      </Card>
    </div>
  );
}
