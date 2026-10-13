"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatMoney } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { ApiClientError } from "@/lib/api/client";

type Bookable = {
  id: string;
  slug: string;
  category: string;
  status: string;
  capacity: number;
  unit?: { name: string; description: string | null; capacity: number | null } | null;
  guideService?: { name: string; description: string | null } | null;
  business: { id: string; name: string; slug: string; status: string };
  prices: Array<{ id: string; unit: string; amount: string; currency: string; active: boolean; validFrom: string | null; validTo: string | null; priority: number }>;
};

type Price = { id: string; unit: string; amount: string; validFrom: string | null; validTo: string | null; priority: number; active: boolean };
type Rule = { id: string; startDate: string; endDate: string | null; weekday: number | null; capacity: number };
type Block = { id: string; startDate: string; endDate: string; state: string; capacityOverride: number | null; reason: string | null };

export default function ProviderServiceManage() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const params = useParams<{ id: string }>();
  const [bookable, setBookable] = useState<Bookable | null>(null);
  const [prices, setPrices] = useState<Price[]>([]);
  const [rules, setRules] = useState<Rule[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [error, setError] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"prices" | "rules" | "blocks">("prices");

  // Price form
  const [priceUnit, setPriceUnit] = useState<"NIGHT" | "PERSON" | "DAY" | "SERVICE">("NIGHT");
  const [priceAmount, setPriceAmount] = useState("");
  const [priceFrom, setPriceFrom] = useState("");
  const [priceTo, setPriceTo] = useState("");

  // Rule form
  const [ruleStart, setRuleStart] = useState("");
  const [ruleEnd, setRuleEnd] = useState("");
  const [ruleWeekday, setRuleWeekday] = useState("");
  const [ruleCapacity, setRuleCapacity] = useState("10");

  // Block form
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockState, setBlockState] = useState<"AVAILABLE" | "UNAVAILABLE" | "BLOCKED" | "BOOKED">("UNAVAILABLE");
  const [blockReason, setBlockReason] = useState("");

  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch<{ bookable: Bookable }>(`/api/v1/provider/bookables/${params.id}`);
      setBookable(res.data.bookable);
      const [pr, ru, bl] = await Promise.all([
        apiFetch<{ prices: Price[] }>(`/api/v1/provider/bookables/${params.id}/prices`),
        apiFetch<{ rules: Rule[] }>(`/api/v1/provider/bookables/${params.id}/rules`),
        apiFetch<{ blocks: Block[] }>(`/api/v1/provider/bookables/${params.id}/blocks`),
      ]);
      setPrices(pr.data.prices);
      setRules(ru.data.rules);
      setBlocks(bl.data.blocks);
    } catch {
      setError(true);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const savePrices = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/provider/bookables/${params.id}/prices`, {
        method: "PUT",
        body: {
          prices: [
            {
              unit: priceUnit,
              amount: Number(priceAmount),
              validFrom: priceFrom || null,
              validTo: priceTo || null,
              priority: 0,
              active: true,
            },
          ],
        },
      });
      setNotice(t(dict, "admin.settingsSaved"));
      setPriceAmount("");
      setPriceFrom("");
      setPriceTo("");
      await load();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setSaving(false);
    }
  };

  const saveRules = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/provider/bookables/${params.id}/rules`, {
        method: "PUT",
        body: {
          rules: [
            {
              startDate: ruleStart,
              endDate: ruleEnd || null,
              weekday: ruleWeekday ? Number(ruleWeekday) : null,
              capacity: Number(ruleCapacity),
            },
          ],
        },
      });
      setNotice(t(dict, "admin.settingsSaved"));
      setRuleStart("");
      setRuleEnd("");
      setRuleWeekday("");
      await load();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setSaving(false);
    }
  };

  const addBlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/provider/bookables/${params.id}/blocks`, {
        method: "POST",
        body: {
          startDate: blockStart,
          endDate: blockEnd,
          state: blockState,
          reason: blockReason || null,
        },
      });
      setNotice(t(dict, "admin.settingsSaved"));
      setBlockStart("");
      setBlockEnd("");
      setBlockReason("");
      await load();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setSaving(false);
    }
  };

  const removeBlock = async (blockId: string) => {
    setNotice(null);
    try {
      await apiFetch(`/api/v1/provider/bookables/${params.id}/blocks/${blockId}`, { method: "DELETE" });
      await load();
    } catch (err) {
      setNotice(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    }
  };

  if (error) {
    return (
      <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
        {t(dict, "errors.serverErrorBody")}
      </Alert>
    );
  }

  if (!bookable) {
    return <div className="skeleton h-48 w-full" />;
  }

  const name = bookable.unit?.name ?? bookable.guideService?.name ?? bookable.slug;

  return (
    <div className="space-y-6">
      {notice ? (
        <Alert tone="info" role="status">
          {notice}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={name}
          description={`${bookable.slug} · ${bookable.category}`}
          action={<StatusBadge status={bookable.status} />}
        />
        <CardBody>
          <div className="flex gap-1 border-b border-rocky-200">
            {(["prices", "rules", "blocks"] as const).map((key) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                aria-current={tab === key ? "page" : undefined}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium ${
                  tab === key
                    ? "border-forest-600 text-forest-800"
                    : "border-transparent text-rocky-600 hover:text-rocky-800"
                }`}
              >
                {t(dict, `provider.${key === "prices" ? "pricing" : key === "rules" ? "availability" : "blockDates"}`)}
              </button>
            ))}
          </div>

          <div className="pt-6">
            {tab === "prices" ? (
              <div className="space-y-6">
                {prices.length > 0 ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>{t(dict, "provider.pricingUnit")}</TH>
                        <TH>{t(dict, "provider.price")}</TH>
                        <TH>{t(dict, "admin.createdAt")}</TH>
                        <TH>{t(dict, "admin.status")}</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {prices.map((p) => (
                        <TR key={p.id}>
                          <TD>{t(dict, `provider.pricingUnits.${p.unit}`)}</TD>
                          <TD className="tabular-nums">
                            {formatMoney(p.amount, "MAD", locale)}
                            {p.validFrom ? ` · ${p.validFrom}` : ""}
                            {p.validTo ? ` → ${p.validTo}` : ""}
                          </TD>
                          <TD>{p.validFrom ?? "—"}</TD>
                          <TD>
                            <StatusBadge status={p.active ? "ACTIVE" : "INACTIVE"} />
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                ) : null}

                <form onSubmit={savePrices} className="space-y-4 border-t border-rocky-100 pt-4">
                  <h3 className="text-sm font-semibold text-rocky-800">{t(dict, "provider.pricing")}</h3>
                  <div className="grid gap-4 sm:grid-cols-3">
                    <Field label={t(dict, "provider.pricingUnit")} htmlFor="priceUnit" required>
                      <Select
                        id="priceUnit"
                        value={priceUnit}
                        onChange={(e) => setPriceUnit(e.target.value as "NIGHT" | "PERSON" | "DAY" | "SERVICE")}
                      >
                        <option value="NIGHT">{t(dict, "provider.pricingUnits.NIGHT")}</option>
                        <option value="PERSON">{t(dict, "provider.pricingUnits.PERSON")}</option>
                        <option value="DAY">{t(dict, "provider.pricingUnits.DAY")}</option>
                        <option value="SERVICE">{t(dict, "provider.pricingUnits.SERVICE")}</option>
                      </Select>
                    </Field>
                    <Field label={t(dict, "provider.price")} htmlFor="priceAmount" required>
                      <Input
                        id="priceAmount"
                        type="number"
                        min={1}
                        max={999999}
                        step="0.01"
                        value={priceAmount}
                        onChange={(e) => setPriceAmount(e.target.value)}
                        required
                      />
                    </Field>
                    <Field label={t(dict, "provider.currency")} htmlFor="currency">
                      <Input id="currency" value="MAD" disabled />
                    </Field>
                    <Field label={t(dict, "admin.createdAt")} htmlFor="priceFrom">
                      <Input
                        id="priceFrom"
                        type="date"
                        value={priceFrom}
                        onChange={(e) => setPriceFrom(e.target.value)}
                      />
                    </Field>
                    <Field label={t(dict, "admin.publishedAt")} htmlFor="priceTo">
                      <Input
                        id="priceTo"
                        type="date"
                        value={priceTo}
                        onChange={(e) => setPriceTo(e.target.value)}
                      />
                    </Field>
                  </div>
                  <Button type="submit" disabled={saving}>
                    {saving ? t(dict, "common.loading") : t(dict, "common.save")}
                  </Button>
                </form>
              </div>
            ) : null}

            {tab === "rules" ? (
              <div className="space-y-6">
                {rules.length > 0 ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>{t(dict, "admin.createdAt")}</TH>
                        <TH>{t(dict, "admin.publishedAt")}</TH>
                        <TH>{t(dict, "provider.availabilityRule")}</TH>
                      </TR>
                    </THead>
                    <tbody>
                      {rules.map((r) => (
                        <TR key={r.id}>
                          <TD>{r.startDate}</TD>
                          <TD>{r.endDate ?? "—"}</TD>
                          <TD>{r.capacity}</TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                ) : null}

                <form onSubmit={saveRules} className="space-y-4 border-t border-rocky-100 pt-4">
                  <h3 className="text-sm font-semibold text-rocky-800">{t(dict, "provider.setAvailability")}</h3>
                  <div className="grid gap-4 sm:grid-cols-4">
                    <Field label={t(dict, "admin.createdAt")} htmlFor="ruleStart" required>
                      <Input id="ruleStart" type="date" value={ruleStart} onChange={(e) => setRuleStart(e.target.value)} required />
                    </Field>
                    <Field label={t(dict, "admin.publishedAt")} htmlFor="ruleEnd">
                      <Input id="ruleEnd" type="date" value={ruleEnd} onChange={(e) => setRuleEnd(e.target.value)} />
                    </Field>
                    <Field label={t(dict, "provider.availabilityRule")} htmlFor="ruleWeekday">
                      <Select id="ruleWeekday" value={ruleWeekday} onChange={(e) => setRuleWeekday(e.target.value)}>
                        <option value="">{t(dict, "common.all")}</option>
                        {["0", "1", "2", "3", "4", "5", "6"].map((d) => (
                          <option key={d} value={d}>
                            {d}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field label={t(dict, "provider.availabilityRule")} htmlFor="ruleCapacity" required>
                      <Input
                        id="ruleCapacity"
                        type="number"
                        min={0}
                        max={10000}
                        value={ruleCapacity}
                        onChange={(e) => setRuleCapacity(e.target.value)}
                        required
                      />
                    </Field>
                  </div>
                  <Button type="submit" disabled={saving}>
                    {saving ? t(dict, "common.loading") : t(dict, "common.save")}
                  </Button>
                </form>
              </div>
            ) : null}

            {tab === "blocks" ? (
              <div className="space-y-6">
                {blocks.length > 0 ? (
                  <Table>
                    <THead>
                      <TR>
                        <TH>{t(dict, "admin.createdAt")}</TH>
                        <TH>{t(dict, "admin.publishedAt")}</TH>
                        <TH>{t(dict, "admin.status")}</TH>
                        <TH>{t(dict, "provider.blockReason")}</TH>
                        <TH />
                      </TR>
                    </THead>
                    <tbody>
                      {blocks.map((b) => (
                        <TR key={b.id}>
                          <TD>{b.startDate}</TD>
                          <TD>{b.endDate}</TD>
                          <TD>
                            <StatusBadge status={b.state} />
                          </TD>
                          <TD>{b.reason ?? "—"}</TD>
                          <TD align="end">
                            <button
                              onClick={() => removeBlock(b.id)}
                              className="text-sm font-medium text-danger-600 underline underline-offset-2 hover:text-danger-700"
                            >
                              {t(dict, "admin.delete")}
                            </button>
                          </TD>
                        </TR>
                      ))}
                    </tbody>
                  </Table>
                ) : null}

                <form onSubmit={addBlock} className="space-y-4 border-t border-rocky-100 pt-4">
                  <h3 className="text-sm font-semibold text-rocky-800">{t(dict, "provider.blockDates")}</h3>
                  <div className="grid gap-4 sm:grid-cols-4">
                    <Field label={t(dict, "admin.createdAt")} htmlFor="blockStart" required>
                      <Input id="blockStart" type="date" value={blockStart} onChange={(e) => setBlockStart(e.target.value)} required />
                    </Field>
                    <Field label={t(dict, "admin.publishedAt")} htmlFor="blockEnd" required>
                      <Input id="blockEnd" type="date" value={blockEnd} onChange={(e) => setBlockEnd(e.target.value)} required />
                    </Field>
                    <Field label={t(dict, "admin.status")} htmlFor="blockState" required>
                      <Select
                        id="blockState"
                        value={blockState}
                        onChange={(e) => setBlockState(e.target.value as "AVAILABLE" | "UNAVAILABLE" | "BLOCKED" | "BOOKED")}
                      >
                        <option value="UNAVAILABLE">UNAVAILABLE</option>
                        <option value="BLOCKED">BLOCKED</option>
                        <option value="AVAILABLE">AVAILABLE</option>
                        <option value="BOOKED">BOOKED</option>
                      </Select>
                    </Field>
                    <Field label={t(dict, "provider.blockReason")} htmlFor="blockReason">
                      <Input id="blockReason" value={blockReason} onChange={(e) => setBlockReason(e.target.value)} maxLength={200} />
                    </Field>
                  </div>
                  <Button type="submit" disabled={saving}>
                    {saving ? t(dict, "common.loading") : t(dict, "provider.blockDates")}
                  </Button>
                </form>
              </div>
            ) : null}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
