"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { adminError } from "@/components/admin/use-admin";
import { Checkbox } from "@/components/admin/fields";
import { PUBLICATION_STATUSES } from "@/components/admin/enums";
import { statusLabel } from "@/components/admin/labels";

type TranslationDraft = { name: string; typeLabel: string; summary: string };

const EMPTY: TranslationDraft = { name: "", typeLabel: "", summary: "" };
const SLUG_PATTERN = /^[a-z0-9-]+$/;

export function PlaceNewView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const router = useRouter();

  const [slug, setSlug] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  const [status, setStatus] = useState<string>("DRAFT");
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [en, setEn] = useState<TranslationDraft>(EMPTY);
  const [fr, setFr] = useState<TranslationDraft>(EMPTY);
  const [ar, setAr] = useState<TranslationDraft>(EMPTY);

  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [message, setMessage] = useState<{ tone: "success" | "danger"; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  function translationPayload(draft: TranslationDraft) {
    return {
      name: draft.name.trim(),
      ...(draft.typeLabel.trim() ? { typeLabel: draft.typeLabel.trim() } : {}),
      ...(draft.summary.trim() ? { summary: draft.summary.trim() } : {}),
    };
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;

    const nextErrors: Record<string, string | undefined> = {};
    if (!slug.trim()) nextErrors.slug = t(dict, "common.required");
    else if (!SLUG_PATTERN.test(slug.trim())) nextErrors.slug = t(dict, "admin.slugHint");
    if (!en.name.trim()) nextErrors["translations.en.name"] = t(dict, "common.required");

    const order = sortOrder.trim() === "" ? 0 : Number.parseInt(sortOrder, 10);
    if (!Number.isInteger(order)) nextErrors.sortOrder = t(dict, "common.required");

    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      setMessage(null);
      return;
    }

    setErrors({});
    setSaving(true);
    setMessage(null);
    try {
      const res = await apiFetch<{ place: { id: string } }>("/api/v1/admin/places", {
        method: "POST",
        body: {
          slug: slug.trim(),
          ...(typeLabel.trim() ? { typeLabel: typeLabel.trim() } : {}),
          status,
          featured,
          sortOrder: order,
          translations: {
            en: translationPayload(en),
            ...(fr.name.trim() ? { fr: translationPayload(fr) } : {}),
            ...(ar.name.trim() ? { ar: translationPayload(ar) } : {}),
          },
        },
      });
      router.push(`/${locale}/admin/places/${res.data.place.id}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        setErrors((prev) => ({ ...prev, ...error.fieldErrors() }));
      }
      setMessage({ tone: "danger", text: adminError(error, dict) });
      setSaving(false);
    }
  }

  const localeSections: Array<{
    code: "en" | "fr" | "ar";
    draft: TranslationDraft;
    setDraft: (draft: TranslationDraft) => void;
    required: boolean;
  }> = [
    { code: "en", draft: en, setDraft: setEn, required: true },
    { code: "fr", draft: fr, setDraft: setFr, required: false },
    { code: "ar", draft: ar, setDraft: setAr, required: false },
  ];

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t(dict, "admin.createPlace")}
          description={t(dict, "admin.slugHint")}
          action={
            <ButtonLink href={`/${locale}/admin/places`} variant="ghost" size="sm">
              {t(dict, "common.back")}
            </ButtonLink>
          }
        />
        <CardBody>
          {message ? (
            <div className="mb-4">
              <Alert tone={message.tone} role={message.tone === "danger" ? "alert" : "status"}>
                {message.text}
              </Alert>
            </div>
          ) : null}

          <form onSubmit={onSubmit} noValidate className="space-y-6">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "admin.slug")}
                htmlFor="place-slug"
                required
                hint={t(dict, "admin.slugHint")}
                error={errors.slug}
              >
                <Input
                  id="place-slug"
                  name="slug"
                  value={slug}
                  onChange={(e) => setSlug(e.target.value)}
                  disabled={saving}
                  autoComplete="off"
                />
              </Field>
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
                  disabled={saving}
                />
              </Field>
              <Field label={t(dict, "admin.status")} htmlFor="place-status">
                <Select
                  id="place-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  disabled={saving}
                >
                  {PUBLICATION_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {statusLabel(dict, option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field
                label={t(dict, "admin.sortOrder")}
                htmlFor="place-sort"
                hint={t(dict, "common.optional")}
                error={errors.sortOrder}
              >
                <Input
                  id="place-sort"
                  type="number"
                  value={sortOrder}
                  onChange={(e) => setSortOrder(e.target.value)}
                  disabled={saving}
                />
              </Field>
            </div>

            <Checkbox
              id="place-featured"
              label={t(dict, "admin.featured")}
              checked={featured}
              onChange={setFeatured}
              disabled={saving}
            />

            {localeSections.map(({ code, draft, setDraft, required }) => (
              <fieldset
                key={code}
                className="rounded-lg border border-rocky-200 p-4"
                disabled={saving}
              >
                <legend className="px-2 text-sm font-semibold uppercase tracking-wide text-rocky-600">
                  {code}
                  {required ? (
                    <span className="text-danger-600" aria-hidden="true">
                      {" *"}
                    </span>
                  ) : null}
                </legend>
                <div className="space-y-4">
                  <Field
                    label={t(dict, "auth.name")}
                    htmlFor={`place-name-${code}`}
                    required={required}
                    error={errors[`translations.${code}.name`]}
                    hint={required ? undefined : t(dict, "common.optional")}
                  >
                    <Input
                      id={`place-name-${code}`}
                      value={draft.name}
                      onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                    />
                  </Field>
                  <Field
                    label={t(dict, "places.typeLabel")}
                    htmlFor={`place-typelabel-${code}`}
                    hint={t(dict, "common.optional")}
                  >
                    <Input
                      id={`place-typelabel-${code}`}
                      value={draft.typeLabel}
                      onChange={(e) => setDraft({ ...draft, typeLabel: e.target.value })}
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
                      value={draft.summary}
                      onChange={(e) => setDraft({ ...draft, summary: e.target.value })}
                    />
                  </Field>
                </div>
              </fieldset>
            ))}

            <div className="flex justify-end gap-3">
              <ButtonLink href={`/${locale}/admin/places`} variant="secondary" type="button">
                {t(dict, "common.cancel")}
              </ButtonLink>
              <Button type="submit" loading={saving}>
                {t(dict, "common.submit")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
