"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate } from "@/lib/currency";
import { LocalizedStatusBadge } from "@/components/ui/localized-status";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { ApiClientError } from "@/lib/api/client";

type Media = {
  id: string;
  storageKey: string;
  alt: string;
  caption: string | null;
  mimeType: string;
  sizeBytes: number;
  kind: string;
  status: string;
  verificationStatus: string;
  uploadedById: string | null;
  placeId: string | null;
  businessId: string | null;
  contentId: string | null;
  createdAt: string;
  uploader: { name: string | null; email: string } | null;
};

export default function AdminMedia() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<Media[]>([]);
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
      const res = await apiFetch<Media[]>(
        `/api/v1/admin/media?${query.toString()}`,
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

  const moderate = async (mediaId: string, newStatus: string) => {
    setBusyId(mediaId);
    setActionError(null);
    try {
      await apiFetch(`/api/v1/admin/media/${mediaId}`, {
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
          <option value="PENDING_REVIEW">{t(dict, "common.status.PENDING_REVIEW")}</option>
          <option value="APPROVED">{t(dict, "common.status.APPROVED")}</option>
          <option value="PUBLISHED">{t(dict, "common.status.PUBLISHED")}</option>
          <option value="REJECTED">{t(dict, "common.status.REJECTED")}</option>
        </select>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-rocky-500">{t(dict, "common.noResults")}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t(dict, "admin.media")}</TH>
              <TH>{t(dict, "admin.altText")}</TH>
              <TH>{t(dict, "admin.mimeType")}</TH>
              <TH>{t(dict, "admin.size")}</TH>
              <TH>{t(dict, "admin.status")}</TH>
              <TH>{t(dict, "admin.actions")}</TH>
            </TR>
          </THead>
          <tbody>
            {items.map((m) => (
              <TR key={m.id}>
                <TD>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={`/api/v1/media/file/${m.storageKey}`}
                    alt={m.alt}
                    className="h-12 w-16 rounded object-cover"
                  />
                </TD>
                <TD>{m.alt}</TD>
                <TD>{m.mimeType}</TD>
                <TD>{(m.sizeBytes / 1024).toFixed(1)} KB</TD>
                <TD><LocalizedStatusBadge status={m.status} dictKey="common.status" /></TD>
                <TD>
                  {m.status === "PENDING_REVIEW" ? (
                    <div className="flex gap-2">
                      <Button onClick={() => moderate(m.id, "APPROVED")} disabled={busyId === m.id}>
                        {t(dict, "admin.approve")}
                      </Button>
                      <Button onClick={() => moderate(m.id, "REJECTED")} disabled={busyId === m.id} variant="secondary">
                        {t(dict, "admin.reject")}
                      </Button>
                    </div>
                  ) : null}
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
