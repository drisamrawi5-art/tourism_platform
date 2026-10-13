"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate, formatMoney } from "@/lib/currency";
import { LocalizedStatusBadge } from "@/components/ui/localized-status";
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
  customerName: string | null;
  customerEmail: string;
  business: { id: string; name: string; slug: string };
};

export default function AdminBookings() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<Booking[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), perPage: "20" });
      if (status) query.set("status", status);
      if (paymentStatus) query.set("paymentStatus", paymentStatus);
      if (q) query.set("q", q);
      const res = await apiFetch<Booking[]>(
        `/api/v1/admin/bookings?${query.toString()}`,
      );
      setItems(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, status, paymentStatus, q]);

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
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder={t(dict, "common.search")}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
        />
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
          aria-label={t(dict, "admin.status")}
        >
          <option value="">{t(dict, "admin.status")} — {t(dict, "common.all")}</option>
          {["PENDING", "CONFIRMED", "COMPLETED", "CANCELLED", "REFUNDED"].map((s) => (
            <option key={s} value={s}>{t(dict, `booking.statuses.${s}`)}</option>
          ))}
        </select>
        <select
          value={paymentStatus}
          onChange={(e) => { setPaymentStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
          aria-label={t(dict, "admin.payments")}
        >
          <option value="">{t(dict, "admin.payments")} — {t(dict, "common.all")}</option>
          {["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "FAILED"].map((s) => (
            <option key={s} value={s}>{t(dict, `booking.paymentStatuses.${s}`)}</option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-rocky-500">{t(dict, "common.noResults")}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t(dict, "admin.bookings")}</TH>
              <TH>{t(dict, "admin.customer")}</TH>
              <TH>{t(dict, "admin.businesses")}</TH>
              <TH>{t(dict, "admin.createdAt")}</TH>
              <TH>{t(dict, "provider.price")}</TH>
              <TH>{t(dict, "admin.status")}</TH>
            </TR>
          </THead>
          <tbody>
            {items.map((b) => (
              <TR key={b.id}>
                <TD>
                  <Link
                    href={`/${locale}/admin/bookings/${b.id}`}
                    className="font-medium text-forest-700 underline-offset-2 hover:underline"
                  >
                    {b.reference}
                  </Link>
                  <span className="block text-xs text-rocky-500">
                    {formatDate(b.startDate, locale)} → {formatDate(b.endDate, locale)}
                  </span>
                </TD>
                <TD>{b.customerName ?? b.customerEmail}</TD>
                <TD>{b.business.name}</TD>
                <TD>{formatDate(b.createdAt, locale)}</TD>
                <TD className="tabular-nums">{formatMoney(b.total, b.currency as "MAD", locale)}</TD>
                <TD>
                  <div className="flex flex-col gap-1">
                    <LocalizedStatusBadge status={b.status} dictKey="booking.statuses" />
                    <LocalizedStatusBadge status={b.paymentStatus} dictKey="booking.paymentStatuses" />
                  </div>
                </TD>
              </TR>
            ))}
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
          <span className="text-rocky-600">{page} / {totalPages}</span>
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
