"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { ButtonLink } from "@/components/ui/button";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type Place = {
  id: string;
  slug: string;
  typeLabel: string | null;
  status: string;
  featured: boolean;
  sortOrder: number;
  verificationStatus: string;
  lat: number | null;
  lng: number | null;
  translations: Array<{ locale: string; name: string; typeLabel: string | null; summary: string | null }>;
};

export default function AdminPlaces() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<Place[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page), perPage: "20" });
      if (status) query.set("status", status);
      const res = await apiFetch<Place[]>(
        `/api/v1/admin/places?${query.toString()}`,
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
      <div className="flex items-center justify-between">
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="h-9 rounded-lg border border-rocky-300 bg-white px-3 text-sm"
          aria-label={t(dict, "admin.status")}
        >
          <option value="">{t(dict, "admin.status")} — {t(dict, "common.all")}</option>
          {["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"].map((s) => (
            <option key={s} value={s}>{s}</option>
          ))}
        </select>
        <ButtonLink href={`/${locale}/admin/places/new`}>{t(dict, "admin.createPlace")}</ButtonLink>
      </div>

      {items.length === 0 ? (
        <p className="text-sm text-rocky-500">{t(dict, "common.noResults")}</p>
      ) : (
        <Table>
          <THead>
            <TR>
              <TH>{t(dict, "admin.places")}</TH>
              <TH>{t(dict, "admin.status")}</TH>
              <TH>{t(dict, "admin.verification")}</TH>
              <TH>{t(dict, "admin.featured")}</TH>
              <TH>{t(dict, "admin.actions")}</TH>
            </TR>
          </THead>
          <tbody>
            {items.map((p) => {
              const name = p.translations.find((tr) => tr.locale === locale)?.name ?? p.translations[0]?.name ?? p.slug;
              return (
                <TR key={p.id}>
                  <TD>
                    <span className="font-medium text-rocky-900">{name}</span>
                    <span className="block text-xs text-rocky-500">{p.slug}{p.typeLabel ? ` · ${p.typeLabel}` : ""}</span>
                  </TD>
                  <TD><StatusBadge status={p.status} /></TD>
                  <TD>{p.verificationStatus}</TD>
                  <TD>{p.featured ? "✓" : "—"}</TD>
                  <TD>
                    <div className="flex gap-2">
                      <Link
                        href={`/${locale}/admin/places/${p.id}`}
                        className="text-sm font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
                      >
                        {t(dict, "admin.edit")}
                      </Link>
                      {p.lat != null && p.lng != null ? (
                        <a
                          href={`https://www.openstreetmap.org/?mlat=${p.lat}&mlon=${p.lng}#map=13/${p.lat}/${p.lng}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-sm font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
                        >
                          {t(dict, "map.openMap")}
                        </a>
                      ) : null}
                    </div>
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
