"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ApiClientError } from "@/lib/api/client";

type Place = {
  id: string;
  slug: string;
  typeLabel: string | null;
  status: string;
  featured: boolean;
  sortOrder: number;
  noIndex: boolean;
  verificationStatus: string;
  lat: number | null;
  lng: number | null;
  translations: Array<{ locale: string; name: string; typeLabel: string | null; summary: string | null }>;
};

export default function AdminPlaceEdit() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [place, setPlace] = useState<Place | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [typeLabel, setTypeLabel] = useState("");
  const [status, setStatus] = useState("");
  const [featured, setFeatured] = useState(false);
  const [sortOrder, setSortOrder] = useState("0");
  const [noIndex, setNoIndex] = useState(false);
  const [verificationStatus, setVerificationStatus] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [enName, setEnName] = useState("");
  const [enTypeLabel, setEnTypeLabel] = useState("");
  const [enSummary, setEnSummary] = useState("");
  const [frName, setFrName] = useState("");
  const [frTypeLabel, setFrTypeLabel] = useState("");
  const [frSummary, setFrSummary] = useState("");
  const [arName, setArName] = useState("");
  const [arTypeLabel, setArTypeLabel] = useState("");
  const [arSummary, setArSummary] = useState("");

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch<{ place: Place }>(`/api/v1/admin/places/${params.id}`);
      const p = res.data.place;
      setPlace(p);
      setTypeLabel(p.typeLabel ?? "");
      setStatus(p.status);
      setFeatured(p.featured);
      setSortOrder(String(p.sortOrder));
      setNoIndex(p.noIndex);
      setVerificationStatus(p.verificationStatus);
      setLat(p.lat != null ? String(p.lat) : "");
      setLng(p.lng != null ? String(p.lng) : "");
      const en = p.translations.find((tr) => tr.locale === "en");
      const fr = p.translations.find((tr) => tr.locale === "fr");
      const ar = p.translations.find((tr) => tr.locale === "ar");
      setEnName(en?.name ?? "");
      setEnTypeLabel(en?.typeLabel ?? "");
      setEnSummary(en?.summary ?? "");
      setFrName(fr?.name ?? "");
      setFrTypeLabel(fr?.typeLabel ?? "");
      setFrSummary(fr?.summary ?? "");
      setArName(ar?.name ?? "");
      setArTypeLabel(ar?.typeLabel ?? "");
      setArSummary(ar?.summary ?? "");
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
      await apiFetch(`/api/v1/admin/places/${params.id}`, {
        method: "PATCH",
        body: {
          typeLabel: typeLabel || null,
          status,
          featured,
          sortOrder: Number(sortOrder),
          noIndex,
          verificationStatus,
          lat: lat ? Number(lat) : null,
          lng: lng ? Number(lng) : null,
          translations: {
            en: { name: enName, typeLabel: enTypeLabel || null, summary: enSummary || null },
            fr: frName ? { name: frName, typeLabel: frTypeLabel || null, summary: frSummary || null } : undefined,
            ar: arName ? { name: arName, typeLabel: arTypeLabel || null, summary: arSummary || null } : undefined,
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
      await apiFetch(`/api/v1/admin/places/${params.id}`, { method: "DELETE" });
      router.push(`/${locale}/admin/places`);
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

  if (!place) {
    return <div className="skeleton h-48 w-full" />;
  }

  return (
    <div className="space-y-6">
      {saveOk ? <Alert tone="success" role="status">{t(dict, "admin.settingsSaved")}</Alert> : null}
      {saveError ? <Alert tone="danger" role="alert" title={t(dict, "common.error")}>{saveError}</Alert> : null}

      <Card>
        <CardHeader
          title={place.slug}
          description={place.translations.find((tr) => tr.locale === locale)?.name ?? place.slug}
          action={<StatusBadge status={place.status} />}
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

            <Field label={t(dict, "admin.typeLabel")} htmlFor="typeLabel">
              <Input id="typeLabel" value={typeLabel} onChange={(e) => setTypeLabel(e.target.value)} maxLength={120} />
            </Field>

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

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Latitude" htmlFor="lat" hint={t(dict, "admin.coordinatesHint")}>
                <Input id="lat" type="number" step="any" min={-90} max={90} value={lat} onChange={(e) => setLat(e.target.value)} />
              </Field>
              <Field label="Longitude" htmlFor="lng" hint={t(dict, "admin.coordinatesHint")}>
                <Input id="lng" type="number" step="any" min={-180} max={180} value={lng} onChange={(e) => setLng(e.target.value)} />
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
                {t(dict, "admin.deleteConfirm", { slug: place.slug })}
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
