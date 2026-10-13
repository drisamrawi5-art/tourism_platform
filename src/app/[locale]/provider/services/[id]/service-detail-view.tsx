"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { notFound, useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink, LoadingBlock } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { fieldErrors, formError, useRequireAuth } from "@/components/auth/helpers";
import { ErrorAlert, categoryLabel } from "@/components/provider/ui";
import { bookableName, fetchAllBookables } from "@/components/provider/data";
import type {
  PricingUnitValue,
  ProviderBookable,
  ProviderBusiness,
  ProviderPrice,
} from "@/components/provider/types";

type PriceRow = {
  key: number;
  unit: PricingUnitValue;
  amount: string;
  validFrom: string;
  validTo: string;
  active: boolean;
  priority: number;
};

let priceRowSeq = 0;

function toRow(price: ProviderPrice): PriceRow {
  return {
    key: (priceRowSeq += 1),
    unit: price.unit,
    amount: String(price.amount),
    validFrom: price.validFrom ? price.validFrom.slice(0, 10) : "",
    validTo: price.validTo ? price.validTo.slice(0, 10) : "",
    active: price.active,
    priority: price.priority,
  };
}

/**
 * Service detail — edit (PATCH), publish/unpublish (PATCH status), price rows
 * (PUT /prices replaces the full set) and removal (DELETE).
 *
 * There is no GET /provider/bookables/[id], so the row is resolved by paging
 * the list endpoint; a missing row renders the not-found state.
 */
export function ProviderServiceDetailView({
  locale,
  bookableId,
}: {
  locale: Locale;
  bookableId: string;
}) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { ready } = useRequireAuth(locale);

  const [bookable, setBookable] = useState<ProviderBookable | null>(null);
  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [missing, setMissing] = useState(false);

  // Details form
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("1");
  const [editErrors, setEditErrors] = useState<Record<string, string | undefined>>({});
  const [editBanner, setEditBanner] = useState<string | null>(null);
  const [editSaved, setEditSaved] = useState(false);
  const [savingEdit, setSavingEdit] = useState(false);

  // Publication status
  const [pendingStatus, setPendingStatus] = useState<"DRAFT" | "PUBLISHED" | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Prices
  const [rows, setRows] = useState<PriceRow[]>([]);
  const [pricesError, setPricesError] = useState<string | null>(null);
  const [pricesSaved, setPricesSaved] = useState(false);
  const [savingPrices, setSavingPrices] = useState(false);

  // Delete
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    setMissing(false);
    try {
      const [list, businessRes, pricesRes] = await Promise.all([
        fetchAllBookables(),
        apiFetch<{ business: ProviderBusiness | null }>("/api/v1/provider/business"),
        apiFetch<{ prices: ProviderPrice[] }>(`/api/v1/provider/bookables/${bookableId}/prices`),
      ]);
      const found = list.find((b) => b.id === bookableId);
      if (!found) {
        setMissing(true);
        return;
      }
      const prices = pricesRes.data.prices ?? [];
      setBookable(found);
      setBusiness(businessRes.data.business);
      setRows(prices.map(toRow));
      setName(bookableName(found));
      setDescription(found.unit?.description ?? found.guideService?.description ?? "");
      setCapacity(String(found.capacity));
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 404) setMissing(true);
      else setError(err);
    } finally {
      setLoading(false);
    }
  }, [bookableId]);

  useEffect(() => {
    void load();
  }, [load]);

  const canPublish = business?.status === "PUBLISHED";

  async function changeStatus(next: "DRAFT" | "PUBLISHED") {
    if (!bookable || pendingStatus) return;
    setPendingStatus(next);
    setStatusError(null);
    setEditSaved(false);
    try {
      const res = await apiFetch<{ bookable: ProviderBookable }>(
        `/api/v1/provider/bookables/${bookable.id}`,
        { method: "PATCH", body: { status: next } },
      );
      const updated = res.data.bookable;
      setBookable((prev) => (prev ? { ...prev, ...updated } : prev));
    } catch (err) {
      setStatusError(formError(err, dict));
    } finally {
      setPendingStatus(null);
    }
  }

  async function onSaveDetails(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingEdit || !bookable) return;
    const errs: Record<string, string | undefined> = {};
    const capacityNum = Number(capacity);
    if (name.trim().length < 2) errs.name = t(dict, "common.required");
    if (
      !capacity.trim() ||
      !Number.isInteger(capacityNum) ||
      capacityNum < 1 ||
      capacityNum > 100
    ) {
      errs.capacity = t(dict, "common.error");
    }
    setEditErrors(errs);
    setEditBanner(null);
    setEditSaved(false);
    if (Object.values(errs).some(Boolean)) return;

    setSavingEdit(true);
    try {
      const res = await apiFetch<{ bookable: ProviderBookable }>(
        `/api/v1/provider/bookables/${bookable.id}`,
        {
          method: "PATCH",
          body: {
            name: name.trim(),
            description: description.trim() || null,
            capacity: capacityNum,
          },
        },
      );
      const updated = res.data.bookable;
      setBookable((prev) => (prev ? { ...prev, ...updated } : prev));
      setEditSaved(true);
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.details ?? {}).length > 0) {
        setEditErrors(fieldErrors(err));
      }
      setEditBanner(formError(err, dict));
    } finally {
      setSavingEdit(false);
    }
  }

  function updateRow(key: number, patch: Partial<PriceRow>) {
    setRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRow() {
    setRows((prev) => [
      ...prev,
      {
        key: (priceRowSeq += 1),
        unit: bookable?.category === "ACCOMMODATION" ? "NIGHT" : "PERSON",
        amount: "",
        validFrom: "",
        validTo: "",
        active: true,
        priority: 0,
      },
    ]);
  }

  function removeRow(key: number) {
    setRows((prev) => prev.filter((row) => row.key !== key));
  }

  async function onSavePrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingPrices || !bookable) return;
    setPricesError(null);
    setPricesSaved(false);

    if (rows.length === 0) {
      setPricesError(t(dict, "common.required"));
      return;
    }
    for (const row of rows) {
      const amountNum = Number(row.amount);
      if (!row.amount.trim()) {
        setPricesError(t(dict, "common.required"));
        return;
      }
      if (!Number.isFinite(amountNum) || amountNum <= 0) {
        setPricesError(t(dict, "common.error"));
        return;
      }
      if (row.validFrom && row.validTo && row.validFrom > row.validTo) {
        setPricesError(t(dict, "booking.endAfterStart"));
        return;
      }
    }

    setSavingPrices(true);
    try {
      await apiFetch(`/api/v1/provider/bookables/${bookable.id}/prices`, {
        method: "PUT",
        body: {
          prices: rows.map((row) => ({
            unit: row.unit,
            amount: Number(row.amount),
            validFrom: row.validFrom || null,
            validTo: row.validTo || null,
            priority: row.priority,
            active: row.active,
          })),
        },
      });
      const res = await apiFetch<{ prices: ProviderPrice[] }>(
        `/api/v1/provider/bookables/${bookable.id}/prices`,
      );
      const prices = res.data.prices ?? [];
      setRows(prices.map(toRow));
      setPricesSaved(true);
    } catch (err) {
      setPricesError(formError(err, dict));
    } finally {
      setSavingPrices(false);
    }
  }

  async function onRemove() {
    if (deleting || !bookable) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/v1/provider/bookables/${bookable.id}`, { method: "DELETE" });
      router.push(`/${locale}/provider/services`);
    } catch (err) {
      setDeleteError(formError(err, dict));
      setDeleting(false);
    }
  }

  if (!ready) return null;
  if (missing) notFound();
  if (loading) return <LoadingBlock text={t(dict, "common.loading")} />;
  if (error !== null) return <ErrorAlert dict={dict} error={error} onRetry={() => void load()} />;
  if (!bookable) return <LoadingBlock text={t(dict, "common.loading")} />;

  const rulesCount = bookable.availabilityRules?.length ?? 0;
  const blocksCount = bookable.availabilityBlocks?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Details + publication status */}
      <Card>
        <CardHeader
          title={bookableName(bookable)}
          description={categoryLabel(dict, bookable.category)}
          action={<StatusBadge status={bookable.status} />}
        />
        <CardBody className="space-y-5">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant={bookable.status === "DRAFT" ? "primary" : "secondary"}
                loading={pendingStatus === "DRAFT"}
                disabled={pendingStatus !== null || bookable.status === "DRAFT"}
                onClick={() => void changeStatus("DRAFT")}
              >
                {t(dict, "common.status.DRAFT")}
              </Button>
              <Button
                size="sm"
                variant={bookable.status === "PUBLISHED" ? "primary" : "secondary"}
                loading={pendingStatus === "PUBLISHED"}
                disabled={pendingStatus !== null || bookable.status === "PUBLISHED" || !canPublish}
                onClick={() => void changeStatus("PUBLISHED")}
              >
                {t(dict, "common.status.PUBLISHED")}
              </Button>
            </div>
            {!canPublish ? (
              <Alert tone="info" role="status">
                {t(dict, "provider.approvalPending")}
              </Alert>
            ) : null}
            {statusError ? (
              <Alert tone="danger" role="alert">
                {statusError}
              </Alert>
            ) : null}
          </div>

          {editSaved ? (
            <Alert tone="success" role="status">
              {t(dict, "account.saved")}
            </Alert>
          ) : null}
          {editBanner ? (
            <Alert tone="danger" role="alert">
              {editBanner}
            </Alert>
          ) : null}

          <form onSubmit={onSaveDetails} noValidate className="space-y-4">
            <Field
              label={t(dict, "provider.serviceName")}
              htmlFor="detail-name"
              required
              error={editErrors.name}
            >
              <Input
                id="detail-name"
                name="name"
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={savingEdit}
              />
            </Field>

            <Field
              label={t(dict, "provider.description")}
              htmlFor="detail-description"
              hint={t(dict, "common.optional")}
              error={editErrors.description}
            >
              <Textarea
                id="detail-description"
                name="description"
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={savingEdit}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "filters.capacity")}
                htmlFor="detail-capacity"
                required
                error={editErrors.capacity}
              >
                <Input
                  id="detail-capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  disabled={savingEdit}
                />
              </Field>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="submit" loading={savingEdit}>
                {t(dict, "account.saveChanges")}
              </Button>
              <Button
                type="button"
                variant="danger"
                loading={deleting}
                onClick={() => void onRemove()}
              >
                {t(dict, "account.remove")}
              </Button>
            </div>
            {deleteError ? (
              <Alert tone="danger" role="alert">
                {deleteError}
              </Alert>
            ) : null}
          </form>
        </CardBody>
      </Card>

      {/* Prices */}
      <Card>
        <CardHeader title={t(dict, "provider.pricing")} />
        <CardBody>
          <form onSubmit={onSavePrices} noValidate className="space-y-4">
            {pricesSaved ? (
              <Alert tone="success" role="status">
                {t(dict, "account.saved")}
              </Alert>
            ) : null}
            {pricesError ? (
              <Alert tone="danger" role="alert">
                {pricesError}
              </Alert>
            ) : null}

            {rows.length === 0 ? (
              <p className="text-sm text-rocky-600">{t(dict, "common.empty")}</p>
            ) : (
              <div className="space-y-4">
                {rows.map((row) => (
                  <div
                    key={row.key}
                    className="rounded-lg border border-rocky-200 bg-rocky-50/60 p-4"
                  >
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <Field
                        label={t(dict, "provider.pricingUnit")}
                        htmlFor={`price-unit-${row.key}`}
                      >
                        <Select
                          id={`price-unit-${row.key}`}
                          value={row.unit}
                          onChange={(e) =>
                            updateRow(row.key, { unit: e.target.value as PricingUnitValue })
                          }
                          disabled={savingPrices}
                        >
                          <option value="NIGHT">{t(dict, "provider.pricingUnits.NIGHT")}</option>
                          <option value="PERSON">{t(dict, "provider.pricingUnits.PERSON")}</option>
                          <option value="DAY">{t(dict, "provider.pricingUnits.DAY")}</option>
                          <option value="SERVICE">
                            {t(dict, "provider.pricingUnits.SERVICE")}
                          </option>
                        </Select>
                      </Field>

                      <Field label={t(dict, "provider.price")} htmlFor={`price-amount-${row.key}`}>
                        <Input
                          id={`price-amount-${row.key}`}
                          type="number"
                          min={0}
                          step="0.01"
                          inputMode="decimal"
                          value={row.amount}
                          onChange={(e) => updateRow(row.key, { amount: e.target.value })}
                          disabled={savingPrices}
                        />
                      </Field>

                      <Field
                        label={t(dict, "booking.startDate")}
                        htmlFor={`price-from-${row.key}`}
                        hint={t(dict, "common.optional")}
                      >
                        <Input
                          id={`price-from-${row.key}`}
                          type="date"
                          value={row.validFrom}
                          onChange={(e) => updateRow(row.key, { validFrom: e.target.value })}
                          disabled={savingPrices}
                        />
                      </Field>

                      <Field
                        label={t(dict, "booking.endDate")}
                        htmlFor={`price-to-${row.key}`}
                        hint={t(dict, "common.optional")}
                      >
                        <Input
                          id={`price-to-${row.key}`}
                          type="date"
                          value={row.validTo}
                          onChange={(e) => updateRow(row.key, { validTo: e.target.value })}
                          disabled={savingPrices}
                        />
                      </Field>
                    </div>

                    <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
                      <div className="w-full sm:w-44">
                        <Field
                          label={t(dict, "admin.flagEnabled")}
                          htmlFor={`price-active-${row.key}`}
                        >
                          <Select
                            id={`price-active-${row.key}`}
                            value={row.active ? "1" : "0"}
                            onChange={(e) => updateRow(row.key, { active: e.target.value === "1" })}
                            disabled={savingPrices}
                          >
                            <option value="1">{t(dict, "admin.flagEnabled")}</option>
                            <option value="0">{t(dict, "admin.flagDisabled")}</option>
                          </Select>
                        </Field>
                      </div>
                      <Button
                        type="button"
                        variant="danger"
                        size="sm"
                        onClick={() => removeRow(row.key)}
                        disabled={savingPrices}
                      >
                        {t(dict, "account.remove")}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              <Button type="button" variant="secondary" onClick={addRow} disabled={savingPrices}>
                <span aria-hidden="true">{"+"}</span>
                {t(dict, "provider.price")}
              </Button>
              <Button type="submit" loading={savingPrices}>
                {t(dict, "account.saveChanges")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      {/* Availability shortcut */}
      <Card>
        <CardHeader
          title={t(dict, "provider.availability")}
          description={`${t(dict, "provider.availabilityRule")}: ${rulesCount} · ${t(dict, "provider.blockDates")}: ${blocksCount}`}
        />
        <CardBody>
          <ButtonLink
            href={`/${locale}/provider/availability?bookable=${encodeURIComponent(bookable.id)}`}
            variant="secondary"
          >
            {t(dict, "provider.setAvailability")}
          </ButtonLink>
        </CardBody>
      </Card>

      <div className="flex justify-between gap-3">
        <ButtonLink href={`/${locale}/provider/services`} variant="ghost">
          {t(dict, "common.back")}
        </ButtonLink>
        <ButtonLink href={`/${locale}/provider`} variant="secondary">
          {t(dict, "provider.overview")}
        </ButtonLink>
      </div>
    </div>
  );
}
