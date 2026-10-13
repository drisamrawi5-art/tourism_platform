"use client";

import { useEffect, useState, type FormEvent } from "react";
import { notFound } from "next/navigation";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { formatDate } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/alert";
import { StatusBadge, Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { useAdminFetch, adminError } from "@/components/admin/use-admin";
import { CardSkeleton } from "@/components/admin/skeleton";
import { Checkbox } from "@/components/admin/fields";
import { BUSINESS_TYPES, PUBLICATION_STATUSES, VERIFICATION_STATUSES } from "@/components/admin/enums";
import {
  businessTypeLabel,
  statusLabel,
  verificationLabel,
} from "@/components/admin/labels";

type BusinessDetail = {
  id: string;
  name: string;
  slug: string;
  type: string;
  status: string;
  verificationStatus: string;
  featured: boolean;
  noIndex: boolean;
  phone: string | null;
  email: string | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  submittedAt: string | null;
  approvedAt: string | null;
  createdAt: string;
  updatedAt: string;
  owner: { id: string; email: string; name: string | null };
  translations: Array<{
    id: string;
    locale: string;
    name: string;
    description: string | null;
  }>;
  _count: { bookables: number; bookings: number; reviews: number };
};

/**
 * Status transitions offered in the select — mirrored from the approval
 * workflow in POST /api/v1/admin/approvals (approve/reject/publish/unpublish).
 * The server is authoritative; invalid options are disabled here for clarity.
 */
const NEXT_STATUSES: Record<string, readonly string[]> = {
  DRAFT: [],
  PENDING_REVIEW: ["APPROVED", "REJECTED"],
  APPROVED: ["PUBLISHED", "REJECTED"],
  PUBLISHED: ["ARCHIVED"],
  REJECTED: [],
  ARCHIVED: [],
};

export function BusinessDetailView({
  locale,
  businessId,
}: {
  locale: Locale;
  businessId: string;
}) {
  const dict = getDictionary(locale);
  const { data, loading, error, reload, setData } = useAdminFetch<BusinessDetail>(
    `/api/v1/admin/businesses/${businessId}`,
  );

  const [missing, setMissing] = useState(false);
  const [status, setStatus] = useState("");
  const [verification, setVerification] = useState("");
  const [featured, setFeatured] = useState(false);
  const [noIndex, setNoIndex] = useState(false);
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<{ tone: "success" | "danger"; text: string } | null>(null);

  useEffect(() => {
    if (!data) return;
    setStatus(data.status);
    setVerification(data.verificationStatus);
    setFeatured(data.featured);
    setNoIndex(data.noIndex);
  }, [data]);

  useEffect(() => {
    if (error instanceof ApiClientError && error.status === 404) setMissing(true);
  }, [error]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !data) return;
    setSaving(true);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/admin/businesses/${businessId}`, {
        method: "PATCH",
        body: {
          status,
          verificationStatus: verification,
          featured,
          noIndex,
        },
      });
      setNotice({ tone: "success", text: t(dict, "account.saved") });
      reload();
    } catch (err) {
      setNotice({ tone: "danger", text: adminError(err, dict) });
    } finally {
      setSaving(false);
    }
  }

  if (missing) notFound();

  if (loading && !data) return <CardSkeleton label={t(dict, "common.loading")} />;

  if (error && !data) {
    return (
      <div className="space-y-4">
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {adminError(error, dict)}
        </Alert>
        <Button variant="secondary" onClick={() => reload()}>
          {t(dict, "common.retry")}
        </Button>
      </div>
    );
  }

  if (!data) return <EmptyState title={t(dict, "common.empty")} />;

  const allowedTargets = new Set<string>([data.status, ...(NEXT_STATUSES[data.status] ?? [])]);

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-3">
              <span>{data.name}</span>
              <StatusBadge status={data.status} />
            </span>
          }
          description={`/${data.slug}`}
        />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "provider.businessType")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{businessTypeLabel(dict, data.type)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.owner")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{data.owner.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.verification")}
              </dt>
              <dd className="mt-0.5">
                <Badge tone="outline">{verificationLabel(dict, data.verificationStatus)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.submittedAt")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">
                {data.submittedAt ? formatDate(data.submittedAt, locale) : t(dict, "common.none")}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.servicesCount")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{data._count.bookables}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.bookings")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{data._count.bookings}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.reviews")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{data._count.reviews}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.createdAt")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{formatDate(data.createdAt, locale)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.status")} />
        <CardBody>
          {notice ? (
            <div className="mb-4">
              <Alert tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>
                {notice.text}
              </Alert>
            </div>
          ) : null}
          <form onSubmit={onSave} noValidate className="space-y-4">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label={t(dict, "admin.status")} htmlFor="business-status">
                <Select
                  id="business-status"
                  value={status}
                  onChange={(event) => setStatus(event.target.value)}
                  disabled={saving}
                >
                  {PUBLICATION_STATUSES.map((option) => (
                    <option
                      key={option}
                      value={option}
                      disabled={!allowedTargets.has(option)}
                      title={
                        allowedTargets.has(option)
                          ? undefined
                          : t(dict, "admin.notAvailable")
                      }
                    >
                      {statusLabel(dict, option)}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label={t(dict, "admin.verification")} htmlFor="business-verification">
                <Select
                  id="business-verification"
                  value={verification}
                  onChange={(event) => setVerification(event.target.value)}
                  disabled={saving}
                >
                  {VERIFICATION_STATUSES.map((option) => (
                    <option key={option} value={option}>
                      {verificationLabel(dict, option)}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Checkbox
              id="business-featured"
              label={t(dict, "admin.featured")}
              checked={featured}
              onChange={setFeatured}
              disabled={saving}
            />
            <Checkbox
              id="business-noindex"
              label={t(dict, "admin.noIndex")}
              hint={t(dict, "admin.noIndexHint")}
              checked={noIndex}
              onChange={setNoIndex}
              disabled={saving}
            />

            <div className="flex justify-end">
              <Button type="submit" loading={saving}>
                {t(dict, "account.saveChanges")}
              </Button>
            </div>
          </form>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "footer.contact")} />
        <CardBody>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-4 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "auth.email")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{data.email ?? t(dict, "common.none")}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.phone")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{data.phone ?? t(dict, "common.none")}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "provider.address")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{data.address ?? t(dict, "common.none")}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "map.title")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">
                {data.lat !== null && data.lng !== null
                  ? `${data.lat}, ${data.lng}`
                  : t(dict, "map.noCoordinates")}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.translations")} />
        <CardBody>
          {data.translations.length === 0 ? (
            <EmptyState compact title={t(dict, "common.empty")} />
          ) : (
            <Table>
              <caption className="sr-only">{t(dict, "admin.translations")}</caption>
              <THead>
                <tr>
                  <TH>{t(dict, "nav.language")}</TH>
                  <TH>{t(dict, "auth.name")}</TH>
                  <TH>{t(dict, "provider.description")}</TH>
                </tr>
              </THead>
              <tbody>
                {data.translations.map((translation) => (
                  <TR key={translation.id}>
                    <TD className="uppercase">{translation.locale}</TD>
                    <TD className="font-medium text-rocky-900">{translation.name}</TD>
                    <TD className="text-rocky-600">{translation.description ?? "—"}</TD>
                  </TR>
                ))}
              </tbody>
            </Table>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
