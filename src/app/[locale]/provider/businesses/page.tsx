"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { formatDate, formatMoney } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";

type Business = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  createdAt: string;
  submittedAt: string | null;
  approvedAt: string | null;
  bookables: Array<{ id: string; slug: string; category: string; status: string }>;
};

export default function ProviderBusinesses() {
  const locale = useLocale();  const dict = getDictionary(locale);
  const [business, setBusiness] = useState<Business | null>(null);
  const [error, setError] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const res = await apiFetch<{ business: Business | null }>("/api/v1/provider/business");
      setBusiness(res.data.business);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const submit = async () => {
    if (!business) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await apiFetch(`/api/v1/provider/business/${business.id}/submit`, { method: "POST" });
      await load();
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : "Failed");
    } finally {
      setSubmitting(false);
    }
  };

  if (error) {
    return (
      <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
        {t(dict, "errors.serverErrorBody")}
      </Alert>
    );
  }

  if (!business) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-32 w-full" />
      </div>
    );
  }

  const canSubmit = business.status === "DRAFT" || business.status === "REJECTED";

  return (
    <div className="space-y-6">
      {submitError ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {submitError}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={business.name}
          description={business.slug}
          action={
            <div className="flex gap-2">
              {canSubmit ? (
                <Button onClick={submit} disabled={submitting}>
                  {submitting ? t(dict, "common.loading") : t(dict, "provider.submitForReview")}
                </Button>
              ) : null}
              <ButtonLink href={`/${locale}/provider/businesses/${business.id}`} variant="secondary">
                {t(dict, "provider.businessProfile")}
              </ButtonLink>
            </div>
          }
        />
        <CardBody className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <StatusBadge status={business.status} />
            <span className="text-sm text-rocky-600">
              {t(dict, "provider.businessType")}: {business.type}
            </span>
          </div>

          {business.status === "PENDING_REVIEW" ? (
            <Alert tone="info">{t(dict, "provider.approvalPending")}</Alert>
          ) : null}
          {business.status === "REJECTED" ? (
            <Alert tone="danger">{t(dict, "provider.rejectedNote")}</Alert>
          ) : null}
          {business.status === "DRAFT" ? (
            <Alert tone="warning">{t(dict, "provider.draftNote")}</Alert>
          ) : null}

          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-rocky-500">{t(dict, "provider.businessName")}</dt>
              <dd className="font-medium text-rocky-900">{business.name}</dd>
            </div>
            <div>
              <dt className="text-rocky-500">{t(dict, "provider.description")}</dt>
              <dd className="font-medium text-rocky-900">{business.email ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-rocky-500">{t(dict, "provider.address")}</dt>
              <dd className="font-medium text-rocky-900">{business.phone ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-rocky-500">{t(dict, "admin.createdAt")}</dt>
              <dd className="font-medium text-rocky-900">
                {formatDate(business.createdAt, locale)}
              </dd>
            </div>
          </dl>

          <div>
            <h3 className="mb-2 text-sm font-semibold text-rocky-800">
              {t(dict, "provider.services")} ({business.bookables.length})
            </h3>
            {business.bookables.length === 0 ? (
              <EmptyState compact title={t(dict, "provider.noBusiness")} />
            ) : (
              <Table>
                <THead>
                  <TR>
                    <TH>{t(dict, "provider.serviceName")}</TH>
                    <TH>{t(dict, "provider.businessType")}</TH>
                    <TH>{t(dict, "admin.status")}</TH>
                  </TR>
                </THead>
                <tbody>
                  {business.bookables.map((b) => (
                    <TR key={b.id}>
                      <TD>{b.slug}</TD>
                      <TD>{b.category}</TD>
                      <TD>
                        <StatusBadge status={b.status} />
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>
            )}
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
