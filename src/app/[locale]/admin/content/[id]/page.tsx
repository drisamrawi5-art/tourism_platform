"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ApiClientError } from "@/lib/api/client";

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

export default function AdminContentEdit() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [content, setContent] = useState<Content | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [status, setStatus] = useState("");
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [noIndex, setNoIndex] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("");
  const [enTitle, setEnTitle] = useState("");
  const [enSummary, setEnSummary] = useState("");
  const [enBody, setEnBody] = useState("");
  const [frTitle, setFrTitle] = useState("");
  const [frSummary, setFrSummary] = useState("");
  const [frBody, setFrBody] = useState("");
  const [arTitle, setArTitle] = useState("");
  const [arSummary, setArSummary] = useState("");
  const [arBody, setArBody] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch<{ content: Content }>(`/api/v1/admin/content/${params.id}`);
      const c = res.data.content;
      setContent(c);
      setStatus(c.status);
      setFeatured(c.featured);
      setSortOrder(String(c.sortOrder));
      setNoIndex(c.noIndex);
      setVerificationStatus(c.verificationStatus);
      const en = c.translations.find((tr) => tr.locale === "en");
      const fr = c.translations.find((tr) => tr.locale === "fr");
      const ar = c.translations.find((tr) => tr.locale === "ar");
      setEnTitle(en?.title ?? "");
      setEnSummary(en?.summary ?? "");
      setEnBody(en?.body ?? "");
      setFrTitle(fr?.title ?? "");
      setFrSummary(fr?.summary ?? "");
      setFrBody(fr?.body ?? "");
      setArTitle(ar?.title ?? "");
      setArSummary(ar?.summary ?? "");
      setArBody(ar?.body ?? "");
    } catch {
      setError(true);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      await apiFetch(`/api/v1/admin/content/${params.id}`, {
        method: "PATCH",
        body: {
          status,
          featured,
          sortOrder: Number(sortOrder),
          noIndex,
          verificationStatus,
          translations: {
            en: { title: enTitle, summary: enSummary || null, body: enBody || null },
            fr: frTitle ? { title: frTitle, summary: frSummary || null, body: frBody || null } : undefined,
            ar: arTitle ? { title: arTitle, summary: arSummary || null, body: arBody || null } : undefined,
          },
        },
      });
      setSaveOk(true);
      await load();
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await apiFetch(`/api/v1/admin/content/${params.id}`, { method: "DELETE" });
      router.push(`/${locale}/admin/content`);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
      setSaving(false);
    }
  };

  if (error) {
    return (
      <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
        {t(dict, "errors.serverErrorBody")}
      </Alert>
    );
  }

  if (!content) {
    return <div className="skeleton h-48 w-full" />;
  }

  return (
    <div className="space-y-6">
      {saveOk ? <Alert tone="success" role="status">{t(dict, "admin.settingsSaved")}</Alert> : null}
      {saveError ? <Alert tone="danger" role="alert" title={t(dict, "common.error")}>{saveError}</Alert> : null}

      <Card>
        <CardHeader
          title={content.slug}
          description={`${t(dict, `admin.contentKinds.${content.kind}`)} · ${content.author?.name ?? content.author?.email ?? "—"}`}
          action={<StatusBadge status={content.status} />}
        />
        <CardBody>
          <form onSubmit={save} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t(dict, "admin.status")} htmlFor="status" required>
                <Select id="status" value={status} onChange={(e) => setStatus(e.target.value)}>
                  {["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "REJECTED", "ARCHIVED"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
              <Field label={t(dict, "admin.verification")} htmlFor="verificationStatus" required>
                <Select id="verificationStatus" value={verificationStatus} onChange={(e) => setVerificationStatus(e.target.value)}>
                  {["VERIFIED", "PROJECT_PROVIDED", "PROVIDER_PROVIDED", "EDITORIAL", "PENDING_VERIFICATION"].map((s) => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <Field label={t(dict, "admin.featured")} htmlFor="featured">
                <Select id="featured" value={featured ? "true" : "false"} onChange={(e) => setFeatured(e.target.value === "true")}>
                  <option value="false">false</option>
                  <option value="true">true</option>
                </Select>
              </Field>
              <Field label={t(dict, "admin.sortOrder")} htmlFor="sortOrder">
                <Input id="sortOrder" type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} />
              </Field>
              <Field label={t(dict, "admin.noIndex")} htmlFor="noIndex">
                <Select id="noIndex" value={noIndex ? "true" : "false"} onChange={(e) => setNoIndex(e.target.value === "true")}>
                  <option value="false">false</option>
                  <option value="true">true</option>
                </Select>
              </Field>
            </div>

            {content.publishedAt ? (
              <p className="text-sm text-rocky-600">
                {t(dict, "admin.publishedAt")}: {formatDate(content.publishedAt, locale)}
              </p>
            ) : null}

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
                {saving ? t(dict, "common.loading") : t(dict, "common.save")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.delete")} />
        <CardBody>
          {confirmDelete ? (
            <div className="space-y-3">
              <p className="text-sm text-rocky-600">
                {t(dict, "admin.deleteConfirm", { slug: content.slug })}
              </p>
              <div className="flex gap-3">
                <Button onClick={remove} disabled={saving} variant="danger">
                  {t(dict, "admin.delete")}
                </Button>
                <Button onClick={() => setConfirmDelete(false)} variant="ghost" disabled={saving}>
                  {t(dict, "common.cancel")}
                </Button>
              </div>
            </div>
          ) : (
            <Button onClick={() => setConfirmDelete(true)} variant="secondary">
              {t(dict, "admin.delete")}
            </Button>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
