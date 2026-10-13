"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { defaultLocale, type Locale } from "@/i18n/config";
import { Card, CardBody } from "@/components/ui/card";
import { Button, LoadingBlock } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { useRequireAuth } from "@/components/auth/helpers";

/**
 * Wishlist entries as serialized by GET /api/v1/wishlist. The payload is
 * normalized defensively: entries may carry a place, a business (or both)
 * with their type used to pick the right public detail route.
 */
type WishlistEntry = {
  id: string;
  target?: string | null;
  placeId?: string | null;
  businessId?: string | null;
  slug?: string | null;
  name?: unknown;
  place?: { slug?: string | null; name?: unknown } | null;
  business?: { slug?: string | null; name?: unknown; type?: string | null } | null;
};

type NormalizedItem = {
  key: string;
  deleteTarget: "place" | "accommodation" | "guide";
  id: string;
  title: string;
  href: string;
  typeLabel: string;
};

function localized(value: unknown, locale: Locale, fallback: string): string {
  if (typeof value === "string" && value.trim()) return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const picked = record[locale] ?? record[defaultLocale];
    if (typeof picked === "string" && picked.trim()) return picked;
  }
  return fallback;
}

function normalize(entry: WishlistEntry, locale: Locale, dict: ReturnType<typeof getDictionary>): NormalizedItem | null {
  const rawTarget = (entry.target ?? "").toUpperCase();
  const target =
    rawTarget === "PLACE" || rawTarget === "ACCOMMODATION" || rawTarget === "GUIDE"
      ? rawTarget
      : entry.place
        ? "PLACE"
        : entry.business?.type === "GUIDE"
          ? "GUIDE"
          : "ACCOMMODATION";

  const source = entry.place ?? entry.business;
  const slug = entry.slug ?? source?.slug ?? null;
  if (!slug) return null;

  const title = localized(entry.name ?? source?.name, locale, slug);
  const deleteTarget =
    target === "PLACE" ? "place" : target === "GUIDE" ? "guide" : "accommodation";
  const basePath =
    target === "PLACE" ? "places" : target === "GUIDE" ? "guides" : "stay";
  const typeLabel =
    target === "PLACE"
      ? t(dict, "search.categories.place")
      : target === "GUIDE"
        ? t(dict, "search.categories.guide")
        : t(dict, "search.categories.accommodation");

  return {
    key: entry.id,
    deleteTarget,
    id: target === "PLACE" ? (entry.placeId ?? entry.id) : (entry.businessId ?? entry.id),
    title,
    href: `/${locale}/${basePath}/${slug}`,
    typeLabel,
  };
}

export function WishlistView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { ready } = useRequireAuth(locale);
  const [items, setItems] = useState<NormalizedItem[] | null>(null);
  const [error, setError] = useState(false);
  const [removingKey, setRemovingKey] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch<WishlistEntry[]>("/api/v1/wishlist");
      const normalized = (res.data ?? [])
        .map((entry) => normalize(entry, locale, dict))
        .filter((item): item is NormalizedItem => item !== null);
      setItems(normalized);
    } catch {
      setError(true);
      setItems([]);
    }
  }, [locale, dict]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onRemove(item: NormalizedItem) {
    if (removingKey) return;
    setRemovingKey(item.key);
    setRemoveError(null);
    try {
      await apiFetch(
        `/api/v1/wishlist/${item.deleteTarget}/${encodeURIComponent(item.id)}`,
        { method: "DELETE" },
      );
      setItems((current) => (current ?? []).filter((entry) => entry.key !== item.key));
    } catch {
      setRemoveError(t(dict, "common.error"));
    } finally {
      setRemovingKey(null);
    }
  }

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-xl font-semibold text-rocky-900">
          {t(dict, "wishlist.title")}
        </h2>
      </div>

      {removeError ? (
        <Alert tone="danger" role="alert">
          {removeError}
        </Alert>
      ) : null}

      {items === null ? (
        <LoadingBlock text={t(dict, "common.loading")} />
      ) : error ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {t(dict, "errors.serverErrorBody")}
        </Alert>
      ) : items.length === 0 ? (
        <EmptyState
          title={t(dict, "account.wishlistEmpty")}
          description={t(dict, "account.wishlistEmptyBody")}
          action={{ href: `/${locale}/discover`, label: t(dict, "nav.discover") }}
        />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item) => (
            <li key={item.key}>
              <Card className="h-full">
                <CardBody className="flex h-full flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <Link
                      href={item.href}
                      className="font-medium text-rocky-900 underline-offset-2 hover:underline"
                    >
                      {item.title}
                    </Link>
                    <Badge tone="outline">{item.typeLabel}</Badge>
                  </div>
                  <div className="mt-auto flex gap-2">
                    <Link
                      href={item.href}
                      className="inline-flex h-9 items-center rounded-lg border border-rocky-300 px-3 text-sm font-medium text-rocky-700 transition-colors hover:bg-rocky-100"
                    >
                      {t(dict, "common.readMore")}
                    </Link>
                    <Button
                      variant="ghost"
                      size="sm"
                      loading={removingKey === item.key}
                      onClick={() => void onRemove(item)}
                    >
                      {t(dict, "account.remove")}
                    </Button>
                  </div>
                </CardBody>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
