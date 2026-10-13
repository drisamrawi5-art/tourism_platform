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
import { Field, Input, Textarea } from "@/components/ui/field";
import { ApiClientError } from "@/lib/api/client";

type Business = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  config: {
    depositEnabled?: boolean;
    depositPercent?: number;
    freeCancellationHours?: number;
    cancellationPolicyText?: string;
  } | null;
  translations: Array<{ locale: string; name: string; description: string | null }>;
  bookables: Array<{ id: string; slug: string; category: string; status: string }>;
};

type MediaItem = {
  id: string;
  url: string;
  alt: string;
  caption: string | null;
  kind: string;
  status: string;
  createdAt: string;
};

export default function ProviderBusinessEdit() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [business, setBusiness] = useState<Business | null>(null);
  const [media, setMedia] = useState<MediaItem[]>([]);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [depositPercent, setDepositPercent] = useState("");
  const [cancellationText, setCancellationText] = useState("");

  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [altText, setAltText] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch<{ business: Business }>(`/api/v1/provider/business/${params.id}`);
      const b = res.data.business;
      setBusiness(b);
      setName(b.name);
      setDescription(b.translations.find((tr) => tr.locale === locale)?.description ?? b.translations[0]?.description ?? "");
      setPhone(b.phone ?? "");
      setEmail(b.email ?? "");
      setAddress(b.address ?? "");
      setDepositEnabled(b.config?.depositEnabled ?? false);
      setDepositPercent(b.config?.depositPercent != null ? String(b.config.depositPercent) : "");
      setCancellationText(b.config?.cancellationPolicyText ?? "");
    } catch {
      setError(true);
    }
  }, [params.id, locale]);

  const loadMedia = useCallback(async () => {
    try {
      const res = await apiFetch<MediaItem[]>(
        `/api/v1/media?businessId=${params.id}&perPage=50`,
      );
      setMedia(res.data ?? []);
    } catch {
      // Media list is best-effort; the upload section still works.
    }
  }, [params.id]);

  useEffect(() => {
    void load();
    void loadMedia();
  }, [load, loadMedia]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      await apiFetch(`/api/v1/provider/business/${params.id}`, {
        method: "PATCH",
        body: {
          name,
          description: description || null,
          phone: phone || null,
          email: email || undefined,
          address: address || null,
          config: {
            depositEnabled,
            depositPercent: depositPercent ? Number(depositPercent) : undefined,
            cancellationPolicyText: cancellationText || undefined,
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

  const upload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setUploadError(null);
    try {
      const form = new FormData();
      form.append("file", file);
      form.append("alt", altText || file.name);
      form.append("businessId", params.id);
      await apiFetch("/api/v1/media/upload", { method: "POST", body: form });
      setAltText("");
      e.target.value = "";
      await loadMedia();
    } catch (err) {
      setUploadError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setUploading(false);
    }
  };

  if (error) {
    return (
      <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
        {t(dict, "errors.serverErrorBody")}
      </Alert>
    );
  }

  if (!business) {
    return <div className="skeleton h-48 w-full" />;
  }

  return (
    <div className="space-y-6">
      {saveOk ? (
        <Alert tone="success" role="status">
          {t(dict, "admin.settingsSaved")}
        </Alert>
      ) : null}
      {saveError ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {saveError}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={business.name}
          description={`${business.slug} · ${business.type}`}
          action={<StatusBadge status={business.status} />}
        />
        <CardBody>
          {business.status === "PENDING_REVIEW" ? (
            <Alert tone="info">{t(dict, "provider.approvalPending")}</Alert>
          ) : null}
          {business.status === "REJECTED" ? (
            <Alert tone="danger">{t(dict, "provider.rejectedNote")}</Alert>
          ) : null}

          <form onSubmit={save} className="space-y-4">
            <Field label={t(dict, "provider.businessName")} htmlFor="name" required>
              <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={160} />
            </Field>

            <Field label={t(dict, "provider.description")} htmlFor="description">
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label={t(dict, "common.email")} htmlFor="email">
                <Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              </Field>
              <Field label={t(dict, "common.phone")} htmlFor="phone">
                <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
              </Field>
            </div>

            <Field label={t(dict, "provider.address")} htmlFor="address">
              <Input id="address" value={address} onChange={(e) => setAddress(e.target.value)} maxLength={300} />
            </Field>

            <div className="border-t border-rocky-100 pt-4">
              <h3 className="mb-3 text-sm font-semibold text-rocky-800">{t(dict, "provider.settings")}</h3>
              <div className="space-y-4">
                <label className="flex items-center gap-2 text-sm text-rocky-800">
                  <input
                    type="checkbox"
                    checked={depositEnabled}
                    onChange={(e) => setDepositEnabled(e.target.checked)}
                    className="h-4 w-4 rounded border-rocky-300"
                  />
                  {t(dict, "provider.depositEnabled")}
                </label>
                {depositEnabled ? (
                  <Field label={t(dict, "provider.depositPercent")} htmlFor="depositPercent">
                    <Input
                      id="depositPercent"
                      type="number"
                      min={1}
                      max={100}
                      value={depositPercent}
                      onChange={(e) => setDepositPercent(e.target.value)}
                    />
                  </Field>
                ) : null}
                <Field label={t(dict, "provider.cancellationText")} htmlFor="cancellationText">
                  <Textarea
                    id="cancellationText"
                    value={cancellationText}
                    onChange={(e) => setCancellationText(e.target.value)}
                    maxLength={2000}
                  />
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
        <CardHeader title={t(dict, "provider.media")} />
        <CardBody className="space-y-4">
          {uploadError ? (
            <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
              {uploadError}
            </Alert>
          ) : null}

          <div className="flex flex-wrap items-end gap-3">
            <Field label={t(dict, "admin.altText")} htmlFor="altText">
              <Input
                id="altText"
                value={altText}
                onChange={(e) => setAltText(e.target.value)}
                placeholder={t(dict, "admin.altText")}
                maxLength={300}
              />
            </Field>
            <label className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-forest-600 px-4 text-sm font-medium text-white transition-colors hover:bg-forest-700">
              {uploading ? t(dict, "common.loading") : t(dict, "provider.uploadMedia")}
              <input type="file" accept="image/*,video/*" className="hidden" onChange={upload} disabled={uploading} />
            </label>
          </div>

          {media.length === 0 ? (
            <p className="text-sm text-rocky-500">{t(dict, "provider.mediaEmpty")}</p>
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {media.map((m) => (
                <li key={m.id} className="rounded-lg border border-rocky-200 bg-white p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={m.url} alt={m.alt} className="mb-2 h-32 w-full rounded-md object-cover" />
                  <p className="truncate text-xs text-rocky-600">{m.alt}</p>
                  <p className="text-xs text-rocky-400">
                    {m.kind} · {formatDate(m.createdAt, locale)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
