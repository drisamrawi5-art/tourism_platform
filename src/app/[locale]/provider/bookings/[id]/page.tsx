"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate, formatMoney } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ApiClientError } from "@/lib/api/client";

type Booking = {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  paymentMode: string;
  startDate: string;
  endDate: string;
  guests: number;
  total: string;
  subtotal: string;
  currency: string;
  depositEnabled: boolean;
  depositAmount: string | null;
  amountPaid: string;
  amountRefunded: string;
  commissionRate: string;
  commissionAmount: string;
  cancellationPolicyText: string | null;
  createdAt: string;
  confirmedAt: string | null;
  completedAt: string | null;
  customer: { id: string; name: string | null; email: string; phone: string | null } | null;
  business: { id: string; name: string };
  items: Array<{
    bookable: { slug: string; category: string; unit: { name: string } | null; guideService: { name: string } | null };
    startDate: string;
    endDate: string;
    guests: number;
    quantity: number;
    pricingUnit: string;
    unitPrice: string;
    subtotal: string;
  }>;
  payments: Array<{ id: string; status: string; mode: string; amount: string; currency: string; createdAt: string }>;
  reviews: Array<{ id: string; rating: number; comment: string | null; status: string }>;
};

export default function ProviderBookingDetail() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const params = useParams<{ id: string }>();
  const [booking, setBooking] = useState<Booking | null>(null);
  const [error, setError] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch<{ booking: Booking }>(`/api/v1/provider/bookings/${params.id}`);
      setBooking(res.data.booking);
    } catch {
      setError(true);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (action: "confirm" | "complete") => {
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await apiFetch(`/api/v1/provider/bookings/${params.id}/${action}`, { method: "POST" });
      setActionOk(t(dict, "admin.settingsSaved"));
      await load();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setBusy(false);
    }
  };

  if (error) {
    return (
      <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
        {t(dict, "errors.serverErrorBody")}
      </Alert>
    );
  }

  if (!booking) {
    return <div className="skeleton h-48 w-full" />;
  }

  const serviceName = booking.items[0]?.bookable?.unit?.name ?? booking.items[0]?.bookable?.guideService?.name ?? booking.items[0]?.bookable?.slug ?? "—";

  return (
    <div className="space-y-6">
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
          description={serviceName}
          action={
            <div className="flex gap-2">
              {booking.status === "PENDING" ? (
                <Button onClick={() => act("confirm")} disabled={busy}>
                  {t(dict, "provider.confirmBooking")}
                </Button>
              ) : null}
              {booking.status === "PENDING" || booking.status === "CONFIRMED" ? (
                <Button onClick={() => act("complete")} disabled={busy} variant="secondary">
                  {t(dict, "provider.markCompleted")}
                </Button>
              ) : null}
            </div>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap gap-2">
            <StatusBadge status={booking.status} />
            <StatusBadge status={booking.paymentStatus} />
            <span className="text-sm text-rocky-600">
              {t(dict, "admin.mode")}: {booking.paymentMode}
            </span>
          </div>

          <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <dt className="text-rocky-500">{t(dict, "admin.customer")}</dt>
              <dd className="font-medium text-rocky-900">{booking.customer?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-rocky-500">{t(dict, "common.email")}</dt>
              <dd className="font-medium text-rocky-900">{booking.customer?.email ?? "—"}</dd>
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
          </dl>

          <div className="border-t border-rocky-100 pt-4">
            <h3 className="mb-2 text-sm font-semibold text-rocky-800">{t(dict, "provider.price")}</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-rocky-600">{t(dict, "provider.price")}</dt>
                <dd className="tabular-nums font-medium">{formatMoney(booking.subtotal, booking.currency as "MAD", locale)}</dd>
              </div>
              {booking.depositEnabled && booking.depositAmount ? (
                <div className="flex justify-between">
                  <dt className="text-rocky-600">{t(dict, "provider.depositPercent")}</dt>
                  <dd className="tabular-nums font-medium">{formatMoney(booking.depositAmount, booking.currency as "MAD", locale)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between">
                <dt className="text-rocky-600">{t(dict, "admin.payments")}</dt>
                <dd className="tabular-nums font-medium">{formatMoney(booking.amountPaid, booking.currency as "MAD", locale)}</dd>
              </div>
              <div className="flex justify-between border-t border-rocky-100 pt-2">
                <dt className="font-medium text-rocky-900">{t(dict, "provider.revenueTotal")}</dt>
                <dd className="tabular-nums font-semibold">{formatMoney(booking.total, booking.currency as "MAD", locale)}</dd>
              </div>
              <div className="flex justify-between text-rocky-500">
                <dt>{t(dict, "admin.metrics.revenue")}</dt>
                <dd className="tabular-nums">−{formatMoney(booking.commissionAmount, booking.currency as "MAD", locale)}</dd>
              </div>
            </dl>
          </div>

          {booking.cancellationPolicyText ? (
            <div className="border-t border-rocky-100 pt-4">
              <h3 className="mb-1 text-sm font-semibold text-rocky-800">{t(dict, "provider.cancellationText")}</h3>
              <p className="text-sm text-rocky-600">{booking.cancellationPolicyText}</p>
            </div>
          ) : null}

          {booking.payments.length > 0 ? (
            <div className="border-t border-rocky-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-rocky-800">{t(dict, "admin.payments")}</h3>
              <ul className="space-y-1 text-sm">
                {booking.payments.map((p) => (
                  <li key={p.id} className="flex items-center justify-between">
                    <span className="text-rocky-600">
                      {p.mode} · {formatDate(p.createdAt, locale)}
                    </span>
                    <span className="tabular-nums font-medium">
                      {formatMoney(p.amount, p.currency as "MAD", locale)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {booking.reviews.length > 0 ? (
            <div className="border-t border-rocky-100 pt-4">
              <h3 className="mb-2 text-sm font-semibold text-rocky-800">{t(dict, "provider.reviews")}</h3>
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
        </CardBody>
      </Card>
    </div>
  );
}
