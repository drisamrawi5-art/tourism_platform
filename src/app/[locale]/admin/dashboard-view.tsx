"use client";

import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { defaultCurrency, formatMoney, formatNumber, isCurrencyCode } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/alert";
import { StatusBadge } from "@/components/ui/badge";
import { Stat, Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { useAdminFetch } from "@/components/admin/use-admin";
import { TableSkeleton } from "@/components/admin/skeleton";
import { bookingStatusLabel, eventLabel, statusLabel } from "@/components/admin/labels";

/** Shape of GET /api/v1/admin/overview (read from the route). */
type Overview = {
  totalUsers: number;
  businessesByStatus: Array<{ status: string; count: number }>;
  bookingsLast30DaysByStatus: Array<{ status: string; count: number }>;
  revenueLast30Days: { amount: string; currency: string };
  pendingReviews: number;
  contentPendingReview: number;
  analyticsLast30Days: {
    bookingCompleted: number;
    paymentSuccess: number;
    search: number;
  };
};

export function DashboardView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { data, loading, error, reload } = useAdminFetch<Overview>(
    "/api/v1/admin/overview",
  );

  if (loading && !data) {
    return (
      <div className="space-y-6">
        <TableSkeleton rows={4} cols={3} label={t(dict, "common.loading")} />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {t(dict, "errors.serverErrorBody")}
        </Alert>
        <Button variant="secondary" onClick={() => reload()}>
          {t(dict, "common.retry")}
        </Button>
      </div>
    );
  }

  if (!data) {
    return <EmptyState title={t(dict, "common.empty")} />;
  }

  const bookingTotal = data.bookingsLast30DaysByStatus.reduce(
    (sum, row) => sum + row.count,
    0,
  );
  const currency = isCurrencyCode(data.revenueLast30Days.currency)
    ? data.revenueLast30Days.currency
    : defaultCurrency;
  const counts = data.analyticsLast30Days;

  return (
    <div className="space-y-6">
      {error ? (
        <Alert tone="warning" role="status">
          {t(dict, "common.error")}
        </Alert>
      ) : null}

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <Stat label={t(dict, "admin.metrics.users")} value={formatNumber(data.totalUsers, locale)} />
        <Stat label={t(dict, "admin.bookings30")} value={formatNumber(bookingTotal, locale)} />
        <Stat
          label={t(dict, "admin.metrics.revenue30")}
          value={formatMoney(data.revenueLast30Days.amount, currency, locale)}
        />
        <Stat
          label={t(dict, "admin.metrics.pendingReviews")}
          value={formatNumber(data.pendingReviews, locale)}
          tone={data.pendingReviews > 0 ? "warning" : "neutral"}
        />
        <Stat
          label={t(dict, "admin.metrics.contentPending")}
          value={formatNumber(data.contentPendingReview, locale)}
          tone={data.contentPendingReview > 0 ? "warning" : "neutral"}
        />
        <Stat
          label={eventLabel(dict, "booking_completed")}
          value={formatNumber(counts.bookingCompleted, locale)}
        />
      </div>

      <Card>
        <CardHeader title={t(dict, "admin.businessesByStatus")} />
        <CardBody>
          {data.businessesByStatus.length === 0 ? (
            <EmptyState compact title={t(dict, "common.empty")} />
          ) : (
            <Table>
              <caption className="sr-only">{t(dict, "admin.businessesByStatus")}</caption>
              <THead>
                <tr>
                  <TH>{t(dict, "admin.status")}</TH>
                  <TH align="end">{t(dict, "admin.businesses")}</TH>
                </tr>
              </THead>
              <tbody>
                {data.businessesByStatus.map((row) => (
                  <TR key={row.status}>
                    <TD>
                      <StatusBadge status={row.status} />
                      <span className="ms-2 text-rocky-600">{statusLabel(dict, row.status)}</span>
                    </TD>
                    <TD align="end" className="tabular-nums">
                      {formatNumber(row.count, locale)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.bookings30")} />
        <CardBody>
          {data.bookingsLast30DaysByStatus.length === 0 ? (
            <EmptyState compact title={t(dict, "common.empty")} />
          ) : (
            <Table>
              <caption className="sr-only">{t(dict, "admin.bookings30")}</caption>
              <THead>
                <tr>
                  <TH>{t(dict, "booking.bookingStatus")}</TH>
                  <TH align="end">{t(dict, "admin.bookings")}</TH>
                </tr>
              </THead>
              <tbody>
                {data.bookingsLast30DaysByStatus.map((row) => (
                  <TR key={row.status}>
                    <TD>
                      <StatusBadge status={row.status} />
                      <span className="ms-2 text-rocky-600">
                        {bookingStatusLabel(dict, row.status)}
                      </span>
                    </TD>
                    <TD align="end" className="tabular-nums">
                      {formatNumber(row.count, locale)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.analytics")} />
        <CardBody>
          <Table>
            <caption className="sr-only">{t(dict, "admin.analytics")}</caption>
            <THead>
              <tr>
                <TH>{t(dict, "admin.eventCount")}</TH>
                <TH align="end">{t(dict, "common.all")}</TH>
              </tr>
            </THead>
            <tbody>
              <TR>
                <TD>{eventLabel(dict, "booking_completed")}</TD>
                <TD align="end" className="tabular-nums">
                  {formatNumber(counts.bookingCompleted, locale)}
                </TD>
              </TR>
              <TR>
                <TD>{eventLabel(dict, "payment_success")}</TD>
                <TD align="end" className="tabular-nums">
                  {formatNumber(counts.paymentSuccess, locale)}
                </TD>
              </TR>
              <TR>
                <TD>{eventLabel(dict, "search")}</TD>
                <TD align="end" className="tabular-nums">
                  {formatNumber(counts.search, locale)}
                </TD>
              </TR>
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
