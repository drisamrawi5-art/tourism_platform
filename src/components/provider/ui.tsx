"use client";

import { useState, type ReactNode } from "react";
import { apiFetch } from "@/lib/api/client";
import { t, type Dictionary } from "@/i18n";
import { formError } from "@/components/auth/helpers";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ProviderBusinessScalars } from "./types";

/**
 * Shared pieces of the provider portal. All copy comes from the dictionary;
 * error handling funnels through formError() so 401/403/429/network failures
 * map to the established localized messages.
 */

/** Error banner (+ optional retry) used by every portal load/action state. */
export function ErrorAlert({
  dict,
  error,
  onRetry,
}: {
  dict: Dictionary;
  error: unknown;
  onRetry?: () => void;
}) {
  return (
    <div className="space-y-3">
      <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
        {formError(error, dict)}
      </Alert>
      {onRetry ? (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          {t(dict, "common.retry")}
        </Button>
      ) : null}
    </div>
  );
}

/** Category label (business type / bookable category) from existing keys. */
export function categoryLabel(dict: Dictionary, category: string): string {
  if (category === "ACCOMMODATION") return t(dict, "plan.staySection");
  if (category === "GUIDE") return t(dict, "plan.guidesSection");
  return category;
}

/**
 * Workflow note for a business status (the actionable states carry a note and
 * may host the submit-for-review action). Non-actionable states render nothing
 * — the surrounding header shows the StatusBadge.
 */
export function BusinessStatusNotice({
  dict,
  status,
  action,
}: {
  dict: Dictionary;
  status: string;
  action?: ReactNode;
}) {
  const note =
    status === "DRAFT"
      ? t(dict, "provider.draftNote")
      : status === "PENDING_REVIEW"
        ? t(dict, "provider.approvalPending")
        : status === "REJECTED"
          ? t(dict, "provider.rejectedNote")
          : null;
  if (!note) return null;

  const tone = status === "REJECTED" ? "danger" : status === "PENDING_REVIEW" ? "warning" : "info";
  return (
    <Alert tone={tone} role="status">
      <div className="space-y-3">
        <p>{note}</p>
        {action}
      </div>
    </Alert>
  );
}

/**
 * POST /api/v1/provider/business/[id]/submit (only valid from DRAFT/REJECTED —
 * callers gate visibility). Reports its own errors inline.
 */
export function SubmitForReviewButton({
  dict,
  businessId,
  onSubmitted,
}: {
  dict: Dictionary;
  businessId: string;
  onSubmitted: (business: ProviderBusinessScalars) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await apiFetch<{ business: ProviderBusinessScalars }>(
        `/api/v1/provider/business/${businessId}/submit`,
        { method: "POST", body: {} },
      );
      onSubmitted(res.data.business);
    } catch (err) {
      setError(formError(err, dict));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      {error ? (
        <Alert tone="danger" role="alert">
          {error}
        </Alert>
      ) : null}
      <Button type="button" loading={busy} onClick={() => void submit()}>
        {t(dict, "provider.submitForReview")}
      </Button>
    </div>
  );
}
