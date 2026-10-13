"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { fieldErrors, useRequireAuth } from "@/components/auth/helpers";
import { SkeletonList } from "@/components/provider/skeleton";
import {
  categoryLabel,
  providerErrorMessage,
  type ProviderBookable,
  type ProviderBusiness,
} from "@/components/provider/api";

const PRICING_UNITS = ["NIGHT", "PERSON", "DAY", "SERVICE"] as const;

export function ServiceFormView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { user, ready } = useRequireAuth(locale);

  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("2");
  const [pricingUnit, setPricingUnit] = useState<string>("NIGHT");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiFetch<{ business: ProviderBusiness | null }>(
        "/api/v1/provider/business",
      );
      const next = res.data.business;
      setBusiness(next);
      if (next) setPricingUnit(next.type === "ACCOMMODATION" ? "NIGHT" : "PERSON");
    } catch (err) {
      setLoadError(providerErrorMessage(err, dict));
    } finally {
      setLoaded(true);
    }
  }, [dict]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !business) return;
    setErrors({});
    setFormError(null);

    const details: Record<string, string | undefined> = {};
    if (name.trim().length < 2) details.name = t(dict, "common.required");
    const capacityValue = Number(capacity);
    if (!Number.isInteger(capacityValue) || capacityValue < 1 || capacityValue > 100) {
      details.capacity = t(dict, "provider.errors.invalidInput");
    }
    const amountValue = Number(amount);
    if (!Number.isFinite(amountValue) || amountValue <= 0) {
      details.amount = t(dict, "provider.errors.invalidInput");
    }
    if (Object.keys(details).length > 0) {
      setErrors(details);
      return;
    }

    setSaving(true);
    try {
      const res = await apiFetch<{ bookable: ProviderBookable }>("/api/v1/provider/bookables", {
        method: "POST",
        body: {
          businessId: business.id,
          category: business.type,
          name: name.trim(),
          ...(description.trim() ? { description: description.trim() } : {}),
          capacity: capacityValue,
          pricingUnit,
          amount: amountValue,
        },
      });
      router.push(`/${locale}/provider/services/${res.data.bookable.id}`);
    } catch (err) {
      const serverDetails = fieldErrors(err);
      setErrors(serverDetails);
      if (Object.keys(serverDetails).length === 0) {
        setFormError(providerErrorMessage(err, dict));
      }
    } finally {
      setSaving(false);
    }
  }

  if (!ready || !user) return null;

  if (!loaded) {
    return <SkeletonList label={t(dict, "common.loading")} rows={4} />;
  }

  if (business === null) {
    return loadError !== null ? (
      <div className="space-y-4">
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {loadError}
        </Alert>
        <Button variant="secondary" onClick={() => void load()}>
          {t(dict, "common.retry")}
        </Button>
      </div>
    ) : (
      <EmptyState
        title={t(dict, "provider.noBusiness")}
        description={t(dict, "provider.noBusinessBody")}
        action={{
          href: `/${locale}/provider/businesses/new`,
          label: t(dict, "provider.createBusiness"),
        }}
      />
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t(dict, "provider.addService")}
          description={
            <span className="flex flex-wrap items-center gap-2">
              <Badge tone="outline">{categoryLabel(dict, business.type)}</Badge>
            </span>
          }
        />
        <CardBody>
          {formError ? (
            <div className="mb-4">
              <Alert tone="danger" role="alert">
                {formError}
              </Alert>
            </div>
          ) : null}

          <form onSubmit={onSubmit} noValidate className="space-y-4">
            <Field
              label={t(dict, "provider.businessName")}
              htmlFor="service-business"
              hint={t(dict, "common.required")}
            >
              <Input id="service-business" value={business.name} readOnly />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "provider.serviceName")}
                htmlFor="service-name"
                required
                error={errors.name}
              >
                <Input
                  id="service-name"
                  name="name"
                  maxLength={160}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={saving}
                />
              </Field>

              <Field
                label={t(dict, "filters.capacity")}
                htmlFor="service-capacity"
                required
                error={errors.capacity}
              >
                <Input
                  id="service-capacity"
                  name="capacity"
                  type="number"
                  min={1}
                  max={100}
                  value={capacity}
                  onChange={(e) => setCapacity(e.target.value)}
                  disabled={saving}
                />
              </Field>
            </div>

            <Field
              label={t(dict, "provider.description")}
              htmlFor="service-description"
              hint={t(dict, "common.optional")}
              error={errors.description}
            >
              <Textarea
                id="service-description"
                name="description"
                maxLength={1000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={saving}
              />
            </Field>

            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "provider.pricingUnit")}
                htmlFor="service-unit"
                required
                error={errors.pricingUnit}
              >
                <Select
                  id="service-unit"
                  name="pricingUnit"
                  value={pricingUnit}
                  onChange={(e) => setPricingUnit(e.target.value)}
                  disabled={saving}
                >
                  {PRICING_UNITS.map((unit) => (
                    <option key={unit} value={unit}>
                      {t(dict, `provider.pricingUnits.${unit}`)}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field
                label={t(dict, "provider.price")}
                htmlFor="service-amount"
                required
                error={errors.amount}
              >
                <Input
                  id="service-amount"
                  name="amount"
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  disabled={saving}
                />
              </Field>
            </div>

            <div className="flex flex-wrap justify-between gap-3">
              <ButtonLink href={`/${locale}/provider/services`} variant="ghost">
                {t(dict, "common.back")}
              </ButtonLink>
              <Button type="submit" loading={saving}>
                {t(dict, "provider.addService")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
