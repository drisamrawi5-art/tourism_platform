"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate, formatMoney } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type Booking = {
  id: string;
  reference: string;
  status: string;
  paymentStatus: string;
  startDate: string;
  endDate: string;
  guests: number;
  total: string;
  currency: string;
  createdAt: string;
  customer: { id: string; name: string | null; email: string; phone: string | null } | null;
  business: { id: string; name: string };
  items: Array<{
    bookable: { slug: string; category: string; unit: { name: string } | null; guideService: { name: string } | null };
  }>;
};

const STATUSES = ["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "REFUNDED"] as const;

export default function ProviderBookings() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<string>("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), perPage: "20" });
      if (status) query.set("status", status);
      const res = await apiFetch<Booking[]>(
        `/api/v1/provider/bookings?${query.toString()}`,
      );
      setItems(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, status]);

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

  if (loading) {
    return <div className="skeleton h-48 w-full" />;
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="text-sm text-rocky-600" htmlFor="statusFilter">
          {t(dict, "admin.status")}
        </label>
        <select
          id="statusFilter"
          value={status}
          onChange={(e) => {
            setStatus(e.target.value);
            setPage(1);
          }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
        >
          <option value="">{t(dict, "common.all")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-rocky-500">{t(dict, "provider.bookingsEmpty")}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t(dict, "admin.bookings")}</TH>
              <TH>{t(dict, "admin.customer")}</TH>
              <TH>{t(dict, "admin.createdAt")}</TH>
              <TH>{t(dict, "provider.price")}</TH>
              <TH>{t(dict, "admin.status")}</TH>
              <TH />
            </TR>
          </THead>
          <tbody>
            {items.map((b) => {
              const serviceName = b.items[0]?.bookable?.unit?.name ?? b.items[0]?.bookable?.guideService?.name ?? b.items[0]?.bookable?.slug ?? "—";
              return (
                <TR key={b.id}>
                  <TD>
                    <Link
                      href={`/${locale}/provider/bookings/${b.id}`}
                      className="font-medium text-rocky-900 underline-offset-2 hover:underline"
                    >
                      {b.reference}
                    </Link>
                    <span className="block text-xs text-rocky-500">{serviceName}</span>
                  </TD>
                  <TD>{b.customer?.name ?? b.customer?.email ?? "—"}</TD>
                  <TD>
                    {formatDate(b.startDate, locale)} → {formatDate(b.endDate, locale)}
                  </TD>
                  <TD className="tabular-nums">{formatMoney(b.total, b.currency as "MAD", locale)}</TD>
                  <TD>
                    <div className="flex flex-col gap-1">
                      <StatusBadge status={b.status} />
                      <StatusBadge status={b.paymentStatus} />
                    </div>
                  </TD>
                  <TD align="end">
                    <Link
                      href={`/${locale}/provider/bookings/${b.id}`}
                      className="text-sm font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
                    >
                      {t(dict, "common.viewAll")}
                    </Link>
                  </TD>
                </TR>
              );
            })}
          </tbody>
        </Table>
      )}

      {totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1}
            className="rounded-lg border border-rocky-300 px-3 py-1.5 disabled:opacity-40"
          >
            {t(dict, "common.previous")}
          </button>
          <span className="text-rocky-600">
            {page} / {totalPages}
          </span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages}
            className="rounded-lg border border-rocky-300 px-3 py-1.5 disabled:opacity-40"
          >
            {t(dict, "common.next")}
          </button>
        </div>
      ) : null}
    </div>
  );
}
