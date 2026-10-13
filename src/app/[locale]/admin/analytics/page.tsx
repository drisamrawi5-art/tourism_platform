"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type AnalyticsData = {
  days: number;
  eventsByType: Array<{ type: string; count: number }>;
  topPaths: Array<{ path: string; count: number }>;
  dailyCounts: Array<{ date: string; count: number }>;
  funnel: {
    booking_started: number;
    booking_completed: number;
    payment_success: number;
    payment_failure: number;
  };
};

export default function AdminAnalytics() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [days, setDays] = useState("30");
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch<AnalyticsData>(`/api/v1/admin/analytics?days=${days}`);
      setData(res.data);
    } catch {
      setError(true);
    }
  }, [days]);

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

  const maxEventCount = Math.max(1, ...data.eventsByType.map((e) => e.count));
  const maxDaily = Math.max(1, ...data.dailyCounts.map((d) => d.count));
  const maxPath = Math.max(1, ...data.topPaths.map((p) => p.count));

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <label className="text-sm text-rocky-600" htmlFor="days">
          {t(dict, "admin.period")}
        </label>
        <select
          id="days"
          value={days}
          onChange={(e) => setDays(e.target.value)}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
        >
          <option value="7">7</option>
          <option value="30">30</option>
          <option value="90">90</option>
        </select>
      </div>

      <Card>
        <CardHeader title={t(dict, "admin.funnel")} />
        <CardBody>
          <div className="space-y-3">
            {(
              [
                ["booking_started", t(dict, "admin.events.bookingStarted")],
                ["booking_completed", t(dict, "admin.events.bookingCompleted")],
                ["payment_success", t(dict, "admin.events.paymentSuccess")],
                ["payment_failure", t(dict, "admin.events.paymentFailure")],
              ] as const
            ).map(([key, label]) => {
              const value = data.funnel[key];
              const pct = data.funnel.booking_started > 0 ? (value / data.funnel.booking_started) * 100 : 0;
              return (
                <div key={key}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-rocky-700">{label}</span>
                    <span className="tabular-nums font-medium">{value}</span>
                  </div>
                  <div className="h-2 rounded-full bg-rocky-100">
                    <div
                      className="h-2 rounded-full bg-forest-600"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader title={t(dict, "admin.eventsByType")} />
          <CardBody>
            <div className="space-y-2">
              {data.eventsByType.map((e) => (
                <div key={e.type}>
                  <div className="mb-1 flex justify-between text-sm">
                    <span className="text-rocky-700">{e.type}</span>
                    <span className="tabular-nums font-medium">{e.count}</span>
                  </div>
                  <div className="h-2 rounded-full bg-rocky-100">
                    <div
                      className="h-2 rounded-full bg-water-600"
                      style={{ width: `${(e.count / maxEventCount) * 100}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t(dict, "admin.topPaths")} />
          <CardBody>
            {data.topPaths.length === 0 ? (
              <p className="text-sm text-rocky-500">{t(dict, "common.noResults")}</p>
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{t(dict, "admin.path")}</TH>
                    <TH align="end">{t(dict, "admin.eventCount")}</TH>
                  </TR>
                </THead>
                <tbody>
                  {data.topPaths.map((p) => (
                    <TR key={p.path}>
                      <TD className="font-mono text-xs">{p.path}</TD>
                      <TD align="end" className="tabular-nums">{p.count}</TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title={t(dict, "admin.dailyCounts")} />
        <CardBody>
          {data.dailyCounts.length === 0 ? (
            <p className="text-sm text-rocky-500">{t(dict, "common.noResults")}</p>
          ) : (
            <div className="flex items-end gap-px" style={{ height: 120 }}>
              {data.dailyCounts.map((d) => (
                <div
                  key={d.date}
                  className="flex-1 bg-forest-600 rounded-t"
                  style={{ height: `${(d.count / maxDaily) * 100}%`, minHeight: 2 }}
                  title={`${d.date}: ${d.count}`}
                />
              ))}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
