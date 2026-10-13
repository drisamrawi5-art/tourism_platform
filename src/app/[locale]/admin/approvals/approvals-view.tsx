"use client";

import { useState } from "react";
import Link from "next/link";
import { apiFetch, qs } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate } from "@/lib/currency";
import { formError, useRequireAuth } from "@/components/auth/helpers";
import { can } from "@/components/admin/permissions";
import { useApi } from "@/components/admin/api";
import { LoadError, PermissionDenied } from "@/components/admin/feedback";
import type { BusinessListRow } from "@/components/admin/types";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, LoadingBlock } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Field, Textarea } from "@/components/ui/field";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { StatusBadge } from "@/components/ui/badge";
import { Pagination } from "@/components/ui/pagination";

const PER_PAGE = 20;

export function ApprovalsView({
  locale,
  initialPage,
}: {
  locale: Locale;
  initialPage: number;
}) {
  const dict = getDictionary(locale);
  const { user, ready } = useRequireAuth(locale);
  const allowed = can(user, "approvals.manage");
  const mayAct = can(user, "business.approve");

  const list = useApi<BusinessListRow[]>(
    allowed
      ? `/api/v1/admin/approvals${qs({ page: initialPage, perPage: PER_PAGE })}`
      : null,
  );

  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  if (!ready) return null;
  if (!allowed) return <PermissionDenied locale={locale} />;
  if (list.error && !list.data) {
    return <LoadError locale={locale} error={list.error} onRetry={list.reload} />;
  }
  if (list.loading && !list.data) {
    return <LoadingBlock text={t(dict, "common.loading")} />;
  }

  const items = list.data ?? [];

  async function runAction(
    businessId: string,
    action: "approve" | "reject",
    rejectionReason?: string,
  ) {
    setBusyId(businessId);
    setActionError(null);
    setInfo(null);
    try {
      await apiFetch("/api/v1/admin/approvals", {
        method: "POST",
        body: {
          businessId,
          action,
          ...(rejectionReason ? { reason: rejectionReason } : {}),
        },
      });
      setInfo(
        action === "approve"
          ? t(dict, "admin.approveSuccess")
          : t(dict, "admin.rejectSuccess"),
      );
      setRejectingId(null);
      setReason("");
      list.reload();
    } catch (error) {
      setActionError(formError(error, dict));
    } finally {
      setBusyId(null);
    }
  }

  const hrefFor = (page: number) =>
    `/${locale}/admin/approvals${qs({ page })}`;

  return (
    <div className="space-y-6">
      {actionError ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {actionError}
        </Alert>
      ) : null}
      {info ? (
        <Alert tone="success" role="status" title={info} />
      ) : null}

      <Card>
        <CardHeader title={t(dict, "admin.approvals")} />
        <CardBody>
          {items.length === 0 ? (
            <EmptyState title={t(dict, "admin.approvalsEmpty")} />
          ) : (
            <div className="space-y-4">
              <Table>
                <THead>
                  <tr>
                    <TH>{t(dict, "provider.businessName")}</TH>
                    <TH>{t(dict, "provider.businessType")}</TH>
                    <TH>{t(dict, "admin.owner")}</TH>
                    <TH>{t(dict, "admin.submittedAt")}</TH>
                    <TH align="end">{t(dict, "admin.servicesCount")}</TH>
                    <TH>{t(dict, "admin.status")}</TH>
                    <TH align="end">{t(dict, "admin.actions")}</TH>
                  </tr>
                </THead>
                <tbody>
                  {items.map((row) => (
                    <TR key={row.id}>
                      <TD>
                        <Link
                          href={`/${locale}/admin/businesses/${row.id}`}
                          className="font-medium text-water-700 underline-offset-2 hover:underline"
                        >
                          {row.name}
                        </Link>
                        <span className="block text-xs text-rocky-500">{row.slug}</span>
                      </TD>
                      <TD>{t(dict, `admin.businessTypes.${row.type}`)}</TD>
                      <TD>
                        <span className="block truncate">{row.owner.name ?? "—"}</span>
                        <span className="block truncate text-xs text-rocky-500">
                          {row.owner.email}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap">
                        {formatDate(row.submittedAt ?? row.createdAt, locale)}
                      </TD>
                      <TD align="end" className="tabular-nums">
                        {row.bookableCount}
                      </TD>
                      <TD>
                        <StatusBadge status={row.status} />
                      </TD>
                      <TD align="end">
                        {rejectingId === row.id ? (
                          <div className="min-w-56 space-y-2 text-start">
                            <Field
                              label={t(dict, "admin.rejectionReason")}
                              htmlFor={`reject-reason-${row.id}`}
                            >
                              <Textarea
                                id={`reject-reason-${row.id}`}
                                rows={2}
                                value={reason}
                                onChange={(event) => setReason(event.target.value)}
                              />
                            </Field>
                            <div className="flex flex-wrap gap-2">
                              <Button
                                variant="danger"
                                size="sm"
                                loading={busyId === row.id}
                                onClick={() =>
                                  void runAction(row.id, "reject", reason || undefined)
                                }
                              >
                                {t(dict, "admin.reject")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setRejectingId(null);
                                  setReason("");
                                }}
                              >
                                {t(dict, "common.cancel")}
                              </Button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="primary"
                              size="sm"
                              disabled={!mayAct}
                              loading={busyId === row.id}
                              onClick={() => void runAction(row.id, "approve")}
                            >
                              {t(dict, "admin.approve")}
                            </Button>
                            <Button
                              variant="danger"
                              size="sm"
                              disabled={!mayAct}
                              onClick={() => {
                                setRejectingId(row.id);
                                setReason("");
                              }}
                            >
                              {t(dict, "admin.reject")}
                            </Button>
                          </div>
                        )}
                      </TD>
                    </TR>
                  ))}
                </tbody>
              </Table>

              {list.pagination ? (
                <Pagination
                  page={list.pagination.page}
                  labels={{
                    previous: t(dict, "common.previous"),
                    next: t(dict, "common.next"),
                    pagination: t(dict, "common.pagination"),
                  }}
                  totalPages={list.pagination.totalPages}
                  hrefFor={hrefFor}
                />
              ) : null}
            </div>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
