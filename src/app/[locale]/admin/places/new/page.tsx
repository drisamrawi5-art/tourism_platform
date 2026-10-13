"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ApiClientError } from "@/lib/api/client";

export default function AdminPlaceNew() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [typeLabel, setTypeLabel] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [enName, setEnName] = useState("");
  const [enTypeLabel, setEnTypeLabel] = useState("");
  const [enSummary, setEnSummary] = useState("");
  const [frName, setFrName] = useState("");
  const [frTypeLabel, setFrTypeLabel] = useState("");
  const [frSummary, setFrSummary] = useState("");
  const [arName, setArName] = useState("");
  const [arTypeLabel, setArTypeLabel] = useState("");
  const [arSummary, setArSummary] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await apiFetch<{ place: { id: string } }>("/api/v1/admin/places", {
        method: "POST",
        body: {
          slug,
          typeLabel: typeLabel || undefined,
          status,
          featured,
          sortOrder: Number(sortOrder),
          translations: {
            en: { name: enName, typeLabel: enTypeLabel || undefined, summary: enSummary || undefined },
            fr: frName ? { name: frName, typeLabel: frTypeLabel || undefined, summary: frSummary || undefined } : undefined,
            ar: arName ? { name: arName, typeLabel: arTypeLabel || undefined, summary: arSummary || undefined } : undefined,
          },
        },
      });
      router.push(`/${locale}/admin/places/${res.data.place.id}`);
    } catch (err) {
      if (err instanceof ApiClientError) {
        setErrors(err.fieldErrors());
        setFormError(err.message);
      } else {
        setFormError(t(dict, "errors.serverErrorBody"));
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader title={t(dict, "admin.createPlace")} />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          {formError ? (
            <Alert tone="danger" role="alert" title={t(dict, "common.error")}>{formError}</Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(dict, "admin.slug")} htmlFor="slug" required error={errors.slug}>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required minLength={2} maxLength={80} pattern="[a-z0-9-]+" />
            </Field>
            <Field label={t(dict, "admin.status")} htmlFor="status" required>
              <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
          </div>

          <Field label={t(dict, "admin.typeLabel")} htmlFor="typeLabel">
            <Input id="typeLabel" value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} maxLength={120} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(dict, "admin.featured")} htmlFor="featured">
              <Select id="featured" value={featured ? "true" : "false"} onChange={(e) => setFeatured(e.target.value === "true")}>
                <option value="false">false</option>
                <option value="true">true</option>
              </Select>
            </Field>
            <Field label={t(dict, "admin.sortOrder")} htmlFor="sortOrder">
              <Input id="sortOrder" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
            </Field>
          </div>

          <div className="border-t border-rocky-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-rocky-800">English</h3>
            <div className="space-y-3">
              <Field label={t(dict, "admin.name")} htmlFor="enName" required>
                <Input id="enName" value={enName} onChange={(e) => setEnName(e.target.value)} required />
              </Field>
              <Field label={t(dict, "admin.typeLabel")} htmlFor="enTypeLabel">
                <Input id="enTypeLabel" value={enTypeLabel} onChange={(e) => setEnTypeLabel(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.summary")} htmlFor="enSummary">
                <Textarea id="enSummary" value={enSummary} onChange={(e) => setEnSummary(e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="border-t border-rocky-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-rocky-800">Français</h3>
            <div className="space-y-3">
              <Field label={t(dict, "admin.name")} htmlFor="frName">
                <Input id="frName" value={frName} onChange={(e) => setFrName(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.typeLabel")} htmlFor="frTypeLabel">
                <Input id="frTypeLabel" value={frTypeLabel} onChange={(e) => setFrTypeLabel(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.summary")} htmlFor="frSummary">
                <Textarea id="frSummary" value={frSummary} onChange={(e) => setFrSummary(e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="border-t border-rocky-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-rocky-800">العربية</h3>
            <div className="space-y-3">
              <Field label={t(dict, "admin.name")} htmlFor="arName">
                <Input id="arName" value={arName} onChange={(e) => setArName(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.typeLabel")} htmlFor="arTypeLabel">
                <Input id="arTypeLabel" value={arTypeLabel} onChange={(e) => setArTypeLabel(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.summary")} htmlFor="arSummary">
                <Textarea id="arSummary" value={arSummary} onChange={(e) => setArSummary(e.target.value)} />
              </Field>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? t(dict, "common.loading") : t(dict, "admin.createPlace")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
