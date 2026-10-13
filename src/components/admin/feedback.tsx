"use client";

import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { ApiClientError } from "@/lib/api/client";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

/**
 * Shared admin feedback states. All copy is resolved from the typed
 * dictionary; 403 responses surface the permission-denied state and 429 the
 * rate-limit copy, mirroring what the API actually returns.
 */

export function PermissionDenied({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  return (
    <EmptyState
      title={t(dict, "admin.accessDenied")}
      description={t(dict, "admin.accessDeniedBody")}
      action={{ href: `/${locale}`, label: t(dict, "errors.goHome") }}
    />
  );
}

function messageKeyFor(error: unknown): string {
  if (error instanceof ApiClientError) {
    if (error.status === 403 || error.code === "FORBIDDEN") return "errors.forbidden";
    if (error.status === 401) return "errors.unauthorized";
    if (error.status === 429 || error.code === "RATE_LIMITED") return "errors.rateLimited";
    if (error.code === "NETWORK_ERROR" || error.code === "TIMEOUT") {
      return "errors.offline";
    }
    if (error.status >= 500 || error.code === "INTERNAL_ERROR") {
      return "common.error";
    }
  }
  return "common.error";
}

/** Load/action failure with a retry affordance (network/5xx only). */
export function LoadError({
  locale,
  error,
  onRetry,
}: {
  locale: Locale;
  error: unknown;
  onRetry: () => void;
}) {
  const dict = getDictionary(locale);
  const title = t(dict, messageKeyFor(error));
  const status = error instanceof ApiClientError ? error.status : 0;
  const retryable = status !== 401 && status !== 403;

  return (
    <div className="space-y-4">
      <Alert tone="danger" role="alert" title={title}>
        {status >= 500 ? t(dict, "errors.serverErrorBody") : null}
      </Alert>
      {retryable ? (
        <Button variant="secondary" onClick={onRetry}>
          {t(dict, "common.retry")}
        </Button>
      ) : null}
    </div>
  );
}
