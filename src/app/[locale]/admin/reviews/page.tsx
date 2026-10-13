"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { ApiClientError } from "@/lib/api/client";

type Review = {
  id: string;
  rating: number;
  comment: string | null;
  status: string;
  createdAt: string;
  customer: { name: string | null } | null;
  bookable: { slug: string; unit: { name: string } | null; guideService: { name: string } | null };
  booking: { reference: string } | null;
};

export default function AdminReviews() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<Review[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), perPage: "20" });
      if (status) query.set("status", status);
      const res = await apiFetch<Review[]>(
        `/api/v1/admin/reviews?${query.toString()}`,
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

  const moderate = async (reviewId: string, newStatus: "APPROVED" | "REJECTED") => {
    setBusyId(reviewId);
    setActionError(null);
    try {
      await apiFetch(`/api/v1/reviews/${reviewId}`, {
        method: "PATCH",
        body: { status: newStatus },
      });
      await load();
    } catch (err) {
      setActionError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setBusyId(null);
    }
  };

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

  if (items.length === 0) {
    return <p className="text-sm text-rocky-500">{t(dict, "admin.moderationEmpty")}</p>;
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      {actionError ? <Alert tone="danger" role="alert" title={t(dict, "common.error")}>{actionError}</Alert> : null}

      <div className="flex gap-3">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
          aria-label={t(dict, "admin.status")}
        >
          <option value="">{t(dict, "admin.status")} — {t(dict, "common.all")}</option>
          <option value="PENDING">PENDING</option>
          <option value="APPROVED">APPROVED</option>
          <option value="REJECTED">REJECTED</option>
        </select>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>{t(dict, "admin.customer")}</TH>
            <TH>{t(dict, "provider.serviceName")}</TH>
            <TH>{t(dict, "reviews.rating")}</TH>
            <TH>{t(dict, "admin.status")}</TH>
            <TH>{t(dict, "admin.createdAt")}</TH>
            <TH>{t(dict, "admin.actions")}</TH>
          </TR>
        </THead>
        <tbody>
          {items.map((r) => {
            const serviceName = r.bookable?.unit?.name ?? r.bookable?.guideService?.name ?? r.bookable?.slug ?? "—";
            return (
              <TR key={r.id}>
                <TD>{r.customer?.name ?? "—"}</TD>
                <TD>{serviceName}</TD>
                <TD>
                  <span className="text-peach-600" aria-label={t(dict, "reviews.stars", { n: r.rating })}>
                    {"★".repeat(r.rating)}
                    <span className="text-rocky-300">{"★".repeat(5 - r.rating)}</span>
                  </span>
                </TD>
                <TD><StatusBadge status={r.status} /></TD>
                <TD>{formatDate(r.createdAt, locale)}</TD>
                <TD>
                  {r.status === "PENDING" ? (
                    <div className="flex gap-2">
                      <Button onClick={() => moderate(r.id, "APPROVED")} disabled={busyId === r.id}>
                        {t(dict, "admin.approve")}
                      </Button>
                      <Button onClick={() => moderate(r.id, "REJECTED")} disabled={busyId === r.id} variant="secondary">
                        {t(dict, "admin.reject")}
                      </Button>
                    </div>
                  ) : null}
                </TD>
              </TR>
            );
          })}
        </tbody>
      </Table>

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
