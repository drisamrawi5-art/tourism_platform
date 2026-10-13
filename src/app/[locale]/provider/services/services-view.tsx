"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, qs } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { defaultCurrency, formatMoney, isCurrencyCode } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { useRequireAuth } from "@/components/auth/helpers";
import { SkeletonList } from "@/components/provider/skeleton";
import { LocalizedStatus } from "@/components/provider/status-badge";
import {
  bookableTitle,
  categoryLabel,
  providerErrorMessage,
  type ProviderBookable,
  type ProviderBusiness,
} from "@/components/provider/api";

/** Lowest active price of a bookable, formatted — null when none is active. */
function priceFrom(
  bookable: ProviderBookable,
  locale: Locale,
): string | null {
  const active = (bookable.prices ?? []).filter((price) => price.active);
  if (active.length === 0) return null;
  let lowest: number | null = null;
  for (const price of active) {
    const amount = Number(price.amount);
    if (Number.isFinite(amount) && (lowest === null || amount < lowest)) lowest = amount;
  }
  if (lowest === null) return null;
  const first = active[0];
  const currency = first && isCurrencyCode(first.currency) ? first.currency : defaultCurrency;
  return formatMoney(lowest, currency, locale);
}

export function ServicesView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { user, ready } = useRequireAuth(locale);

  const [bookables, setBookables] = useState<ProviderBookable[] | null>(null);
  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [servicesRes, businessRes] = await Promise.all([
        apiFetch<ProviderBookable[]>(
          `/api/v1/provider/bookables${qs({ page: 1, perPage: 100 })}`,
        ),
        apiFetch<{ business: ProviderBusiness | null }>("/api/v1/provider/business"),
      ]);
      setBookables(servicesRes.data ?? []);
      setBusiness(businessRes.data.business);
    } catch (err) {
      setBookables(null);
      setLoadError(providerErrorMessage(err, dict));
    }
  }, [dict]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  if (!ready || !user) return null;

  if (bookables === null) {
    return loadError !== null ? (
      <div className="space-y-4">
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {loadError}
        </Alert>
        <Button variant="secondary" onClick={() => void load()}>
          {t(dict, "common.retry")}
        </Button>
      </div>
    ) : (
      <SkeletonList label={t(dict, "common.loading")} rows={4} />
    );
  }

  const groups = new Map<string, ProviderBookable[]>();
  for (const bookable of bookables) {
    const existing = groups.get(bookable.businessId);
    if (existing) existing.push(bookable);
    else groups.set(bookable.businessId, [bookable]);
  }

  const newServiceHref =
    business !== null
      ? `/${locale}/provider/services/new`
      : `/${locale}/provider/businesses/new`;
  const newServiceLabel =
    business !== null ? t(dict, "provider.addService") : t(dict, "provider.createBusiness");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t(dict, "provider.services")}
          action={
            bookables.length === 0 && business === null ? null : (
              <ButtonLink href={newServiceHref}>{newServiceLabel}</ButtonLink>
            )
          }
        />
        <CardBody className="space-y-6">
          {bookables.length === 0 ? (
            <EmptyState
              title={t(dict, "provider.servicesEmpty")}
              description={
                business === null ? t(dict, "provider.noBusinessBody") : undefined
              }
              action={{ href: newServiceHref, label: newServiceLabel }}
            />
          ) : (
            [...groups.entries()].map(([businessId, items]) => {
              const heading =
                business !== null && business.id === businessId
                  ? business.name
                  : t(dict, "provider.businesses");
              return (
                <section key={businessId} className="space-y-2">
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-rocky-500">
                    {heading}
                  </h2>
                  <ul className="divide-y divide-rocky-100 rounded-lg border border-rocky-200">
                    {items.map((bookable) => {
                      const price = priceFrom(bookable, locale);
                      return (
                        <li
                          key={bookable.id}
                          className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3"
                        >
                          <Link
                            href={`/${locale}/provider/services/${bookable.id}`}
                            className="font-medium text-rocky-900 underline-offset-2 hover:underline"
                          >
                            {bookableTitle(bookable)}
                          </Link>
                          <Badge tone="outline">
                            {categoryLabel(dict, bookable.category)}
                          </Badge>
                          <LocalizedStatus dict={dict} status={bookable.status} />
                          <span className="text-sm text-rocky-600">
                            {t(dict, "filters.capacity")}: {bookable.capacity}
                          </span>
                          <span className="ms-auto text-sm font-medium tabular-nums text-rocky-900">
                            {price !== null ? t(dict, "stay.from", { price }) : "—"}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              );
            })
          )}
        </CardBody>
      </Card>
    </div>
  );
}
