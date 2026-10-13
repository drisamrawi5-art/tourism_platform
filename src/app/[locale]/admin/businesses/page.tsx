"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type Business = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  verificationStatus: string;
  featured: boolean;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  owner: { id: string; email: string; name: string | null };
  bookableCount: number;
  bookingCount: number;
};

const TYPES = ["ACCOMMODATION", "GUIDE", "RESTAURANT", "TRANSPORT", "EXPERIENCE", "ACTIVITY", "EVENT", "PARTNER"] as const;
const STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export default function AdminBusinesses() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<Business[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), perPage: "20" });
      if (type) query.set("type", type);
      if (status) query.set("status", status);
      if (q) query.set("q", q);
      const res = await apiFetch<Business[]>(
        `/api/v1/admin/businesses?${query.toString()}`,
      );
      setItems(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, type, status, q]);

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
          value={type}
          onChange={(e) => { setType(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
        >
          <option value="">{t(dict, "admin.businessTypes.ACCOMMODATION")} — {t(dict, "common.all")}</option>
          {TYPES.map((tp) => (
            <option key={tp} value={tp}>{t(dict, `admin.businessTypes.${tp}`)}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
        >
          <option value="">{t(dict, "admin.status")} — {t(dict, "common.all")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-rocky-500">{t(dict, "common.noResults")}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t(dict, "admin.businesses")}</TH>
              <TH>{t(dict, "admin.provider")}</TH>
              <TH>{t(dict, "admin.status")}</TH>
              <TH>{t(dict, "admin.verification")}</TH>
              <TH>{t(dict, "admin.servicesCount")}</TH>
              <TH>{t(dict, "admin.bookings")}</TH>
            </TR>
          </THead>
          <tbody>
            {items.map((b) => (
              <TR key={b.id}>
                <TD>
                  <span className="font-medium text-rocky-900">{b.name}</span>
                  <span className="block text-xs text-rocky-500">{b.slug} · {b.type}</span>
                </TD>
                <TD>{b.owner.name ?? b.owner.email}</TD>
                <TD><StatusBadge status={b.status} /></TD>
                <TD>{b.verificationStatus}</TD>
                <TD className="tabular-nums">{b.bookableCount}</TD>
                <TD className="tabular-nums">{b.bookingCount}</TD>
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
