"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatMoney } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Stat } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type RevenueData = {
  bookingsTotal: number;
  byStatus: Array<{ status: string; count: number; paid: string; refunded: string }>;
  bookingsLast30: number;
  grossPaid: string;
  refunded: string;
  net: string;
};

export default function ProviderRevenue() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [data, setData] = useState<RevenueData | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch<RevenueData>("/api/v1/provider/revenue");
      setData(res.data);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
        {t(dict, "errors.serverErrorBody")}
      </Alert>
    );
  }

  if (!data) {
    return <div className="skeleton h-48 w-full" />;
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label={t(dict, "provider.metrics.bookings")} value={String(data.bookingsTotal)} />
        <Stat label={t(dict, "provider.revenue")} value={formatMoney(data.grossPaid, "MAD", locale)} />
        <Stat label={t(dict, "admin.metrics.revenue")} value={`−${formatMoney(data.refunded, "MAD", locale)}`} tone="danger" />
        <Stat label={t(dict, "provider.revenueTotal")} value={formatMoney(data.net, "MAD", locale)} tone="positive" />
      </div>

      <Card>
        <CardHeader title={t(dict, "provider.revenue")} description={t(dict, "provider.revenueNote")} />
        <CardBody>
          <Table>
            <THead>
              <TR>
                <TH>{t(dict, "admin.status")}</TH>
                <TH>{t(dict, "provider.metrics.bookings")}</TH>
                <TH>{t(dict, "provider.revenue")}</TH>
                <TH>{t(dict, "admin.metrics.revenue")}</TH>
              </TR>
            </THead>
            <tbody>
              {data.byStatus.map((row) => (
                <TR key={row.status}>
                  <TD>
                    <StatusBadge status={row.status} />
                  </TD>
                  <TD className="tabular-nums">{row.count}</TD>
                  <TD className="tabular-nums">{formatMoney(row.paid, "MAD", locale)}</TD>
                  <TD className="tabular-nums text-danger-600">
                    {Number(row.refunded) > 0 ? `−${formatMoney(row.refunded, "MAD", locale)}` : "—"}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>
        </CardBody>
      </Card>
    </div>
  );
}
