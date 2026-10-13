"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, LoadingBlock } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { fieldErrors, formError, useRequireAuth } from "@/components/auth/helpers";
import {
  BusinessStatusNotice,
  ErrorAlert,
  SubmitForReviewButton,
  categoryLabel,
} from "@/components/provider/ui";
import type {
  CreateableBusinessType,
  ProviderBusiness,
  ProviderBusinessConfig,
} from "@/components/provider/types";

/**
 * Own business profile.
 *
 * - No business yet → POST /api/v1/provider/business (create form).
 * - Existing → PATCH /api/v1/provider/business/[id] (profile + booking
 *   settings) plus POST …/submit for the DRAFT/REJECTED → PENDING_REVIEW
 *   workflow transition.
 *
 * `email` is optional and non-nullable in the API: clearing the field keeps
 * the stored address (the value is never sent as an empty string).
 */
export function BusinessView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { ready } = useRequireAuth(locale);

  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [populatedFor, setPopulatedFor] = useState<string | null>(null);

  // Shared profile fields (create + edit)
  const [name, setName] = useState("");
  const [businessType, setBusinessType] = useState<CreateableBusinessType>("ACCOMMODATION");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");

  // Booking settings (edit only)
  const [depositEnabled, setDepositEnabled] = useState(false);
  const [depositPercent, setDepositPercent] = useState("");
  const [cancellationText, setCancellationText] = useState("");

  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [banner, setBanner] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [submitInfo, setSubmitInfo] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiFetch<{ business: ProviderBusiness | null }>(
        "/api/v1/provider/business",
      );
      setBusiness(res.data.business);
    } catch (err) {
      setError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Seed the edit form once per business (never clobber unsaved edits on
  // unrelated state updates such as the submit-for-review merge).
  useEffect(() => {
    if (!business || populatedFor === business.id) return;
    const translation =
      business.translations?.find((row) => row.locale === locale) ??
      business.translations?.[0];
    const cfg: ProviderBusinessConfig = business.config ?? {};
    setName(business.name);
    setEmail(business.email ?? "");
    setPhone(business.phone ?? "");
    setAddress(business.address ?? "");
    setDescription(translation?.description ?? "");
    setDepositEnabled(cfg.depositEnabled ?? false);
    setDepositPercent(cfg.depositPercent != null ? String(cfg.depositPercent) : "");
    setCancellationText(cfg.cancellationPolicyText ?? "");
    setPopulatedFor(business.id);
  }, [business, populatedFor, locale]);

  function validateProfile(): Record<string, string | undefined> {
    const errs: Record<string, string | undefined> = {};
    if (name.trim().length < 2) errs.name = t(dict, "common.required");
    if (business) {
      const percent = Number(depositPercent);
      if (
        depositPercent.trim() &&
        (!Number.isFinite(percent) || percent < 1 || percent > 100)
      ) {
        errs["config.depositPercent"] = t(dict, "common.error");
      }
    }
    return errs;
  }

  async function onCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const errs = validateProfile();
    setErrors(errs);
    setBanner(null);
    setSaved(false);
    if (Object.values(errs).some(Boolean)) return;

    setSaving(true);
    try {
      const res = await apiFetch<{ business: ProviderBusiness }>("/api/v1/provider/business", {
        method: "POST",
        body: {
          name: name.trim(),
          type: businessType,
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      });
      setBusiness(res.data.business);
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.details ?? {}).length > 0) {
        setErrors(fieldErrors(err));
      }
      setBanner(formError(err, dict));
    } finally {
      setSaving(false);
    }
  }

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !business) return;
    const errs = validateProfile();
    setErrors(errs);
    setBanner(null);
    setSaved(false);
    if (Object.values(errs).some(Boolean)) return;

    setSaving(true);
    try {
      const res = await apiFetch<{ business: ProviderBusiness }>(
        `/api/v1/provider/business/${business.id}`,
        {
          method: "PATCH",
          body: {
            name: name.trim(),
            phone: phone.trim() || null,
            ...(email.trim() ? { email: email.trim() } : {}),
            address: address.trim() || null,
            description: description.trim() || null,
            config: {
              depositEnabled,
              ...(depositPercent.trim() ? { depositPercent: Number(depositPercent) } : {}),
              cancellationPolicyText: cancellationText,
            },
          },
        },
      );
      const updated = res.data.business;
      setBusiness((prev) => (prev ? { ...prev, ...updated } : updated));
      // The stored email may differ from a cleared field (it is never cleared
      // server-side), so mirror the authoritative value back.
      setEmail(updated.email ?? "");
      setSaved(true);
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.details ?? {}).length > 0) {
        setErrors(fieldErrors(err));
      }
      setBanner(formError(err, dict));
    } finally {
      setSaving(false);
    }
  }

  if (!ready) return null;
  if (loading) return <LoadingBlock text={t(dict, "common.loading")} />;
  if (error !== null) return <ErrorAlert dict={dict} error={error} onRetry={() => void load()} />;

  if (business === null) {
    return (
      <form onSubmit={onCreate} noValidate className="space-y-6">
        <Card>
          <CardHeader
            title={t(dict, "provider.createBusiness")}
            description={t(dict, "auth.providerNote")}
          />
          <CardBody className="space-y-4">
            {banner ? (
              <Alert tone="danger" role="alert">
                {banner}
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "provider.businessName")}
                htmlFor="business-name"
                required
                error={errors.name}
              >
                <Input
                  id="business-name"
                  name="name"
                  autoComplete="organization"
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </Field>

              <Field
                label={t(dict, "provider.businessType")}
                htmlFor="business-type"
                required
                error={errors.type}
              >
                <Select
                  id="business-type"
                  name="type"
                  value={businessType}
                  onChange={(e) => setBusinessType(e.target.value as CreateableBusinessType)}
                  disabled={saving}
                >
                  <option value="ACCOMMODATION">{t(dict, "plan.staySection")}</option>
                  <option value="GUIDE">{t(dict, "plan.guidesSection")}</option>
                </Select>
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "booking.email")}
                htmlFor="business-email"
                hint={t(dict, "common.optional")}
                error={errors.email}
              >
                <Input
                  id="business-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={200}
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
                  autoComplete="tel"
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
                autoComplete="street-address"
                maxLength={300}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
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

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                {t(dict, "provider.createBusiness")}
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>
    );
  }

  const canSubmit = business.status === "DRAFT" || business.status === "REJECTED";

  return (
    <div className="space-y-6">
      {/* Status + workflow */}
      <Card>
        <CardHeader
          title={business.name}
          description={categoryLabel(dict, business.type)}
          action={<StatusBadge status={business.status} />}
        />
        <CardBody className="space-y-4">
          {canSubmit ? (
            <BusinessStatusNotice
              dict={dict}
              status={business.status}
              action={
                <SubmitForReviewButton
                  dict={dict}
                  businessId={business.id}
                  onSubmitted={(updated) => {
                    setBusiness((prev) => (prev ? { ...prev, ...updated } : updated));
                    setSubmitInfo(t(dict, "provider.submitted"));
                  }}
                />
              }
            />
          ) : (
            <BusinessStatusNotice dict={dict} status={business.status} />
          )}
          {submitInfo ? (
            <Alert tone="success" role="status">
              {submitInfo}
            </Alert>
          ) : null}
        </CardBody>
      </Card>

      <form onSubmit={onSave} noValidate className="space-y-6">
        {/* Profile */}
        <Card>
          <CardHeader title={t(dict, "account.profile")} />
          <CardBody className="space-y-4">
            {saved ? (
              <Alert tone="success" role="status">
                {t(dict, "account.saved")}
              </Alert>
            ) : null}
            {banner ? (
              <Alert tone="danger" role="alert">
                {banner}
              </Alert>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "provider.businessName")}
                htmlFor="business-name"
                required
                error={errors.name}
              >
                <Input
                  id="business-name"
                  name="name"
                  autoComplete="organization"
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </Field>

              <Field
                label={t(dict, "booking.email")}
                htmlFor="business-email"
                error={errors.email}
              >
                <Input
                  id="business-email"
                  name="email"
                  type="email"
                  autoComplete="email"
                  maxLength={200}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={saving}
                />
              </Field>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
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
                  autoComplete="tel"
                  maxLength={40}
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={saving}
                />
              </Field>

              <Field
                label={t(dict, "provider.address")}
                htmlFor="business-address"
                hint={t(dict, "common.optional")}
                error={errors.address}
              >
                <Input
                  id="business-address"
                  name="address"
                  autoComplete="street-address"
                  maxLength={300}
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  disabled={saving}
                />
              </Field>
            </div>

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
          </CardBody>
        </Card>

        {/* Booking settings */}
        <Card>
          <CardHeader title={t(dict, "provider.settings")} />
          <CardBody className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "provider.depositEnabled")}
                htmlFor="business-deposit-enabled"
                error={errors["config.depositEnabled"]}
              >
                <Select
                  id="business-deposit-enabled"
                  value={depositEnabled ? "1" : "0"}
                  onChange={(e) => setDepositEnabled(e.target.value === "1")}
                  disabled={saving}
                >
                  <option value="1">{t(dict, "admin.flagEnabled")}</option>
                  <option value="0">{t(dict, "admin.flagDisabled")}</option>
                </Select>
              </Field>

              <Field
                label={t(dict, "provider.depositPercent")}
                htmlFor="business-deposit-percent"
                hint={t(dict, "common.optional")}
                error={errors["config.depositPercent"] ?? errors.depositPercent}
              >
                <Input
                  id="business-deposit-percent"
                  name="depositPercent"
                  type="number"
                  min={1}
                  max={100}
                  step={1}
                  value={depositPercent}
                  onChange={(e) => setDepositPercent(e.target.value)}
                  disabled={saving}
                />
              </Field>
            </div>

            <Field
              label={t(dict, "provider.cancellationText")}
              htmlFor="business-cancellation"
              hint={t(dict, "common.optional")}
              error={errors["config.cancellationPolicyText"]}
            >
              <Textarea
                id="business-cancellation"
                name="cancellationPolicyText"
                maxLength={2000}
                value={cancellationText}
                onChange={(e) => setCancellationText(e.target.value)}
                disabled={saving}
              />
            </Field>

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                {t(dict, "account.saveChanges")}
              </Button>
            </div>
          </CardBody>
        </Card>
      </form>

      {business.bookables && business.bookables.length > 0 ? (
        <Card>
          <CardHeader title={t(dict, "provider.services")} />
          <CardBody>
            <ul className="divide-y divide-rocky-100">
              {business.bookables.map((bookable) => (
                <li
                  key={bookable.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                >
                  <Link
                    href={`/${locale}/provider/services/${bookable.id}`}
                    className="font-medium text-water-700 underline-offset-2 hover:underline"
                  >
                    {bookable.slug}
                  </Link>
                  <StatusBadge status={bookable.status} />
                </li>
              ))}
            </ul>
          </CardBody>
        </Card>
      ) : null}
    </div>
  );
}
