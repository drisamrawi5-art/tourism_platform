"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Button, ButtonLink } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { fieldErrors, useRequireAuth } from "@/components/auth/helpers";
import {
  categoryLabel,
  providerErrorMessage,
  type ProviderBusiness,
} from "@/components/provider/api";

/** V1 business creation (POST /api/v1/provider/business) accepts two types. */
const BUSINESS_TYPES = ["ACCOMMODATION", "GUIDE"] as const;

export function BusinessFormView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { ready } = useRequireAuth(locale);

  const [type, setType] = useState<string>(BUSINESS_TYPES[0]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    setErrors({});
    setFormError(null);
    setSaving(true);
    try {
      const res = await apiFetch<{ business: ProviderBusiness }>("/api/v1/provider/business", {
        method: "POST",
        body: {
          name: name.trim(),
          type,
          ...(email.trim() ? { email: email.trim() } : {}),
          ...(phone.trim() ? { phone: phone.trim() } : {}),
          ...(address.trim() ? { address: address.trim() } : {}),
          ...(description.trim() ? { description: description.trim() } : {}),
        },
      });
      router.push(`/${locale}/provider/businesses/${res.data.business.id}`);
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

  if (!ready) return null;

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={t(dict, "provider.createBusiness")}
          description={t(dict, "provider.noBusinessBody")}
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
            <div className="grid gap-4 sm:grid-cols-2">
              <Field
                label={t(dict, "provider.businessType")}
                htmlFor="business-type"
                required
                error={errors.type}
              >
                <Select
                  id="business-type"
                  name="type"
                  value={type}
                  onChange={(e) => setType(e.target.value)}
                  disabled={saving}
                >
                  {BUSINESS_TYPES.map((option) => (
                    <option key={option} value={option}>
                      {categoryLabel(dict, option)}
                    </option>
                  ))}
                </Select>
              </Field>

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
                  autoComplete="email"
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

            <div className="flex flex-wrap justify-between gap-3">
              <ButtonLink href={`/${locale}/provider/businesses`} variant="ghost">
                {t(dict, "common.back")}
              </ButtonLink>
              <Button type="submit" loading={saving}>
                {t(dict, "provider.createBusiness")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>
    </div>
  );
}
