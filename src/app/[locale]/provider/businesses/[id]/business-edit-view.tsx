"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { notFound, useRouter } from "next/navigation";
import { apiFetch, qs } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Field, Input, Textarea } from "@/components/ui/field";
import { SmartImage } from "@/components/ui/image";
import { fieldErrors, useRequireAuth } from "@/components/auth/helpers";
import { SkeletonList } from "@/components/provider/skeleton";
import { ConfirmButton } from "@/components/provider/confirm-button";
import {
  categoryLabel,
  formatMegabytes,
  providerErrorMessage,
  uploadBusinessMedia,
  type BusinessMedia,
  type PendingMedia,
  type ProviderBusiness,
} from "@/components/provider/api";

function pickDescription(business: ProviderBusiness, locale: string | null): string {
  const translation =
    business.translations.find((row) => row.locale === locale) ?? business.translations[0];
  return translation?.description ?? "";
}

export function BusinessEditView({
  locale,
  businessId,
  maxImageBytes,
  allowedImageTypes,
}: {
  locale: Locale;
  businessId: string;
  maxImageBytes: number;
  allowedImageTypes: readonly string[];
}) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { user, ready } = useRequireAuth(locale);

  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);

  const [actionError, setActionError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [media, setMedia] = useState<BusinessMedia[]>([]);
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [mediaLoading, setMediaLoading] = useState(true);
  const [mediaError, setMediaError] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileKey, setFileKey] = useState(0);
  const [alt, setAlt] = useState("");
  const [uploadErrors, setUploadErrors] = useState<Record<string, string | undefined>>({});
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadInfo, setUploadInfo] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);

  const redirectedTo = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiFetch<{ business: ProviderBusiness | null }>(
        "/api/v1/provider/business",
      );
      const next = res.data.business;
      setBusiness(next);
      if (next && next.id !== businessId && redirectedTo.current !== next.id) {
        // A provider owns exactly one business — normalise stale links.
        redirectedTo.current = next.id;
        router.replace(`/${locale}/provider/businesses/${next.id}`);
      }
      if (next) {
        setName(next.name);
        setDescription(pickDescription(next, user?.locale ?? null));
        setPhone(next.phone ?? "");
        setEmail(next.email ?? "");
        setAddress(next.address ?? "");
      }
    } catch (err) {
      setBusiness(null);
      setLoadError(providerErrorMessage(err, dict));
    } finally {
      setLoaded(true);
    }
  }, [businessId, dict, locale, router, user]);

  const loadMedia = useCallback(async () => {
    setMediaError(null);
    try {
      const res = await apiFetch<BusinessMedia[]>(
        `/api/v1/media${qs({ businessId, perPage: 100 })}`,
      );
      setMedia(res.data ?? []);
    } catch (err) {
      setMediaError(providerErrorMessage(err, dict));
    } finally {
      setMediaLoading(false);
    }
  }, [businessId, dict]);

  useEffect(() => {
    if (!user) return;
    void load();
    void loadMedia();
  }, [user, load, loadMedia]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !business) return;
    setErrors({});
    setFormError(null);
    setSaved(false);
    setSaving(true);
    try {
      await apiFetch<{ business: ProviderBusiness }>(
        `/api/v1/provider/business/${business.id}`,
        {
          method: "PATCH",
          body: {
            name: name.trim(),
            description: description.trim() === "" ? null : description.trim(),
            phone: phone.trim() === "" ? null : phone.trim(),
            address: address.trim() === "" ? null : address.trim(),
            ...(email.trim() ? { email: email.trim() } : {}),
          },
        },
      );
      setSaved(true);
      await load();
    } catch (err) {
      const details = fieldErrors(err);
      setErrors(details);
      if (Object.keys(details).length === 0) {
        setFormError(providerErrorMessage(err, dict));
      }
    } finally {
      setSaving(false);
    }
  }

  async function onSubmitForReview() {
    if (!business || busy) return;
    setBusy(true);
    setActionError(null);
    setInfo(null);
    try {
      await apiFetch(`/api/v1/provider/business/${business.id}/submit`, {
        method: "POST",
        body: {},
      });
      setInfo(t(dict, "provider.submitted"));
      await load();
    } catch (err) {
      setActionError(providerErrorMessage(err, dict));
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (uploading || !business) return;
    setUploadErrors({});
    setUploadError(null);
    setUploadInfo(null);

    if (!file) {
      setUploadErrors({ file: t(dict, "common.required") });
      return;
    }
    if (!alt.trim()) {
      setUploadErrors({ alt: t(dict, "common.required") });
      return;
    }
    if (file.size > maxImageBytes) {
      setUploadError(
        t(dict, "provider.errors.fileTooLarge", { size: formatMegabytes(maxImageBytes) }),
      );
      return;
    }

    setUploading(true);
    try {
      const created = await uploadBusinessMedia({
        file,
        alt: alt.trim(),
        businessId: business.id,
      });
      setPending((previous) => [created, ...previous]);
      setFile(null);
      setAlt("");
      setFileKey((key) => key + 1);
      setUploadInfo(t(dict, "provider.mediaPending"));
      await loadMedia();
    } catch (err) {
      setUploadError(
        providerErrorMessage(err, dict, { size: formatMegabytes(maxImageBytes) }),
      );
    } finally {
      setUploading(false);
    }
  }

  if (!ready || !user) return null;

  if (!loaded) {
    return <SkeletonList label={t(dict, "common.loading")} rows={5} />;
  }

  if (!business) {
    if (businessId && loadError === null) notFound();
    return (
      <div className="space-y-4">
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {loadError ?? t(dict, "errors.serverErrorBody")}
        </Alert>
        <Button variant="secondary" onClick={() => void load()}>
          {t(dict, "common.retry")}
        </Button>
      </div>
    );
  }

  const canSubmit = business.status === "DRAFT" || business.status === "REJECTED";
  const limitLabel = formatMegabytes(maxImageBytes);

  return (
    <div className="space-y-6">
      {actionError ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {actionError}
        </Alert>
      ) : null}
      {info ? (
        <Alert tone="success" role="status">
          {info}
        </Alert>
      ) : null}

      {business.status === "PENDING_REVIEW" ? (
        <Alert tone="info" role="status">
          {t(dict, "provider.approvalPending")}
        </Alert>
      ) : null}
      {business.status === "PUBLISHED" ? (
        <Alert tone="success" role="status" title={t(dict, "common.status.PUBLISHED")}>
          {t(dict, "provider.approved")}
        </Alert>
      ) : null}
      {business.status === "REJECTED" ? (
        <Alert tone="danger" title={t(dict, "provider.rejected")}>
          {t(dict, "provider.rejectedNote")}
        </Alert>
      ) : null}
      {business.status === "DRAFT" ? (
        <Alert tone="info" role="status">
          {t(dict, "provider.draftNote")}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={t(dict, "provider.businessProfile")}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="outline">{categoryLabel(dict, business.type)}</Badge>
              <span dir="ltr">/{business.slug}</span>
            </span>
          }
          action={
            canSubmit ? (
              <ConfirmButton
                label={t(dict, "provider.submitForReview")}
                confirmLabel={t(dict, "provider.confirmPrompt")}
                cancelLabel={t(dict, "common.cancel")}
                onConfirm={onSubmitForReview}
                busy={busy}
              />
            ) : null
          }
        />
        <CardBody>
          {saved ? (
            <div className="mb-4">
              <Alert tone="success" role="status">
                {t(dict, "account.saved")}
              </Alert>
            </div>
          ) : null}
          {formError ? (
            <div className="mb-4">
              <Alert tone="danger" role="alert">
                {formError}
              </Alert>
            </div>
          ) : null}

          <form onSubmit={onSave} noValidate className="space-y-4">
            <Field
              label={t(dict, "provider.businessName")}
              htmlFor="business-name"
              required
              error={errors.name}
            >
              <Input
                id="business-name"
                name="name"
                maxLength={160}
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={saving}
              />
            </Field>

            <Field
              label={t(dict, "provider.description")}
              htmlFor="business-description"
              hint={t(dict, "common.optional")}
              error={errors.description}
            >
              <Textarea
                id="business-description"
                name="description"
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "auth.email")}
                htmlFor="business-email"
                hint={t(dict, "common.optional")}
                error={errors.email}
              >
                <Input
                  id="business-email"
                  name="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                />
              </Field>

              <Field
                label={t(dict, "auth.phone")}
                htmlFor="business-phone"
                hint={t(dict, "common.optional")}
                error={errors.phone}
              >
                <Input
                  id="business-phone"
                  name="phone"
                  type="tel"
                  maxLength={40}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={saving}
                />
              </Field>
            </div>

            <Field
              label={t(dict, "provider.address")}
              htmlFor="business-address"
              hint={t(dict, "common.optional")}
              error={errors.address}
            >
              <Input
                id="business-address"
                name="address"
                maxLength={300}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={saving}
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                {t(dict, "account.saveChanges")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t(dict, "provider.media")}
          description={t(dict, "provider.mediaApprovedNote")}
        />
        <CardBody className="space-y-6">
          <form onSubmit={onUpload} noValidate className="space-y-4">
            {uploadError ? (
              <Alert tone="danger" role="alert">
                {uploadError}
              </Alert>
            ) : null}
            {uploadInfo ? (
              <Alert tone="info" role="status">
                {uploadInfo}
              </Alert>
            ) : null}

            <Field
              label={t(dict, "provider.uploadMedia")}
              htmlFor="media-file"
              hint={t(dict, "provider.uploadLimit", { size: limitLabel })}
              error={uploadErrors.file}
            >
              <Input
                key={fileKey}
                id="media-file"
                name="file"
                type="file"
                accept={allowedImageTypes.join(",")}
                onChange={(e) => setFile(e.target.files?.[0] ?? null)}
                disabled={uploading}
              />
            </Field>

            <Field
              label={t(dict, "provider.mediaAlt")}
              htmlFor="media-alt"
              required
              error={uploadErrors.alt}
            >
              <Input
                id="media-alt"
                name="alt"
                maxLength={300}
                value={alt}
                onChange={(e) => setAlt(e.target.value)}
                disabled={uploading}
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" loading={uploading}>
                {t(dict, "provider.uploadMedia")}
              </Button>
            </div>
          </form>

          {pending.length > 0 ? (
            <div className="space-y-3">
              <h3 className="text-sm font-semibold text-rocky-800">
                {t(dict, "provider.mediaPending")}
              </h3>
              <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
                {pending.map((item) => (
                  <li key={item.id} className="space-y-1.5">
                    <SmartImage
                      image={{ url: `/api/v1/media/file/${item.storageKey}`, alt: item.alt }}
                      sizes="(max-width: 640px) 50vw, 240px"
                    />
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge tone="warning">{t(dict, "common.status.PENDING_REVIEW")}</Badge>
                    </div>
                    <p className="truncate text-xs text-rocky-600">{item.alt}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {mediaLoading ? (
            <SkeletonList label={t(dict, "common.loading")} rows={2} />
          ) : mediaError ? (
            <div className="space-y-4">
              <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
                {mediaError}
              </Alert>
              <Button variant="secondary" onClick={() => void loadMedia()}>
                {t(dict, "common.retry")}
              </Button>
            </div>
          ) : media.length === 0 && pending.length === 0 ? (
            <EmptyState compact title={t(dict, "provider.mediaEmpty")} />
          ) : media.length === 0 ? null : (
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
              {media.map((item) => (
                <li key={item.id} className="space-y-1.5">
                  <SmartImage
                    image={{ url: item.url, alt: item.alt ?? "" }}
                    sizes="(max-width: 640px) 50vw, 240px"
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="success">{t(dict, "common.status.APPROVED")}</Badge>
                    <span className="text-xs text-rocky-500">
                      {formatDate(item.createdAt, locale)}
                    </span>
                  </div>
                  <p className="truncate text-xs text-rocky-600">{item.alt}</p>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
