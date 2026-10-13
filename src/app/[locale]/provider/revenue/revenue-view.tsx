"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatMoney, formatNumber, defaultCurrency } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink, LoadingBlock } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/alert";
import { Stat, Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { useRequireAuth } from "@/components/auth/helpers";
import { ErrorAlert } from "@/components/provider/ui";
import type { ProviderRevenue } from "@/components/provider/types";

/**
 * Revenue — GET /api/v1/provider/revenue (owner-scoped aggregates of real
 * bookings). The endpoint returns amounts without a currency; the platform's
 * default currency (MAD) is used, matching the overview endpoint's own value.
 */
export function RevenueView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { ready } = useRequireAuth(locale);

  const [revenue, setRevenue] = useState<ProviderRevenue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<ProviderRevenue>("/api/v1/provider/revenue");
      setRevenue(res.data);
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
  if (error !== null || !revenue) {
    return <ErrorAlert dict={dict} error={error} onRetry={() => void load()} />;
  }

  const money = (amount: string) => formatMoney(amount, defaultCurrency, locale);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label={t(dict, "admin.metrics.revenue")}
          value={money(revenue.grossPaid)}
          tone="positive"
        />
        <Stat label={t(dict, "booking.paymentStatuses.REFUNDED")} value={money(revenue.refunded)} />
        <Stat label={t(dict, "provider.revenueTotal")} value={money(revenue.net)} />
        <Stat
          label={t(dict, "provider.metrics.bookings")}
          value={formatNumber(revenue.bookingsTotal, locale)}
        />
      </div>

      <p className="text-sm leading-relaxed text-rocky-600">
        {t(dict, "provider.revenueNote")}
      </p>

      <Card>
        <CardHeader title={t(dict, "provider.bookings")} description={t(dict, "booking.priceSummary")} />
        <CardBody>
          {revenue.byStatus.length === 0 ? (
            <EmptyState compact title={t(dict, "provider.bookingsEmpty")} />
          ) : (
            <Table>
              <THead>
                <tr>
                  <TH>{t(dict, "booking.bookingStatus")}</TH>
                  <TH align="end">{t(dict, "provider.metrics.bookings")}</TH>
                  <TH align="end">{t(dict, "booking.paymentStatuses.PAID")}</TH>
                  <TH align="end">{t(dict, "booking.paymentStatuses.REFUNDED")}</TH>
                </tr>
              </THead>
              <tbody>
                {revenue.byStatus.map((row) => (
                  <TR key={row.status}>
                    <TD>
                      <StatusBadge status={row.status} />
                    </TD>
                    <TD align="end" className="tabular-nums">
                      {formatNumber(row.count, locale)}
                    </TD>
                    <TD align="end" className="whitespace-nowrap font-medium tabular-nums">
                      {money(row.paid)}
                    </TD>
                    <TD align="end" className="whitespace-nowrap tabular-nums">
                      {money(row.refunded)}
                    </TD>
                  </TR>
                ))}
              </tbody>
            </Table>
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
