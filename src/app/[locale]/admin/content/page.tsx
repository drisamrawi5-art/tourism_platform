"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate } from "@/lib/currency";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type Content = {
  id: string;
  slug: string;
  kind: string;
  status: string;
  featured: boolean;
  sortOrder: number;
  noIndex: boolean;
  verificationStatus: string;
  publishedAt: string | null;
  createdAt: string;
  author: { id: string; name: string | null; email: string } | null;
  translations: Array<{ locale: string; title: string; summary: string | null; body: string | null }>;
};

const KINDS = ["PLACE", "DESTINATION", "STORY", "GUIDE", "ACCOMMODATION", "EDITORIAL", "EXPERIENCE", "EVENT", "RESTAURANT", "TRAVEL_GUIDE"] as const;
const STATUSES = ["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"] as const;

export default function AdminContent() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<Content[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), perPage: "20" });
      if (kind) query.set("kind", kind);
      if (status) query.set("status", status);
      const res = await apiFetch<Content[]>(
        `/api/v1/admin/content?${query.toString()}`,
      );
      setItems(res.data ?? []);
      setTotal(res.pagination?.total ?? 0);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, [page, kind, status]);

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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-3">
          <select
            value={kind}
            onChange={(e) => { setKind(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
            aria-label={t(dict, "admin.kind")}
          >
            <option value="">{t(dict, "admin.kind")} — {t(dict, "common.all")}</option>
            {KINDS.map((k) => (
              <option key={k} value={k}>{t(dict, `admin.contentKinds.${k}`)}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
            aria-label={t(dict, "admin.status")}
          >
            <option value="">{t(dict, "admin.status")} — {t(dict, "common.all")}</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
        <ButtonLink href={`/${locale}/admin/content/new`}>{t(dict, "admin.createContent")}</ButtonLink>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-rocky-500">{t(dict, "common.noResults")}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t(dict, "admin.content")}</TH>
              <TH>{t(dict, "admin.kind")}</TH>
              <TH>{t(dict, "admin.status")}</TH>
              <TH>{t(dict, "admin.publishedAt")}</TH>
              <TH>{t(dict, "admin.actions")}</TH>
            </TR>
          </THead>
          <tbody>
            {items.map((c) => {
              const title = c.translations.find((tr) => tr.locale === locale)?.title ?? c.translations[0]?.title ?? c.slug;
              return (
                <TR key={c.id}>
                  <TD>
                    <span className="font-medium text-rocky-900">{title}</span>
                    <span className="block text-xs text-rocky-500">{c.slug}</span>
                  </TD>
                  <TD>{t(dict, `admin.contentKinds.${c.kind}`)}</TD>
                  <TD><StatusBadge status={c.status} /></TD>
                  <TD>{c.publishedAt ? formatDate(c.publishedAt, locale) : "—"}</TD>
                  <TD>
                    <Link
                      href={`/${locale}/admin/content/${c.id}`}
                      className="text-sm font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
                    >
                      {t(dict, "admin.edit")}
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
