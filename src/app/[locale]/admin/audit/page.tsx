"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate } from "@/lib/currency";
import { Alert } from "@/components/ui/alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type AuditEntry = {
  id: string;
  action: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  metadata: Record<string, unknown> | null;
  ip: string | null;
  createdAt: string;
  actor: { email: string } | null;
};

export default function AdminAudit() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<AuditEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [action, setAction] = useState("");
  const [entityType, setEntityType] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), perPage: "30" });
      if (action) query.set("action", action);
      if (entityType) query.set("entityType", entityType);
      const res = await apiFetch<AuditEntry[]>(
        `/api/v1/admin/audit?${query.toString()}`,
      );
      setItems(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, action, entityType]);

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

  const totalPages = Math.max(1, Math.ceil(total / 30));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={action}
          onChange={(e) => { setAction(e.target.value); setPage(1); }}
          placeholder={t(dict, "admin.action")}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
        />
        <input
          type="search"
          value={entityType}
          onChange={(e) => { setEntityType(e.target.value); setPage(1); }}
          placeholder={t(dict, "admin.entityType")}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
        />
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-rocky-500">{t(dict, "common.noResults")}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t(dict, "admin.time")}</TH>
              <TH>{t(dict, "admin.action")}</TH>
              <TH>{t(dict, "admin.actor")}</TH>
              <TH>{t(dict, "admin.entity")}</TH>
              <TH>{t(dict, "admin.metadata")}</TH>
              <TH>{t(dict, "admin.ip")}</TH>
            </TR>
          </THead>
          <tbody>
            {items.map((a) => (
              <TR key={a.id}>
                <TD>{formatDate(a.createdAt, locale)}</TD>
                <TD>
                  <code className="text-xs">{a.action}</code>
                </TD>
                <TD>{a.actor?.email ?? "—"}</TD>
                <TD>
                  {a.entityType ? (
                    <span className="text-xs">
                      {a.entityType}:{a.entityId?.slice(0, 8) ?? "—"}
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>
                  {a.metadata ? (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-water-700">{t(dict, "admin.metadata")}</summary>
                      <pre className="mt-1 max-w-xs overflow-x-auto rounded bg-rocky-50 p-2 text-xs">
                        {JSON.stringify(a.metadata, null, 2)}
                      </pre>
                    </details>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>{a.ip ?? "—"}</TD>
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
