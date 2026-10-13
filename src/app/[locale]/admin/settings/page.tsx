"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert } from "@/components/ui/alert";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { ApiClientError } from "@/lib/api/client";

type Settings = Record<string, unknown>;
type Flag = { key: string; enabled: boolean };

const SETTING_LABELS: Record<string, string> = {
  "commission.default.ratePercent": "Commission rate (%)",
  "commission.ACCOMMODATION.ratePercent": "Commission — Accommodation (%)",
  "commission.GUIDE.ratePercent": "Commission — Guide (%)",
  "deposit.default.enabled": "Deposit enabled (default)",
  "deposit.default.percent": "Deposit percent (default)",
  "deposit.ACCOMMODATION.enabled": "Deposit enabled — Accommodation",
  "deposit.ACCOMMODATION.percent": "Deposit percent — Accommodation",
  "deposit.GUIDE.enabled": "Deposit enabled — Guide",
  "deposit.GUIDE.percent": "Deposit percent — Guide",
  "booking.holdMinutes": "Booking hold (minutes)",
  "review.eligibility.windowDays": "Review window (days)",
  "booking.autoCompleteDays": "Auto-complete (days)",
  "media.maxImageBytes": "Max image size (bytes)",
  "media.maxVideoBytes": "Max video size (bytes)",
  "media.allowedImageTypes": "Allowed image types",
  "media.allowedVideoTypes": "Allowed video types",
  "seo.titleTemplate": "SEO title template",
  "seo.defaultOgAlt": "Default OG alt",
  "currency.default": "Default currency",
};

const FLAG_LABELS: Record<string, string> = {
  AI_CONCIERGE: "AI Concierge",
  RESTAURANTS: "Restaurants",
  EXPERIENCES: "Experiences",
  EVENTS: "Events",
  TRANSPORT: "Transport",
  MULTI_DESTINATION: "Multi-destination",
  PROMOTED_LISTINGS: "Promoted listings",
  MOBILE_APP: "Mobile app",
};

export default function AdminSettings() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [settings, setSettings] = useState<Settings>({});
  const [flags, setFlags] = useState<Flag[]>([]);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saveKey, setSaveKey] = useState<string | null>(null);
  const [saveValue, setSaveValue] = useState<string>("");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveOk, setSaveOk] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    setLoading(true);
    try {
      const [s, f] = await Promise.all([
        apiFetch<{ settings: Settings }>("/api/v1/admin/settings"),
        apiFetch<{ flags: Flag[] }>("/api/v1/admin/flags"),
      ]);
      setSettings(s.data.settings);
      setFlags(f.data.flags);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const saveSetting = async (key: string) => {
    setSaving(true);
    setSaveError(null);
    setSaveOk(false);
    try {
      const current = settings[key];
      let value: unknown;
      if (typeof current === "boolean") {
        value = saveValue === "true";
      } else if (typeof current === "number" || key.endsWith(".percent") || key.endsWith("Bytes") || key.endsWith("Days") || key.endsWith("Minutes")) {
        value = saveValue === "" || saveValue === "null" ? null : Number(saveValue);
      } else if (Array.isArray(current)) {
        value = saveValue.split(",").map((s) => s.trim()).filter(Boolean);
      } else {
        value = saveValue;
      }
      const res = await apiFetch<{ settings: Settings }>("/api/v1/admin/settings", {
        method: "PUT",
        body: { key, value },
      });
      setSettings(res.data.settings);
      setSaveOk(true);
      setSaveKey(null);
      setSaveValue("");
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
      setSaving(false);
    }
  };

  const toggleFlag = async (key: string, enabled: boolean) => {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiFetch<{ flags: Flag[] }>("/api/v1/admin/flags", {
        method: "PUT",
        body: { key, enabled },
      });
      setFlags(res.data.flags);
    } catch (err) {
      setSaveError(err instanceof ApiClientError ? err.message : t(dict, "errors.serverErrorBody"));
    } finally {
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

  if (loading) {
    return <div className="skeleton h-48 w-full" />;
  }

  return (
    <div className="space-y-6">
      {saveOk ? <Alert tone="success" role="status">{t(dict, "admin.settingsSaved")}</Alert> : null}
      {saveError ? <Alert tone="danger" role="alert" title={t(dict, "common.error")}>{saveError}</Alert> : null}

      <Card>
        <CardHeader title={t(dict, "admin.settings")} />
        <CardBody className="space-y-4">
          {Object.entries(settings)
            .filter(([key]) => !key.startsWith("homepage."))
            .map(([key, value]) => {
            const label = SETTING_LABELS[key] ?? key;
            const isEditing = saveKey === key;
            return (
              <div key={key} className="border-b border-rocky-100 pb-4 last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-rocky-800">{label}</p>
                    <p className="text-xs text-rocky-500">
                      <code>{key}</code>
                    </p>
                  </div>
                  {isEditing ? (
                    <div className="flex items-center gap-2">
                      {typeof value === "boolean" ? (
                        <Select
                          value={saveValue}
                          onChange={(e) => setSaveValue(e.target.value)}
                          className="h-9 w-24"
                        >
                          <option value="true">true</option>
                          <option value="false">false</option>
                        </Select>
                      ) : (
                        <Input
                          value={saveValue}
                          onChange={(e) => setSaveValue(e.target.value)}
                          className="h-9 w-40"
                        />
                      )}
                      <Button onClick={() => saveSetting(key)} disabled={saving}>
                        {t(dict, "common.save")}
                      </Button>
                      <Button onClick={() => { setSaveKey(null); setSaveValue(""); }} variant="ghost" disabled={saving}>
                        {t(dict, "common.cancel")}
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-sm tabular-nums text-rocky-700">
                        {Array.isArray(value) ? value.join(", ") : String(value)}
                      </span>
                      <Button
                        onClick={() => {
                          setSaveKey(key);
                          setSaveValue(Array.isArray(value) ? value.join(", ") : value === null ? "null" : String(value));
                        }}
                        variant="secondary"
                      >
                        {t(dict, "admin.edit")}
                      </Button>
                    </div>
                  )}
                </div>
                {key.startsWith("deposit.") ? (
                  <p className="mt-1 text-xs text-rocky-500">{t(dict, "admin.depositChain")}</p>
                ) : null}
                {key.startsWith("commission.") ? (
                  <p className="mt-1 text-xs text-rocky-500">{t(dict, "admin.commissionChain")}</p>
                ) : null}
              </div>
            );
          })}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.featureFlags")} description={t(dict, "admin.flagsNote")} />
        <CardBody className="space-y-3">
          {flags.map((f) => (
            <label key={f.key} className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-medium text-rocky-800">{FLAG_LABELS[f.key] ?? f.key}</p>
                <p className="text-xs text-rocky-500">
                  <code>{f.key}</code>
                </p>
              </div>
              <button
                role="switch"
                aria-checked={f.enabled}
                onClick={() => toggleFlag(f.key, !f.enabled)}
                disabled={saving}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  f.enabled ? "bg-forest-600" : "bg-rocky-300"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    f.enabled ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </label>
          ))}
        </CardBody>
      </Card>
    </div>
  );
}
