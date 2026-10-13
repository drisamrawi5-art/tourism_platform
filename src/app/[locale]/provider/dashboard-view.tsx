"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate, formatMoney, formatNumber, defaultCurrency, isCurrencyCode } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink, LoadingBlock } from "@/components/ui/button";
import { Badge, StatusBadge, statusTone } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/alert";
import { Stat, Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { useRequireAuth } from "@/components/auth/helpers";
import {
  BusinessStatusNotice,
  ErrorAlert,
  SubmitForReviewButton,
} from "@/components/provider/ui";
import type { ProviderBusiness, ProviderOverview } from "@/components/provider/types";

/**
 * Provider overview — every number comes from GET /api/v1/provider/overview
 * (owner-scoped, real data) plus the caller's own business row. No invented
 * metrics: what the endpoint does not return is not shown.
 */
export function DashboardView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { ready } = useRequireAuth(locale);

  const [overview, setOverview] = useState<ProviderOverview | null>(null);
  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [overviewRes, businessRes] = await Promise.all([
        apiFetch<{ overview: ProviderOverview }>("/api/v1/provider/overview"),
        apiFetch<{ business: ProviderBusiness | null }>("/api/v1/provider/business"),
      ]);
      setOverview(overviewRes.data.overview);
      setBusiness(businessRes.data.business);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!ready) return null;
  if (loading) return <LoadingBlock text={t(dict, "common.loading")} />;
  if (error !== null) return <ErrorAlert dict={dict} error={error} onRetry={() => void load()} />;
  if (!overview) return <LoadingBlock text={t(dict, "common.loading")} />;

  const currency = isCurrencyCode(overview.revenue.currency)
    ? overview.revenue.currency
    : defaultCurrency;
  const pendingCount = overview.bookingsByStatus.PENDING ?? 0;
  const confirmedCount = overview.bookingsByStatus.CONFIRMED ?? 0;
  const businessCounts = Object.entries(overview.businesses).filter(([, count]) => count > 0);
  const canSubmit =
    business !== null && (business.status === "DRAFT" || business.status === "REJECTED");

  return (
    <div className="space-y-6">
      {/* Business status (workflow states: draft / pending review / rejected) */}
      <Card>
        <CardHeader
          title={t(dict, "provider.businessProfile")}
          action={business ? <StatusBadge status={business.status} /> : undefined}
        />
        <CardBody className="space-y-4">
          {business === null ? (
            <EmptyState
              title={t(dict, "provider.noBusiness")}
              description={t(dict, "provider.noBusinessBody")}
              action={{
                href: `/${locale}/provider/business`,
                label: t(dict, "provider.createBusiness"),
              }}
            />
          ) : (
            <>
              <BusinessStatusNotice
                dict={dict}
                status={business.status}
                action={
                  canSubmit ? (
                    <SubmitForReviewButton
                      dict={dict}
                      businessId={business.id}
                      onSubmitted={(updated) =>
                        setBusiness((prev) => (prev ? { ...prev, ...updated } : prev))
                      }
                    />
                  ) : undefined
                }
              />
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-rocky-600">
                <span className="font-medium text-rocky-900">{business.name}</span>
                <span>{business.email ?? "—"}</span>
                <span>{business.phone ?? "—"}</span>
              </div>
              {businessCounts.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                    {t(dict, "admin.metrics.businesses")}
                  </span>
                  {businessCounts.map(([status, count]) => (
                    <Badge key={status} tone={statusTone(status)}>
                      {t(dict, `common.status.${status}`)}
                      {` (${count})`}
                    </Badge>
                  ))}
                </div>
              ) : null}
            </>
          )}
        </CardBody>
      </Card>

      {/* Actionable counts */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t(dict, "provider.metrics.bookings")}
          value={formatNumber(overview.bookingsTotal, locale)}
        />
        <Stat
          label={t(dict, "provider.metrics.pendingBookings")}
          value={formatNumber(pendingCount, locale)}
          tone={pendingCount > 0 ? "warning" : "neutral"}
        />
        <Stat
          label={t(dict, "provider.metrics.confirmedBookings")}
          value={formatNumber(confirmedCount, locale)}
        />
        <Stat
          label={t(dict, "admin.metrics.pendingReviews")}
          value={formatNumber(overview.pendingReviews, locale)}
          tone={overview.pendingReviews > 0 ? "warning" : "neutral"}
        />
      </div>

      {/* Real collected amounts — gross / refunds / net shown separately */}
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label={t(dict, "admin.metrics.revenue")}
          value={formatMoney(overview.revenue.grossCollected, currency, locale)}
        />
        <Stat
          label={t(dict, "booking.paymentStatuses.REFUNDED")}
          value={formatMoney(overview.revenue.refunded, currency, locale)}
        />
        <Stat
          label={t(dict, "provider.revenueTotal")}
          value={formatMoney(overview.revenue.net, currency, locale)}
          hint={t(dict, "provider.revenueNote")}
        />
      </div>

      {/* Upcoming bookings */}
      <Card>
        <CardHeader
          title={t(dict, "provider.bookings")}
          action={
            <ButtonLink href={`/${locale}/provider/bookings`} variant="ghost" size="sm">
              {t(dict, "common.viewAll")}
            </ButtonLink>
          }
        />
        <CardBody>
          {overview.upcomingBookings.length === 0 ? (
            <EmptyState compact title={t(dict, "provider.bookingsEmpty")} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t(dict, "booking.reference")}</TH>
                  <TH>{t(dict, "booking.steps.dates")}</TH>
                  <TH>{t(dict, "booking.bookingStatus")}</TH>
                  <TH>{t(dict, "booking.paymentStatus")}</TH>
                </tr>
              </THead>
              <tbody>
                {overview.upcomingBookings.map((row) => (
                  <TR key={row.id}>
                    <TD>
                      <Link
                        href={`/${locale}/provider/bookings/${row.id}`}
                        className="font-medium text-water-700 underline-offset-2 hover:underline"
                      >
                        {row.reference}
                      </Link>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {formatDate(row.startDate, locale)} – {formatDate(row.endDate, locale)}
                    </TD>
                    <TD>
                      <StatusBadge status={row.status} />
                    </TD>
                    <TD>
                      <StatusBadge status={row.paymentStatus} />
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>

      {/* Quick links */}
      <div className="flex flex-wrap gap-3">
        <ButtonLink href={`/${locale}/provider/bookings`} variant="secondary">
          {t(dict, "provider.bookings")}
        </ButtonLink>
        <ButtonLink href={`/${locale}/provider/services`} variant="secondary">
          {t(dict, "provider.addService")}
        </ButtonLink>
        <ButtonLink href={`/${locale}/provider/availability`} variant="secondary">
          {t(dict, "provider.availability")}
        </ButtonLink>
        <ButtonLink href={`/${locale}/provider/revenue`} variant="secondary">
          {t(dict, "provider.revenue")}
        </ButtonLink>
        <ButtonLink href={`/${locale}/provider/business`} variant="secondary">
          {t(dict, "provider.businessProfile")}
        </ButtonLink>
      </div>
    </div>
  );
}
