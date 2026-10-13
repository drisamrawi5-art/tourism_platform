"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { useRequireAuth } from "@/components/auth/helpers";
import { SkeletonList } from "@/components/provider/skeleton";
import { LocalizedStatus } from "@/components/provider/status-badge";
import { ConfirmButton } from "@/components/provider/confirm-button";
import {
  categoryLabel,
  providerErrorMessage,
  type ProviderBusiness,
} from "@/components/provider/api";

export function BusinessesView({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { user, ready } = useRequireAuth(locale);

  const [business, setBusiness] = useState<ProviderBusiness | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const res = await apiFetch<{ business: ProviderBusiness | null }>(
        "/api/v1/provider/business",
      );
      setBusiness(res.data.business);
    } catch (err) {
      setBusiness(null);
      setLoadError(providerErrorMessage(err, dict));
    } finally {
      setLoaded(true);
    }
  }, [dict]);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  async function onSubmitForReview() {
    if (!business || busy) return;
    setBusy(true);
    setActionError(null);
    setInfo(null);
    try {
      await apiFetch(`/api/v1/provider/business/${business.id}/submit`, {
        method: "POST",
        body: {},
      });
      setInfo(t(dict, "provider.submitted"));
      await load();
    } catch (err) {
      setActionError(providerErrorMessage(err, dict));
    } finally {
      setBusy(false);
    }
  }

  if (!ready || !user) return null;

  const canSubmit =
    business !== null && (business.status === "DRAFT" || business.status === "REJECTED");

  let body: React.ReactNode;
  if (!loaded) {
    body = (
      <CardBody>
        <SkeletonList label={t(dict, "common.loading")} rows={3} />
      </CardBody>
    );
  } else if (business === null && loadError !== null) {
    body = (
      <CardBody>
        <div className="space-y-4">
          <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
            {loadError}
          </Alert>
          <Button variant="secondary" onClick={() => void load()}>
            {t(dict, "common.retry")}
          </Button>
        </div>
      </CardBody>
    );
  } else if (business === null) {
    body = (
      <CardBody>
        <EmptyState
          title={t(dict, "provider.noBusiness")}
          description={t(dict, "provider.noBusinessBody")}
          action={{
            href: `/${locale}/provider/businesses/new`,
            label: t(dict, "provider.createBusiness"),
          }}
        />
      </CardBody>
    );
  } else {
    body = (
      <CardBody className="space-y-4">
        {business.status === "REJECTED" ? (
          <Alert tone="danger" title={t(dict, "provider.rejected")}>
            {t(dict, "provider.rejectedNote")}
          </Alert>
        ) : null}
        {business.status === "PENDING_REVIEW" ? (
          <Alert tone="info" role="status">
            {t(dict, "provider.approvalPending")}
          </Alert>
        ) : null}

        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <Link
            href={`/${locale}/provider/businesses/${business.id}`}
            className="text-base font-semibold text-rocky-900 underline-offset-2 hover:underline"
          >
            {business.name}
          </Link>
          <LocalizedStatus dict={dict} status={business.status} />
          <Badge tone="outline">{categoryLabel(dict, business.type)}</Badge>
          <span className="text-sm text-rocky-500" dir="ltr">
            /{business.slug}
          </span>
        </div>

        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
              {t(dict, "provider.created")}
            </dt>
            <dd className="mt-0.5 text-rocky-800">{formatDate(business.createdAt, locale)}</dd>
          </div>
          {business.submittedAt ? (
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "provider.submitted")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">
                {formatDate(business.submittedAt, locale)}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="flex flex-wrap gap-3">
          <ButtonLink
            href={`/${locale}/provider/businesses/${business.id}`}
            variant="secondary"
          >
            {t(dict, "provider.businessProfile")}
          </ButtonLink>
          {canSubmit ? (
            <ConfirmButton
              label={t(dict, "provider.submitForReview")}
              confirmLabel={t(dict, "provider.confirmPrompt")}
              cancelLabel={t(dict, "common.cancel")}
              onConfirm={onSubmitForReview}
              busy={busy}
            />
          ) : null}
        </div>
      </CardBody>
    );
  }

  return (
    <div className="space-y-6">
      {actionError ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {actionError}
        </Alert>
      ) : null}
      {info ? (
        <Alert tone="success" role="status">
          {info}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={t(dict, "provider.businesses")}
          action={
            loaded && business === null && loadError === null ? (
              <ButtonLink href={`/${locale}/provider/businesses/new`}>
                {t(dict, "provider.newBusiness")}
              </ButtonLink>
            ) : null
          }
        />
        {body}
      </Card>
    </div>
  );
}
