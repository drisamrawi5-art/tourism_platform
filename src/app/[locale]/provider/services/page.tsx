"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatMoney } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type Bookable = {
  id: string;
  slug: string;
  category: string;
  status: string;
  capacity: number;
  unit?: { name: string; description: string | null; capacity: number | null } | null;
  guideService?: { name: string; description: string | null } | null;
  prices: Array<{ id: string; unit: string; amount: string; currency: string; active: boolean }>;
};

export default function ProviderServices() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [items, setItems] = useState<Bookable[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const res = await apiFetch<Bookable[]>(
        `/api/v1/provider/bookables?page=${page}&perPage=20`,
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
      <EmptyState
        title={t(dict, "provider.noBusiness")}
        description={t(dict, "provider.noBusinessBody")}
        action={{ href: `/${locale}/provider/services/new`, label: t(dict, "provider.addService") }}
      />
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / 20));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-rocky-600">
          {t(dict, "provider.services")} · {total}
        </p>
        <ButtonLink href={`/${locale}/provider/services/new`}>{t(dict, "provider.addService")}</ButtonLink>
      </div>

      <Table>
        <THead>
          <TR>
            <TH>{t(dict, "provider.serviceName")}</TH>
            <TH>{t(dict, "provider.businessType")}</TH>
            <TH>{t(dict, "provider.price")}</TH>
            <TH>{t(dict, "admin.status")}</TH>
            <TH />
          </TR>
        </THead>
        <tbody>
          {items.map((b) => {
            const name = b.unit?.name ?? b.guideService?.name ?? b.slug;
            const price = b.prices.find((p) => p.active);
            return (
              <TR key={b.id}>
                <TD>
                  <Link
                    href={`/${locale}/provider/services/${b.id}`}
                    className="font-medium text-rocky-900 underline-offset-2 hover:underline"
                  >
                    {name}
                  </Link>
                </TD>
                <TD>{b.category}</TD>
                <TD>
                  {price ? (
                    <span className="tabular-nums">
                      {formatMoney(price.amount, price.currency as "MAD", locale)}
                      <span className="text-rocky-500"> / {t(dict, `provider.pricingUnits.${price.unit}`)}</span>
                    </span>
                  ) : (
                    "—"
                  )}
                </TD>
                <TD>
                  <StatusBadge status={b.status} />
                </TD>
                <TD align="end">
                  <Link
                    href={`/${locale}/provider/services/${b.id}`}
                    className="text-sm font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
                  >
                    {t(dict, "common.viewAll")}
                  </Link>
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
          <span className="text-rocky-600">
            {page} / {totalPages}
          </span>
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
