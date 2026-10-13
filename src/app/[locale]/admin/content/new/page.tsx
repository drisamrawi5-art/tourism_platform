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

const KINDS = ["PLACE", "DESTINATION", "STORY", "GUIDE", "ACCOMMODATION", "EDITORIAL", "EXPERIENCE", "EVENT", "RESTAURANT", "TRAVEL_GUIDE"] as const;

export default function AdminContentNew() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const router = useRouter();
  const [kind, setKind] = useState<string>("STORY");
  const [slug, setSlug] = useState("");
  const [status, setStatus] = useState("DRAFT");
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [enTitle, setEnTitle] = useState("");
  const [enSummary, setEnSummary] = useState("");
  const [enBody, setEnBody] = useState("");
  const [frTitle, setFrTitle] = useState("");
  const [frSummary, setFrSummary] = useState("");
  const [frBody, setFrBody] = useState("");
  const [arTitle, setArTitle] = useState("");
  const [arSummary, setArSummary] = useState("");
  const [arBody, setArBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await apiFetch<{ content: { id: string } }>("/api/v1/admin/content", {
        method: "POST",
        body: {
          kind,
          slug,
          status,
          featured,
          sortOrder: Number(sortOrder),
          translations: {
            en: { title: enTitle, summary: enSummary || undefined, body: enBody || undefined },
            fr: frTitle ? { title: frTitle, summary: frSummary || undefined, body: frBody || undefined } : undefined,
            ar: arTitle ? { title: arTitle, summary: arSummary || undefined, body: arBody || undefined } : undefined,
          },
        },
      });
      router.push(`/${locale}/admin/content/${res.data.content.id}`);
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
      <CardHeader title={t(dict, "admin.createContent")} />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          {formError ? (
            <Alert tone="danger" role="alert" title={t(dict, "common.error")}>{formError}</Alert>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(dict, "admin.kind")} htmlFor="kind" required>
              <Select id="kind" value={kind} onChange={(e) => setKind(e.target.value)}>
                {KINDS.map((k) => (
                  <option key={k} value={k}>{t(dict, `admin.contentKinds.${k}`)}</option>
                ))}
              </Select>
            </Field>
            <Field label={t(dict, "admin.slug")} htmlFor="slug" required error={errors.slug}>
              <Input id="slug" value={slug} onChange={(e) => setSlug(e.target.value)} required minLength={2} maxLength={120} pattern="[a-z0-9-]+" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t(dict, "admin.status")} htmlFor="status" required>
              <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                {["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"].map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </Select>
            </Field>
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
              <Field label={t(dict, "admin.contentTitle")} htmlFor="enTitle" required>
                <Input id="enTitle" value={enTitle} onChange={(e) => setEnTitle(e.target.value)} required />
              </Field>
              <Field label={t(dict, "admin.summary")} htmlFor="enSummary">
                <Textarea id="enSummary" value={enSummary} onChange={(e) => setEnSummary(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.markdown")} htmlFor="enBody" hint={t(dict, "admin.markdownHint")}>
                <Textarea id="enBody" value={enBody} onChange={(e) => setEnBody(e.target.value)} className="font-mono text-xs" />
              </Field>
            </div>
          </div>

          <div className="border-t border-rocky-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-rocky-800">Français</h3>
            <div className="space-y-3">
              <Field label={t(dict, "admin.contentTitle")} htmlFor="frTitle">
                <Input id="frTitle" value={frTitle} onChange={(e) => setFrTitle(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.summary")} htmlFor="frSummary">
                <Textarea id="frSummary" value={frSummary} onChange={(e) => setFrSummary(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.markdown")} htmlFor="frBody">
                <Textarea id="frBody" value={frBody} onChange={(e) => setFrBody(e.target.value)} className="font-mono text-xs" />
              </Field>
            </div>
          </div>

          <div className="border-t border-rocky-100 pt-4">
            <h3 className="mb-3 text-sm font-semibold text-rocky-800">العربية</h3>
            <div className="space-y-3">
              <Field label={t(dict, "admin.contentTitle")} htmlFor="arTitle">
                <Input id="arTitle" value={arTitle} onChange={(e) => setArTitle(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.summary")} htmlFor="arSummary">
                <Textarea id="arSummary" value={arSummary} onChange={(e) => setArSummary(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.markdown")} htmlFor="arBody">
                <Textarea id="arBody" value={arBody} onChange={(e) => setArBody(e.target.value)} className="font-mono text-xs" />
              </Field>
            </div>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? t(dict, "common.loading") : t(dict, "admin.createContent")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
