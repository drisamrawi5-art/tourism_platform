"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t, type Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import {
  defaultCurrency,
  formatDate,
  formatMoney,
  formatNumber,
  isCurrencyCode,
} from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Stat } from "@/components/ui/stat";
import { useRequireAuth } from "@/components/auth/helpers";
import { SkeletonList, SkeletonStats } from "@/components/provider/skeleton";
import { LocalizedStatus } from "@/components/provider/status-badge";
import { providerErrorMessage, type ProviderOverview } from "@/components/provider/api";

/** Status badges with counts, used as a Stat hint (text label, not color alone). */
function StatusCounts({
  dict,
  locale,
  counts,
}: {
  dict: Dictionary;
  locale: Locale;
  counts: Record<string, number>;
}) {
  const entries = Object.entries(counts).filter(([, n]) => n > 0);
  if (entries.length === 0) {
    return <span className="text-rocky-500">{t(dict, "common.none")}</span>;
  }
  return (
    <span className="flex flex-wrap gap-x-3 gap-y-1">
      {entries.map(([status, n]) => (
        <span key={status} className="inline-flex items-center gap-1">
          <LocalizedStatus dict={dict} status={status} />
          <span className="tabular-nums">{formatNumber(n, locale)}</span>
        </span>
      ))}
    </span>
  );
}

export function OverviewView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { user, ready } = useRequireAuth(locale);
  const [overview, setOverview] = useState<ProviderOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ overview: ProviderOverview }>("/api/v1/provider/overview");
      setOverview(res.data.overview);
    } catch (err) {
      setError(providerErrorMessage(err, dict));
    } finally {
      setLoading(false);
    }
  }, [dict]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  if (!ready || !user) return null;

  if (loading && !overview) {
    return (
      <div className="space-y-6">
        <SkeletonStats label={t(dict, "common.loading")} tiles={3} />
        <Card>
          <CardBody>
            <SkeletonList label={t(dict, "common.loading")} rows={3} />
          </CardBody>
        </Card>
      </div>
    );
  }

  if (error && !overview) {
    return (
      <div className="space-y-4">
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {error}
        </Alert>
        <Button variant="secondary" onClick={() => void load()}>
          {t(dict, "common.retry")}
        </Button>
      </div>
    );
  }

  if (!overview) return null;

  const currency = isCurrencyCode(overview.revenue.currency)
    ? overview.revenue.currency
    : defaultCurrency;
  const businessTotal = Object.values(overview.businesses).reduce((sum, n) => sum + n, 0);

  return (
    <div className="space-y-6">
      {error ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {error}
        </Alert>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Stat
          label={t(dict, "provider.businesses")}
          value={formatNumber(businessTotal, locale)}
          hint={
            <StatusCounts dict={dict} locale={locale} counts={overview.businesses} />
          }
        />
        <Stat
          label={t(dict, "provider.metrics.bookings")}
          value={formatNumber(overview.bookingsTotal, locale)}
          hint={
            <StatusCounts dict={dict} locale={locale} counts={overview.bookingsByStatus} />
          }
        />
        <Stat
          label={t(dict, "provider.metrics.pendingReviews")}
          value={formatNumber(overview.pendingReviews, locale)}
        />
      </div>

      <Card>
        <CardHeader title={t(dict, "provider.revenue")} />
        <CardBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Stat
              label={t(dict, "provider.grossCollected")}
              value={formatMoney(overview.revenue.grossCollected, currency, locale)}
            />
            <Stat
              label={t(dict, "booking.paymentStatuses.REFUNDED")}
              value={formatMoney(overview.revenue.refunded, currency, locale)}
            />
            <Stat
              label={t(dict, "provider.commission")}
              value={formatMoney(overview.revenue.commission, currency, locale)}
            />
            <Stat
              label={t(dict, "provider.net")}
              value={formatMoney(overview.revenue.net, currency, locale)}
              tone="positive"
            />
          </div>
          <p className="text-sm leading-relaxed text-rocky-600">
            {t(dict, "provider.revenueDisclaimer")}
          </p>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "provider.upcomingBookings")} />
        <CardBody>
          {overview.upcomingBookings.length === 0 ? (
            <p className="text-sm text-rocky-600">{t(dict, "common.empty")}</p>
          ) : (
            <ul className="divide-y divide-rocky-100">
              {overview.upcomingBookings.map((booking) => (
                <li
                  key={booking.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/${locale}/provider/bookings/${booking.id}`}
                    className="font-medium text-rocky-900 underline-offset-2 hover:underline"
                  >
                    {booking.reference}
                  </Link>
                  <LocalizedStatus dict={dict} status={booking.status} />
                  <LocalizedStatus dict={dict} status={booking.paymentStatus} />
                  <span className="text-sm text-rocky-600">
                    {formatDate(booking.startDate, locale)} – {formatDate(booking.endDate, locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
