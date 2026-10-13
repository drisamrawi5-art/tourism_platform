"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type ApprovalItem = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  submittedAt: string | null;
  createdAt: string;
  owner: { id: string; email: string; name: string | null };
  bookableCount: number;
};

export default function AdminApprovals() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<ApprovalItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const res = await apiFetch<ApprovalItem[]>(
        `/api/v1/admin/approvals?page=${page}&perPage=20`,
      );
      setItems(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (businessId: string, action: "approve" | "reject" | "publish" | "unpublish", reason?: string) => {
    setBusy(true);
    setActionError(null);
    setActionOk(null);
    try {
      await apiFetch("/api/v1/admin/approvals", {
        method: "POST",
        body: { businessId, action, reason },
      });
      setActionOk(t(dict, action === "approve" ? "admin.approveSuccess" : action === "reject" ? "admin.rejectSuccess" : "admin.settingsSaved"));
      setRejectingId(null);
      setRejectReason("");
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setBusy(false);
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
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-rocky-500">{t(dict, "admin.approvalsEmpty")}</p>
        </CardBody>
      </Card>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      {actionOk ? (
        <Alert tone="success" role="status">{actionOk}</Alert>
      ) : null}
      {actionError ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>{actionError}</Alert>
      ) : null}

      <Table>
        <THead>
          <TR>
            <TH>{t(dict, "admin.businesses")}</TH>
            <TH>{t(dict, "admin.provider")}</TH>
            <TH>{t(dict, "admin.submittedAt")}</TH>
            <TH>{t(dict, "admin.servicesCount")}</TH>
            <TH>{t(dict, "admin.actions")}</TH>
          </TR>
        </THead>
        <tbody>
          {items.map((item) => (
            <TR key={item.id}>
              <TD>
                <span className="font-medium text-rocky-900">{item.name}</span>
                <span className="block text-xs text-rocky-500">{item.slug} · {item.type}</span>
              </TD>
              <TD>{item.owner.name ?? item.owner.email}</TD>
              <TD>{item.submittedAt ? formatDate(item.submittedAt, locale) : "—"}</TD>
              <TD className="tabular-nums">{item.bookableCount}</TD>
              <TD>
                {rejectingId === item.id ? (
                  <div className="space-y-2">
                    <textarea
                      value={rejectReason}
                      onChange={(e) => setRejectReason(e.target.value)}
                      placeholder={t(dict, "admin.rejectionReason")}
                      className="h-16 w-full rounded-lg border border-rocky-300 px-3 py-2 text-sm"
                      maxLength={1000}
                    />
                    <div className="flex gap-2">
                      <Button
                        onClick={() => act(item.id, "reject", rejectReason || undefined)}
                        disabled={busy}
                        variant="danger"
                      >
                        {t(dict, "admin.reject")}
                      </Button>
                      <Button onClick={() => { setRejectingId(null); setRejectReason(""); }} variant="ghost" disabled={busy}>
                        {t(dict, "common.cancel")}
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    <Button onClick={() => act(item.id, "approve")} disabled={busy}>
                      {t(dict, "admin.approve")}
                    </Button>
                    <Button onClick={() => setRejectingId(item.id)} disabled={busy} variant="secondary">
                      {t(dict, "admin.reject")}
                    </Button>
                  </div>
                )}
              </TD>
            </TR>
          ))}
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
