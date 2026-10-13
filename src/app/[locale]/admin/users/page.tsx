"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate } from "@/lib/currency";
import { LocalizedStatusBadge } from "@/components/ui/localized-status";
import { Alert } from "@/components/ui/alert";
import { ConfirmAction } from "@/components/admin/confirm";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type User = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  status: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  businessCount: number;
};

const ROLES = ["SUPER_ADMIN", "ADMIN", "CONTENT_MANAGER", "BUSINESS_OWNER", "GUIDE", "CUSTOMER"] as const;
const STATUSES = ["ACTIVE", "SUSPENDED", "DELETED"] as const;

export default function AdminUsers() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<User[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [q, setQ] = useState("");
  const [role, setRole] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionOk, setActionOk] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), perPage: "20" });
      if (q) query.set("q", q);
      if (role) query.set("role", role);
      if (status) query.set("status", status);
      const res = await apiFetch<User[]>(
        `/api/v1/admin/users?${query.toString()}`,
      );
      setItems(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, q, role, status]);

  useEffect(() => {
    void load();
  }, [load]);

  // A role change grants or removes privileges — the select arms a confirm
  // step instead of firing the PATCH on a single stray click.
  const [pendingRole, setPendingRole] = useState<{ userId: string; role: string } | null>(null);

  const changeRole = async (userId: string, newRole: string) => {
    setPendingRole(null);
    setBusyId(userId);
    setActionError(null);
    setActionOk(null);
    try {
      await apiFetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        body: { role: newRole },
      });
      setActionOk(t(dict, "admin.settingsSaved"));
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setBusyId(null);
    }
  };

  const changeStatus = async (userId: string, newStatus: string) => {
    setBusyId(userId);
    setActionError(null);
    setActionOk(null);
    try {
      await apiFetch(`/api/v1/admin/users/${userId}`, {
        method: "PATCH",
        body: { status: newStatus },
      });
      setActionOk(t(dict, "admin.settingsSaved"));
      await load();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : t(dict, "errors.serverErrorBody"));
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
      {actionOk ? <Alert tone="success" role="status">{actionOk}</Alert> : null}
      {actionError ? <Alert tone="danger" role="alert" title={t(dict, "common.error")}>{actionError}</Alert> : null}

      <div className="flex flex-wrap gap-3">
        <input
          type="search"
          value={q}
          onChange={(e) => { setQ(e.target.value); setPage(1); }}
          placeholder={t(dict, "common.search")}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
        />
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
        >
          <option value="">{t(dict, "admin.role")} — {t(dict, "common.all")}</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>{t(dict, `admin.roles.${r}`)}</option>
          ))}
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
        >
          <option value="">{t(dict, "admin.status")} — {t(dict, "common.all")}</option>
          {STATUSES.map((s) => (
            <option key={s} value={s}>{t(dict, `admin.userStatuses.${s}`)}</option>
          ))}
        </select>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-rocky-500">{t(dict, "common.noResults")}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t(dict, "common.email")}</TH>
              <TH>{t(dict, "admin.role")}</TH>
              <TH>{t(dict, "admin.status")}</TH>
              <TH>{t(dict, "admin.businessesCount")}</TH>
              <TH>{t(dict, "admin.createdAt")}</TH>
            </TR>
          </THead>
          <tbody>
            {items.map((u) => (
              <TR key={u.id}>
                <TD>
                  <span className="font-medium text-rocky-900">{u.email}</span>
                  {u.name ? <span className="block text-xs text-rocky-500">{u.name}</span> : null}
                </TD>
                <TD>
                  {pendingRole?.userId === u.id ? (
                    <div className="flex items-center gap-1">
                      <ConfirmAction
                        label={t(dict, `admin.roles.${pendingRole.role}`)}
                        confirmLabel={t(dict, "admin.confirm")}
                        cancelLabel={t(dict, "common.cancel")}
                        onConfirm={() => void changeRole(u.id, pendingRole.role)}
                        variant="primary"
                        busy={busyId === u.id}
                      />
                    </div>
                  ) : (
                    <select
                      value={u.role}
                      onChange={(e) => setPendingRole({ userId: u.id, role: e.target.value })}
                      disabled={busyId === u.id}
                      className="h-8 rounded border border-rocky-300 bg-white px-2 text-xs"
                      aria-label={t(dict, "admin.role")}
                    >
                      {ROLES.map((r) => (
                        <option key={r} value={r}>{t(dict, `admin.roles.${r}`)}</option>
                      ))}
                    </select>
                  )}
                </TD>
                <TD>
                  <div className="flex items-center gap-2">
                    <LocalizedStatusBadge status={u.status} dictKey="admin.userStatuses" />
                    {u.status === "ACTIVE" ? (
                      <ConfirmAction
                        label={t(dict, "admin.userStatuses.SUSPENDED")}
                        confirmLabel={t(dict, "admin.confirm")}
                        cancelLabel={t(dict, "common.cancel")}
                        onConfirm={() => void changeStatus(u.id, "SUSPENDED")}
                        busy={busyId === u.id}
                      />
                    ) : null}
                  </div>
                </TD>
                <TD className="tabular-nums">{u.businessCount}</TD>
                <TD>{formatDate(u.createdAt, locale)}</TD>
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
