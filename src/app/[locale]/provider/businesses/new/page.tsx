"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ApiClientError } from "@/lib/api/client";

export default function ProviderBusinessNew() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState<"ACCOMMODATION" | "GUIDE">("ACCOMMODATION");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [description, setDescription] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await apiFetch<{ business: { id: string } }>("/api/v1/provider/business", {
        method: "POST",
        body: {
          name,
          type,
          email: email || undefined,
          phone: phone || undefined,
          address: address || undefined,
          description: description || undefined,
        },
      });
      router.push(`/${locale}/provider/businesses/${res.data.business.id}`);
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
      <CardHeader title={t(dict, "provider.createBusiness")} />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          {formError ? (
            <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
              {formError}
            </Alert>
          ) : null}

          <Field label={t(dict, "provider.businessName")} htmlFor="name" required error={errors.name}>
            <Input
              id="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              minLength={2}
              maxLength={160}
            />
          </Field>

          <Field label={t(dict, "provider.businessType")} htmlFor="type" required>
            <Select
              id="type"
              value={type}
              onChange={(e) => setType(e.target.value as "ACCOMMODATION" | "GUIDE")}
            >
              <option value="ACCOMMODATION">{t(dict, "admin.businessTypes.ACCOMMODATION")}</option>
              <option value="GUIDE">{t(dict, "admin.businessTypes.GUIDE")}</option>
            </Select>
          </Field>

          <Field label={t(dict, "common.email")} htmlFor="email" error={errors.email}>
            <Input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </Field>

          <Field label={t(dict, "common.phone")} htmlFor="phone" error={errors.phone}>
            <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={40} />
          </Field>

          <Field label={t(dict, "provider.address")} htmlFor="address" error={errors.address}>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              maxLength={300}
            />
          </Field>

          <Field label={t(dict, "provider.description")} htmlFor="description" error={errors.description}>
            <Textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={2000}
            />
          </Field>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? t(dict, "common.loading") : t(dict, "provider.createBusiness")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
