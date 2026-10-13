"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate, formatMoney } from "@/lib/currency";
import { LocalizedStatusBadge } from "@/components/ui/localized-status";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type Payment = {
  id: string;
  bookingId: string;
  provider: string;
  mode: string;
  status: string;
  amount: string;
  currency: string;
  failureReason: string | null;
  paidAt: string | null;
  failedAt: string | null;
  createdAt: string;
  booking: { id: string; reference: string };
};

export default function AdminPayments() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<Payment[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [provider, setProvider] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<{ provider: string; configured: boolean } | null>(null);

  // Payment provider configuration (independent of the list fetch — a list
  // error must not hide the configuration notice and vice versa).
  useEffect(() => {
    void apiFetch<{ provider: string; configured: boolean }>(
      "/api/v1/admin/payments/status",
    )
      .then((res) => setConfig(res.data))
      .catch(() => setConfig(null));
  }, []);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), perPage: "20" });
      if (status) query.set("status", status);
      if (provider) query.set("provider", provider);
      const res = await apiFetch<Payment[]>(
        `/api/v1/admin/payments?${query.toString()}`,
      );
      setItems(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, status, provider]);

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
      {config && !config.configured ? (
        <Alert tone="warning" role="status" title={t(dict, "payment.notConfigured")}>
          {t(dict, "payment.notConfiguredBody")}
        </Alert>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
          aria-label={t(dict, "admin.status")}
        >
          <option value="">{t(dict, "admin.status")} — {t(dict, "common.all")}</option>
          {["UNPAID", "PARTIALLY_PAID", "PAID", "REFUNDED", "FAILED"].map((s) => (
            <option key={s} value={s}>{t(dict, `booking.paymentStatuses.${s}`)}</option>
          ))}
        </select>
        <select
          value={provider}
          onChange={(e) => { setProvider(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
          aria-label={t(dict, "admin.provider")}
        >
          <option value="">{t(dict, "admin.provider")} — {t(dict, "common.all")}</option>
          <option value="none">none</option>
          <option value="mock">mock</option>
        </select>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-rocky-500">{t(dict, "common.noResults")}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t(dict, "admin.payments")}</TH>
              <TH>{t(dict, "admin.bookings")}</TH>
              <TH>{t(dict, "admin.provider")}</TH>
              <TH>{t(dict, "admin.mode")}</TH>
              <TH>{t(dict, "provider.price")}</TH>
              <TH>{t(dict, "admin.status")}</TH>
              <TH>{t(dict, "admin.paidAt")}</TH>
            </TR>
          </THead>
          <tbody>
            {items.map((p) => (
              <TR key={p.id}>
                <TD>
                  <span className="font-medium text-rocky-900">{p.id.slice(0, 8)}</span>
                  <span className="block text-xs text-rocky-500">{formatDate(p.createdAt, locale)}</span>
                </TD>
                <TD>{p.booking.reference}</TD>
                <TD>{p.provider}</TD>
                <TD>{p.mode}</TD>
                <TD className="tabular-nums">{formatMoney(p.amount, p.currency as "MAD", locale)}</TD>
                <TD>
                  <div className="flex flex-col gap-1">
                    <LocalizedStatusBadge status={p.status} dictKey="booking.paymentStatuses" />
                    {p.failureReason ? (
                      <span className="text-xs text-danger-600">{p.failureReason}</span>
                    ) : null}
                  </div>
                </TD>
                <TD>{p.paidAt ? formatDate(p.paidAt, locale) : "—"}</TD>
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
