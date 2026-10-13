"use client";

import { useEffect, useState, type FormEvent } from "react";
import { notFound, useRouter } from "next/navigation";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { formatDate } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useAdminFetch, adminError } from "@/components/admin/use-admin";
import { CardSkeleton } from "@/components/admin/skeleton";
import { ConfirmAction } from "@/components/admin/confirm";
import { Checkbox } from "@/components/admin/fields";
import { VERIFICATION_STATUSES } from "@/components/admin/enums";
import { statusLabel, verificationLabel } from "@/components/admin/labels";

type Locale3 = "en" | "fr" | "ar";

type PlaceTranslation = {
  id: string;
  locale: string;
  name: string;
  typeLabel: string | null;
  summary: string | null;
};

type PlaceDetail = {
  id: string;
  slug: string;
  typeLabel: string | null;
  status: string;
  verificationStatus: string;
  lat: number | null;
  lng: number | null;
  noIndex: boolean;
  featured: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
  translations: PlaceTranslation[];
};

type TranslationDraft = { name: string; typeLabel: string; summary: string };

type WorkflowAction = "submit" | "approve" | "reject" | "publish" | "unpublish";

/** Mirrors POST /api/v1/admin/places/[id]/workflow (409 on invalid moves). */
const WORKFLOW: ReadonlyArray<{
  action: WorkflowAction;
  from: readonly string[];
  hintFrom: string;
  labelKey: string;
  confirm: boolean;
  successKey: string;
}> = [
  {
    action: "submit",
    from: ["DRAFT", "REJECTED"],
    hintFrom: "DRAFT",
    labelKey: "provider.submitForReview",
    confirm: false,
    successKey: "provider.submitted",
  },
  {
    action: "approve",
    from: ["PENDING_REVIEW"],
    hintFrom: "PENDING_REVIEW",
    labelKey: "admin.approve",
    confirm: false,
    successKey: "admin.approveSuccess",
  },
  {
    action: "reject",
    from: ["PENDING_REVIEW"],
    hintFrom: "PENDING_REVIEW",
    labelKey: "admin.reject",
    confirm: true,
    successKey: "admin.rejectSuccess",
  },
  {
    action: "publish",
    from: ["APPROVED"],
    hintFrom: "APPROVED",
    labelKey: "admin.publish",
    confirm: false,
    successKey: "common.published",
  },
  {
    action: "unpublish",
    from: ["PUBLISHED"],
    hintFrom: "PUBLISHED",
    labelKey: "admin.unpublish",
    confirm: true,
    successKey: "admin.unpublishSuccess",
  },
];

const EMPTY_DRAFT: TranslationDraft = { name: "", typeLabel: "", summary: "" };

export function PlaceDetailView({ locale, placeId }: { locale: Locale; placeId: string }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { data, loading, error, reload } = useAdminFetch<PlaceDetail>(
    `/api/v1/admin/places/${placeId}`,
  );

  const [missing, setMissing] = useState(false);
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [busy, setBusy] = useState(false);

  const [typeLabel, setTypeLabel] = useState("");
  const [verification, setVerification] = useState("");
  const [featured, setFeatured] = useState(false);
  const [noIndex, setNoIndex] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [drafts, setDrafts] = useState<Record<Locale3, TranslationDraft>>({
    en: EMPTY_DRAFT,
    fr: EMPTY_DRAFT,
    ar: EMPTY_DRAFT,
  });
  const [deleteInput, setDeleteInput] = useState("");

  useEffect(() => {
    if (!data) return;
    setTypeLabel(data.typeLabel ?? "");
    setVerification(data.verificationStatus);
    setFeatured(data.featured);
    setNoIndex(data.noIndex);
    setSortOrder(String(data.sortOrder));
    setLat(data.lat === null ? "" : String(data.lat));
    setLng(data.lng === null ? "" : String(data.lng));
    const next: Record<Locale3, TranslationDraft> = {
      en: EMPTY_DRAFT,
      fr: EMPTY_DRAFT,
      ar: EMPTY_DRAFT,
    };
    for (const entry of data.translations) {
      if (entry.locale === "en" || entry.locale === "fr" || entry.locale === "ar") {
        next[entry.locale] = {
          name: entry.name,
          typeLabel: entry.typeLabel ?? "",
          summary: entry.summary ?? "",
        };
      }
    }
    setDrafts(next);
    setDeleteInput("");
  }, [data]);

  useEffect(() => {
    if (error instanceof ApiClientError && error.status === 404) setMissing(true);
  }, [error]);

  async function patch(body: Record<string, unknown>, successText?: string) {
    if (busy || !data) return false;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/places/${placeId}`, { method: "PATCH", body });
      setMessage({ tone: "success", text: successText ?? t(dict, "account.saved") });
      reload();
      return true;
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrors((prev) => ({ ...prev, ...err.fieldErrors() }));
      }
      setMessage({ tone: "danger", text: adminError(err, dict) });
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function onCoreSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const order = sortOrder.trim() === "" ? 0 : Number.parseInt(sortOrder, 10);
    if (!Number.isInteger(order)) {
      setErrors({ sortOrder: t(dict, "common.required") });
      return;
    }
    setErrors({});
    await patch({
      typeLabel: typeLabel.trim() ? typeLabel.trim() : null,
      verificationStatus: verification,
      featured,
      noIndex,
      sortOrder: order,
    });
  }

  async function onTranslationsSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!drafts.en.name.trim()) {
      setErrors({ "translations.en.name": t(dict, "common.required") });
      return;
    }
    setErrors({});
    const payload: Record<string, TranslationDraft> = {};
    for (const code of ["en", "fr", "ar"] as const) {
      const draft = drafts[code];
      if (code === "en" || draft.name.trim()) payload[code] = draft;
    }
    const translations: Record<string, { name: string; typeLabel?: string; summary?: string }> = {};
    for (const [code, draft] of Object.entries(payload)) {
      translations[code] = {
        name: draft.name.trim(),
        ...(draft.typeLabel.trim() ? { typeLabel: draft.typeLabel.trim() } : {}),
        ...(draft.summary.trim() ? { summary: draft.summary.trim() } : {}),
      };
    }
    await patch({ translations });
  }

  async function onCoordinatesSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const latText = lat.trim();
    const lngText = lng.trim();
    const nextErrors: Record<string, string | undefined> = {};

    if (latText === "" && lngText === "") {
      setErrors({});
      await patch({ lat: null, lng: null });
      return;
    }
    if (latText === "" || lngText === "") {
      if (latText === "") nextErrors.lat = t(dict, "common.required");
      if (lngText === "") nextErrors.lng = t(dict, "common.required");
      setErrors(nextErrors);
      return;
    }
    const la = Number(latText);
    const lo = Number(lngText);
    if (!Number.isFinite(la) || la < -90 || la > 90) nextErrors.lat = t(dict, "common.error");
    if (!Number.isFinite(lo) || lo < -180 || lo > 180) nextErrors.lng = t(dict, "common.error");
    if (nextErrors.lat || nextErrors.lng) {
      setErrors(nextErrors);
      return;
    }
    setErrors({});
    await patch({ lat: la, lng: lo });
  }

  async function runWorkflow(action: WorkflowAction, successKey: string) {
    if (busy || !data) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/places/${placeId}/workflow`, {
        method: "POST",
        body: { action },
      });
      setMessage({ tone: "success", text: t(dict, successKey) });
      reload();
    } catch (err) {
      setMessage({ tone: "danger", text: adminError(err, dict) });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (busy || !data || deleteInput !== data.slug) return;
    setBusy(true);
    setMessage(null);
    try {
      await apiFetch(`/api/v1/admin/places/${placeId}`, { method: "DELETE" });
      router.push(`/${locale}/admin/places`);
    } catch (err) {
      setMessage({ tone: "danger", text: adminError(err, dict) });
      setBusy(false);
    }
  }

  if (missing) notFound();

  if (loading && !data) return <CardSkeleton label={t(dict, "common.loading")} />;

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {adminError(error, dict)}
        </Alert>
        <Button variant="secondary" onClick={() => reload()}>
          {t(dict, "common.retry")}
        </Button>
      </div>
    );
  }

  if (!data) return <EmptyState title={t(dict, "common.empty")} />;

  const enName = data.translations.find((entry) => entry.locale === "en")?.name ?? `/${data.slug}`;

  return (
    <div className="space-y-6">
      {message ? (
        <Alert tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>
          {message.text}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-3">
              <span>{enName}</span>
              <StatusBadge status={data.status} />
            </span>
          }
          description={`/${data.slug}`}
          action={
            <ButtonLink href={`/${locale}/admin/places`} variant="ghost" size="sm">
              {t(dict, "common.back")}
            </ButtonLink>
          }
        />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.verification")}
              </dt>
              <dd className="mt-0.5">
                <Badge tone="outline">{verificationLabel(dict, data.verificationStatus)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.sortOrder")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{data.sortOrder}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.createdAt")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{formatDate(data.createdAt, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "common.updated")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{formatDate(data.updatedAt, locale)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.actions")} />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {WORKFLOW.map((step) => {
              const allowed = step.from.includes(data.status);
              const hint = allowed
                ? undefined
                : t(dict, "admin.needsStatus", {
                    status: statusLabel(dict, step.hintFrom),
                  });
              if (!allowed) {
                return (
                  <Button
                    key={step.action}
                    size="sm"
                    variant="secondary"
                    disabled
                    title={hint}
                  >
                    {t(dict, step.labelKey)}
                  </Button>
                );
              }
              if (step.confirm) {
                return (
                  <ConfirmAction
                    key={step.action}
                    label={t(dict, step.labelKey)}
                    confirmLabel={t(dict, "admin.confirm")}
                    cancelLabel={t(dict, "common.cancel")}
                    variant="danger"
                    busy={busy}
                    disabled={busy}
                    onConfirm={() => void runWorkflow(step.action, step.successKey)}
                  />
                );
              }
              return (
                <Button
                  key={step.action}
                  size="sm"
                  variant={step.action === "publish" ? "primary" : "secondary"}
                  disabled={busy}
                  loading={busy}
                  onClick={() => void runWorkflow(step.action, step.successKey)}
                >
                  {t(dict, step.labelKey)}
                </Button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.settings")} />
        <CardBody>
          <form onSubmit={onCoreSave} noValidate className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "places.typeLabel")}
                htmlFor="place-type"
                hint={t(dict, "common.optional")}
                error={errors.typeLabel}
              >
                <Input
                  id="place-type"
                  value={typeLabel}
                  onChange={(e) => setTypeLabel(e.target.value)}
                  disabled={busy}
                />
              </Field>
              <Field label={t(dict, "admin.verification")} htmlFor="place-verification">
                <Select
                  id="place-verification"
                  value={verification}
                  onChange={(e) => setVerification(e.target.value)}
                  disabled={busy}
                >
                  {VERIFICATION_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {verificationLabel(dict, option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t(dict, "admin.sortOrder")}
                htmlFor="place-sort"
                error={errors.sortOrder}
              >
                <Input
                  id="place-sort"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  disabled={busy}
                />
              </Field>
            </div>

            <Checkbox
              id="place-featured"
              label={t(dict, "admin.featured")}
              checked={featured}
              onChange={setFeatured}
              disabled={busy}
            />
            <Checkbox
              id="place-noindex"
              label={t(dict, "admin.noIndex")}
              hint={t(dict, "admin.noIndexHint")}
              checked={noIndex}
              onChange={setNoIndex}
              disabled={busy}
            />

            <div className="flex justify-end">
              <Button type="submit" loading={busy}>
                {t(dict, "account.saveChanges")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.translations")} />
        <CardBody>
          <form onSubmit={onTranslationsSave} noValidate className="space-y-4">
            {(["en", "fr", "ar"] as const).map((code) => (
              <fieldset
                key={code}
                className="rounded-lg border border-rocky-200 p-4"
                disabled={busy}
              >
                <legend className="px-2 text-sm font-semibold uppercase tracking-wide text-rocky-600">
                  {code}
                  {code === "en" ? (
                    <span className="text-danger-600" aria-hidden="true">
                      {" *"}
                    </span>
                  ) : null}
                </legend>
                <div className="space-y-4">
                  <Field
                    label={t(dict, "auth.name")}
                    htmlFor={`place-name-${code}`}
                    required={code === "en"}
                    error={errors[`translations.${code}.name`]}
                    hint={code === "en" ? undefined : t(dict, "common.optional")}
                  >
                    <Input
                      id={`place-name-${code}`}
                      value={drafts[code].name}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [code]: { ...prev[code], name: e.target.value },
                        }))
                      }
                    />
                  </Field>
                  <Field
                    label={t(dict, "places.typeLabel")}
                    htmlFor={`place-typelabel-${code}`}
                    hint={t(dict, "common.optional")}
                  >
                    <Input
                      id={`place-typelabel-${code}`}
                      value={drafts[code].typeLabel}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [code]: { ...prev[code], typeLabel: e.target.value },
                        }))
                      }
                    />
                  </Field>
                  <Field
                    label={t(dict, "admin.summary")}
                    htmlFor={`place-summary-${code}`}
                    hint={t(dict, "common.optional")}
                  >
                    <Textarea
                      id={`place-summary-${code}`}
                      rows={3}
                      maxLength={2000}
                      value={drafts[code].summary}
                      onChange={(e) =>
                        setDrafts((prev) => ({
                          ...prev,
                          [code]: { ...prev[code], summary: e.target.value },
                        }))
                      }
                    />
                  </Field>
                </div>
              </fieldset>
            ))}
            <div className="flex justify-end">
              <Button type="submit" loading={busy}>
                {t(dict, "account.saveChanges")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "map.title")} description={t(dict, "admin.coordinatesHint")} />
        <CardBody>
          <form onSubmit={onCoordinatesSave} noValidate className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t(dict, "admin.lat")} htmlFor="place-lat" error={errors.lat}>
                <Input
                  id="place-lat"
                  type="number"
                  step="any"
                  min={-90}
                  max={90}
                  value={lat}
                  onChange={(e) => setLat(e.target.value)}
                  disabled={busy}
                  placeholder="—"
                />
              </Field>
              <Field label={t(dict, "admin.lng")} htmlFor="place-lng" error={errors.lng}>
                <Input
                  id="place-lng"
                  type="number"
                  step="any"
                  min={-180}
                  max={180}
                  value={lng}
                  onChange={(e) => setLng(e.target.value)}
                  disabled={busy}
                  placeholder="—"
                />
              </Field>
            </div>
            <p className="text-xs text-rocky-500">{t(dict, "admin.coordinatesHint")}</p>
            <div className="flex justify-end">
              <Button type="submit" loading={busy}>
                {t(dict, "account.saveChanges")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.delete")} description={t(dict, "admin.deleteConfirm", { slug: data.slug })} />
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <Field
              label={t(dict, "admin.slug")}
              htmlFor="place-delete-confirm"
              error={
                deleteInput && deleteInput !== data.slug
                  ? t(dict, "admin.deleteConfirm", { slug: data.slug })
                  : null
              }
            >
              <Input
                id="place-delete-confirm"
                value={deleteInput}
                onChange={(e) => setDeleteInput(e.target.value)}
                disabled={busy}
                autoComplete="off"
                className="font-mono"
              />
            </Field>
            <Button
              type="button"
              variant="danger"
              loading={busy}
              disabled={busy || deleteInput !== data.slug}
              onClick={() => void onDelete()}
            >
              {t(dict, "admin.delete")}
            </Button>
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
