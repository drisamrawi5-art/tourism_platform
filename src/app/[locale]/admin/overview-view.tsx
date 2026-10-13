"use client";

import { getDictionary, t, type Dictionary } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { qs } from "@/lib/api/client";
import { formatMoney, formatNumber, isCurrencyCode, defaultCurrency, formatDate } from "@/lib/currency";
import { can } from "@/components/admin/permissions";
import { useRequireAuth } from "@/components/auth/helpers";
import { useApi } from "@/components/admin/api";
import { LoadError, PermissionDenied } from "@/components/admin/feedback";
import type { AnalyticsData, OverviewData } from "@/components/admin/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { LoadingBlock } from "@/components/ui/button";

/** Analytics window used by both admin analytics endpoints (server clamps). */
const ANALYTICS_DAYS = 30;

function eventLabel(dict: Dictionary, type: string): string {
  switch (type) {
    case "booking_started":
      return t(dict, "admin.events.bookingStarted");
    case "booking_completed":
      return t(dict, "admin.events.bookingCompleted");
    case "payment_success":
      return t(dict, "admin.events.paymentSuccess");
    case "payment_failure":
      return t(dict, "admin.events.paymentFailure");
    case "search":
      return t(dict, "admin.events.search");
    default:
      // Raw event type from the API — data, not interface copy.
      return type;
  }
}

function CountList({
  rows,
}: {
  rows: Array<{ key: string; label: string; count: number }>;
}) {
  return (
    <ul className="divide-y divide-rocky-100">
      {rows.map((row) => (
        <li key={row.key} className="flex items-center justify-between gap-3 py-2 text-sm">
          <span className="min-w-0 truncate text-rocky-700">{row.label}</span>
          <span className="shrink-0 font-medium tabular-nums text-rocky-900">
            {row.count}
          </span>
        </li>
      ))}
    </ul>
  );
}

export function AdminOverviewView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { user, ready } = useRequireAuth(locale);
  const allowed = can(user, "analytics.read");

  const overview = useApi<OverviewData>(
    allowed ? "/api/v1/admin/overview" : null,
  );
  const analytics = useApi<AnalyticsData>(
    allowed ? `/api/v1/admin/analytics${qs({ days: ANALYTICS_DAYS })}` : null,
  );

  if (!ready) return null;
  if (!allowed) return <PermissionDenied locale={locale} />;

  const retry = () => {
    overview.reload();
    analytics.reload();
  };

  if ((overview.error && !overview.data) || (analytics.error && !analytics.data)) {
    return <LoadError locale={locale} error={overview.error ?? analytics.error} onRetry={retry} />;
  }
  if ((overview.loading && !overview.data) || (analytics.loading && !analytics.data)) {
    return <LoadingBlock text={t(dict, "common.loading")} />;
  }
  if (!overview.data || !analytics.data) return null;

  const ov = overview.data;
  const an = analytics.data;

  const businessTotal = ov.businessesByStatus.reduce((sum, row) => sum + row.count, 0);
  const pendingApprovals =
    ov.businessesByStatus.find((row) => row.status === "PENDING_REVIEW")?.count ?? 0;
  const bookingsTotal = ov.bookingsLast30DaysByStatus.reduce(
    (sum, row) => sum + row.count,
    0,
  );
  const revenueCurrency = isCurrencyCode(ov.revenueLast30Days.currency)
    ? ov.revenueLast30Days.currency
    : defaultCurrency;

  const daily = an.dailyCounts;
  const maxDaily = Math.max(1, ...daily.map((row) => row.count));
  const firstDay = daily[0];
  const lastDay = daily[daily.length - 1];

  const funnelRows = [
    { key: "booking_started", count: an.funnel.booking_started },
    { key: "booking_completed", count: an.funnel.booking_completed },
    { key: "payment_success", count: an.funnel.payment_success },
    { key: "payment_failure", count: an.funnel.payment_failure },
  ].map((row) => ({
    key: row.key,
    label: eventLabel(dict, row.key),
    count: row.count,
  }));

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t(dict, "admin.metrics.users")}
          value={formatNumber(ov.totalUsers, locale)}
        />
        <Stat
          label={t(dict, "admin.metrics.businesses")}
          value={formatNumber(businessTotal, locale)}
        />
        <Stat
          label={t(dict, "admin.metrics.pendingApprovals")}
          value={formatNumber(pendingApprovals, locale)}
          tone={pendingApprovals > 0 ? "warning" : "neutral"}
        />
        <Stat
          label={t(dict, "admin.bookings30")}
          value={formatNumber(bookingsTotal, locale)}
        />
        <Stat
          label={t(dict, "admin.metrics.revenue30")}
          value={formatMoney(ov.revenueLast30Days.amount, revenueCurrency, locale)}
        />
        <Stat
          label={t(dict, "admin.metrics.pendingReviews")}
          value={formatNumber(ov.pendingReviews, locale)}
          tone={ov.pendingReviews > 0 ? "warning" : "neutral"}
        />
        <Stat
          label={t(dict, "admin.metrics.contentPending")}
          value={formatNumber(ov.contentPendingReview, locale)}
          tone={ov.contentPendingReview > 0 ? "warning" : "neutral"}
        />
        <Stat
          label={t(dict, "admin.eventCount")}
          value={formatNumber(
            an.eventsByType.reduce((sum, row) => sum + row.count, 0),
            locale,
          )}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t(dict, "admin.businessesByStatus")} />
          <CardBody>
            {ov.businessesByStatus.length === 0 ? (
              <p className="text-sm text-rocky-600">{t(dict, "common.empty")}</p>
            ) : (
              <CountList
                rows={ov.businessesByStatus.map((row) => ({
                  key: row.status,
                  label: t(dict, `common.status.${row.status}`),
                  count: row.count,
                }))}
              />
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t(dict, "admin.bookings30")} />
          <CardBody>
            {ov.bookingsLast30DaysByStatus.length === 0 ? (
              <p className="text-sm text-rocky-600">{t(dict, "common.empty")}</p>
            ) : (
              <CountList
                rows={ov.bookingsLast30DaysByStatus.map((row) => ({
                  key: row.status,
                  label: t(dict, `booking.statuses.${row.status}`),
                  count: row.count,
                }))}
              />
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t(dict, "admin.analytics")}
          description={t(dict, "admin.eventsByType")}
        />
        <CardBody className="space-y-8">
          <div className="grid gap-8 lg:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-rocky-800">
                {t(dict, "admin.funnel")}
              </h3>
              <CountList rows={funnelRows} />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-rocky-800">
                {t(dict, "admin.eventsByType")}
              </h3>
              <CountList
                rows={an.eventsByType.map((row) => ({
                  key: row.type,
                  label: eventLabel(dict, row.type),
                  count: row.count,
                }))}
              />
            </div>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-rocky-800">
              {t(dict, "admin.dailyCounts")}
            </h3>
            {daily.length > 0 ? (
              <>
                <div
                  className="flex h-32 items-end gap-px"
                  role="img"
                  aria-label={
                    firstDay && lastDay
                      ? `${formatDate(firstDay.date, locale)} – ${formatDate(lastDay.date, locale)}`
                      : undefined
                  }
                >
                  {daily.map((row) => (
                    <div
                      key={row.date}
                      title={`${row.date}: ${row.count}`}
                      className="min-w-0 flex-1 rounded-t-sm bg-water-500/70 transition-colors hover:bg-water-600"
                      style={{
                        height:
                          row.count > 0
                            ? `${Math.max(2, Math.round((row.count / maxDaily) * 100))}%`
                            : "0%",
                      }}
                    />
                  ))}
                </div>
                {firstDay && lastDay ? (
                  <div className="mt-1 flex justify-between text-xs text-rocky-500">
                    <span>{formatDate(firstDay.date, locale)}</span>
                    <span>{formatDate(lastDay.date, locale)}</span>
                  </div>
                ) : null}
              </>
            ) : (
              <p className="text-sm text-rocky-600">{t(dict, "common.empty")}</p>
            )}
          </div>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-rocky-800">
              {t(dict, "admin.topPaths")}
            </h3>
            {an.topPaths.length > 0 ? (
              <div className="rounded-lg border border-rocky-200">
                <div className="flex items-center justify-between gap-3 border-b border-rocky-200 bg-rocky-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-rocky-500">
                  <span>{t(dict, "admin.path")}</span>
                  <span>{t(dict, "admin.eventCount")}</span>
                </div>
                <ul className="divide-y divide-rocky-100">
                  {an.topPaths.map((row) => (
                    <li
                      key={row.path}
                      className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                    >
                      <span className="min-w-0 truncate font-mono text-rocky-700">
                        {row.path}
                      </span>
                      <span className="shrink-0 tabular-nums text-rocky-900">
                        {row.count}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <p className="text-sm text-rocky-600">{t(dict, "common.empty")}</p>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
