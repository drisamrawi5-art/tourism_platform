"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/field";
import { ApiClientError } from "@/lib/api/client";

export default function ProviderServiceNew() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const router = useRouter();
  const [category, setCategory] = useState<"ACCOMMODATION" | "GUIDE">("ACCOMMODATION");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("2");
  const [pricingUnit, setPricingUnit] = useState<"NIGHT" | "PERSON" | "DAY" | "SERVICE">("NIGHT");
  const [amount, setAmount] = useState("");
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await apiFetch<{ bookable: { id: string } }>("/api/v1/provider/bookables", {
        method: "POST",
        body: {
          category,
          name,
          description: description || undefined,
          capacity: Number(capacity),
          pricingUnit,
          amount: Number(amount),
        },
      });
      router.push(`/${locale}/provider/services/${res.data.bookable.id}`);
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
      <CardHeader title={t(dict, "provider.addService")} />
      <CardBody>
        <form onSubmit={submit} className="space-y-4">
          {formError ? (
            <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
              {formError}
            </Alert>
          ) : null}

          <Field label={t(dict, "provider.businessType")} htmlFor="category" required>
            <Select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value as "ACCOMMODATION" | "GUIDE")}
            >
              <option value="ACCOMMODATION">{t(dict, "admin.businessTypes.ACCOMMODATION")}</option>
              <option value="GUIDE">{t(dict, "admin.businessTypes.GUIDE")}</option>
            </Select>
          </Field>

          <Field label={t(dict, "provider.serviceName")} htmlFor="name" required error={errors.name}>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} maxLength={160} />
          </Field>

          <Field label={t(dict, "provider.description")} htmlFor="description" error={errors.description}>
            <Input id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={1000} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-3">
            <Field label={t(dict, "provider.pricingUnit")} htmlFor="pricingUnit" required>
              <Select
                id="pricingUnit"
                value={pricingUnit}
                onChange={(e) => setPricingUnit(e.target.value as "NIGHT" | "PERSON" | "DAY" | "SERVICE")}
              >
                <option value="NIGHT">{t(dict, "provider.pricingUnits.NIGHT")}</option>
                <option value="PERSON">{t(dict, "provider.pricingUnits.PERSON")}</option>
                <option value="DAY">{t(dict, "provider.pricingUnits.DAY")}</option>
                <option value="SERVICE">{t(dict, "provider.pricingUnits.SERVICE")}</option>
              </Select>
            </Field>
            <Field label={t(dict, "provider.price")} htmlFor="amount" required error={errors.amount}>
              <Input
                id="amount"
                type="number"
                min={1}
                max={999999}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                required
              />
            </Field>
            <Field label={t(dict, "provider.availabilityRule")} htmlFor="capacity" error={errors.capacity}>
              <Input
                id="capacity"
                type="number"
                min={1}
                max={100}
                value={capacity}
                onChange={(e) => setCapacity(e.target.value)}
              />
            </Field>
          </div>

          <div className="flex gap-3 pt-2">
            <Button type="submit" disabled={saving}>
              {saving ? t(dict, "common.loading") : t(dict, "provider.addService")}
            </Button>
          </div>
        </form>
      </CardBody>
    </Card>
  );
}
