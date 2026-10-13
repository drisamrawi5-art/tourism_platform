"use client";

import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { notFound, useRouter } from "next/navigation";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { formatDate } from "@/lib/currency";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, ButtonLink } from "@/components/ui/button";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { useAdminFetch, adminError } from "@/components/admin/use-admin";
import { CardSkeleton } from "@/components/admin/skeleton";
import { ConfirmAction } from "@/components/admin/confirm";
import { Checkbox } from "@/components/admin/fields";
import { VERIFICATION_STATUSES } from "@/components/admin/enums";
import { contentKindLabel, statusLabel, verificationLabel } from "@/components/admin/labels";

type ContentTranslation = {
  id: string;
  locale: string;
  title: string;
  summary: string | null;
  body: string | null;
  publishedAt: string | null;
  updatedAt: string;
};

type ContentDetail = {
  id: string;
  slug: string;
  kind: string;
  status: string;
  featured: boolean;
  noIndex: boolean;
  sortOrder: number;
  verificationStatus: string;
  publishedAt: string | null;
  createdAt: string;
  updatedAt: string;
  translations: ContentTranslation[];
  author: { id: string; name: string | null; email: string };
};

type WorkflowAction = "submit" | "approve" | "reject" | "publish" | "archive";

/** Mirrors POST /api/v1/admin/content/[id]/workflow (409 on invalid moves). */
const WORKFLOW: ReadonlyArray<{
  action: WorkflowAction;
  from: readonly string[];
  hintFrom: string;
  labelKey: string;
  confirm: boolean;
  successKey: string;
}> = [
  {
    action: "submit",
    from: ["DRAFT", "REJECTED"],
    hintFrom: "DRAFT",
    labelKey: "provider.submitForReview",
    confirm: false,
    successKey: "provider.submitted",
  },
  {
    action: "approve",
    from: ["PENDING_REVIEW"],
    hintFrom: "PENDING_REVIEW",
    labelKey: "admin.approve",
    confirm: false,
    successKey: "admin.approveSuccess",
  },
  {
    action: "reject",
    from: ["PENDING_REVIEW"],
    hintFrom: "PENDING_REVIEW",
    labelKey: "admin.reject",
    confirm: true,
    successKey: "admin.rejectSuccess",
  },
  {
    action: "publish",
    from: ["APPROVED"],
    hintFrom: "APPROVED",
    labelKey: "admin.publish",
    confirm: false,
    successKey: "common.published",
  },
  {
    action: "archive",
    from: ["DRAFT", "PENDING_REVIEW", "APPROVED", "PUBLISHED", "REJECTED"],
    hintFrom: "ARCHIVED",
    labelKey: "admin.archive",
    confirm: true,
    successKey: "admin.archiveSuccess",
  },
];

/** Shared notice shape used by the forms below. */
type Notice = { tone: "success" | "danger"; text: string } | null;

/** Card that is itself a form — Card renders a plain <div>. */
function FormCard({
  onSubmit,
  children,
}: {
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  children: ReactNode;
}) {
  return (
    <form onSubmit={onSubmit}>
      <Card>{children}</Card>
    </form>
  );
}

/** Admin fields PATCHed alongside (never via) the workflow endpoint. */
function ContentFieldsForm({
  locale,
  content,
  onSaved,
}: {
  locale: Locale;
  content: ContentDetail;
  onSaved: () => void;
}) {
  const dict = getDictionary(locale);
  const [featured, setFeatured] = useState(content.featured);
  const [noIndex, setNoIndex] = useState(content.noIndex);
  const [sortOrder, setSortOrder] = useState(String(content.sortOrder));
  const [verification, setVerification] = useState(content.verificationStatus);
  const [publishedAt, setPublishedAt] = useState(
    content.publishedAt ? content.publishedAt.slice(0, 10) : "",
  );
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    setFeatured(content.featured);
    setNoIndex(content.noIndex);
    setSortOrder(String(content.sortOrder));
    setVerification(content.verificationStatus);
    setPublishedAt(content.publishedAt ? content.publishedAt.slice(0, 10) : "");
  }, [content]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const order = Number(sortOrder);
    if (!Number.isInteger(order)) {
      setErrors({ sortOrder: t(dict, "common.error") });
      return;
    }
    setErrors({});
    setSaving(true);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/admin/content/${content.id}`, {
        method: "PATCH",
        body: {
          featured,
          noIndex,
          sortOrder: order,
          verificationStatus: verification,
          publishedAt: publishedAt === "" ? null : publishedAt,
        },
      });
      setNotice({ tone: "success", text: t(dict, "common.save") });
      onSaved();
    } catch (err) {
      setNotice({ tone: "danger", text: adminError(err, dict) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormCard onSubmit={onSave}>
      <CardHeader title={t(dict, "admin.content")} description={t(dict, "admin.markdownHint")} />
      <CardBody className="space-y-4">
        {notice ? (
          <Alert tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>
            {notice.text}
          </Alert>
        ) : null}
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label={t(dict, "admin.sortOrder")} htmlFor="content-sort-order" error={errors.sortOrder}>
            <Input
              id="content-sort-order"
              type="number"
              inputMode="numeric"
              value={sortOrder}
              disabled={saving}
              onChange={(event) => setSortOrder(event.target.value)}
            />
          </Field>
          <Field label={t(dict, "admin.verification")} htmlFor="content-verification">
            <Select
              id="content-verification"
              value={verification}
              disabled={saving}
              onChange={(event) => setVerification(event.target.value)}
            >
              {VERIFICATION_STATUSES.map((option) => (
                <option key={option} value={option}>
                  {verificationLabel(dict, option)}
                </option>
              ))}
            </Select>
          </Field>
          <Field label={t(dict, "admin.publishedAt")} htmlFor="content-published-at">
            <Input
              id="content-published-at"
              type="date"
              value={publishedAt}
              disabled={saving}
              onChange={(event) => setPublishedAt(event.target.value)}
            />
          </Field>
        </div>
        <Checkbox
          id="content-featured"
          label={t(dict, "admin.featured")}
          checked={featured}
          disabled={saving}
          onChange={setFeatured}
        />
        <Checkbox
          id="content-noindex"
          label={t(dict, "admin.noIndex")}
          hint={t(dict, "admin.noIndexHint")}
          checked={noIndex}
          disabled={saving}
          onChange={setNoIndex}
        />
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={saving}>
            {t(dict, "common.save")}
          </Button>
        </div>
      </CardBody>
    </FormCard>
  );
}

/** Per-locale title / summary / body (Markdown) — upserted by the API. */
function TranslationForm({
  locale,
  content,
  code,
  onSaved,
}: {
  locale: Locale;
  content: ContentDetail;
  code: "en" | "fr" | "ar";
  onSaved: () => void;
}) {
  const dict = getDictionary(locale);
  const existing = content.translations.find((entry) => entry.locale === code);
  const [title, setTitle] = useState(existing?.title ?? "");
  const [summary, setSummary] = useState(existing?.summary ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});

  useEffect(() => {
    setTitle(existing?.title ?? "");
    setSummary(existing?.summary ?? "");
    setBody(existing?.body ?? "");
  }, [existing]);

  async function onSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!title.trim()) {
      setErrors({ title: t(dict, "common.required") });
      return;
    }
    setErrors({});
    setSaving(true);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/admin/content/${content.id}`, {
        method: "PATCH",
        body: {
          translations: {
            [code]: {
              title: title.trim(),
              ...(summary.trim() ? { summary: summary.trim() } : {}),
              ...(body.trim() ? { body: body.trim() } : {}),
            },
          },
        },
      });
      setNotice({ tone: "success", text: t(dict, "common.save") });
      onSaved();
    } catch (err) {
      setNotice({ tone: "danger", text: adminError(err, dict) });
    } finally {
      setSaving(false);
    }
  }

  return (
    <FormCard onSubmit={onSave}>
      <CardHeader
        title={`${t(dict, "admin.translations")} · ${code.toUpperCase()}`}
        description={existing ? undefined : t(dict, "common.optional")}
      />
      <CardBody className="space-y-4">
        {notice ? (
          <Alert tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>
            {notice.text}
          </Alert>
        ) : null}
        <Field
          label={t(dict, "journal.title")}
          htmlFor={`content-title-${code}`}
          required
          error={errors.title}
        >
          <Input
            id={`content-title-${code}`}
            value={title}
            disabled={saving}
            onChange={(event) => setTitle(event.target.value)}
          />
        </Field>
        <Field label={t(dict, "admin.summary")} htmlFor={`content-summary-${code}`}>
          <Textarea
            id={`content-summary-${code}`}
            rows={3}
            value={summary}
            disabled={saving}
            onChange={(event) => setSummary(event.target.value)}
          />
        </Field>
        <Field
          label={t(dict, "admin.markdown")}
          htmlFor={`content-body-${code}`}
          hint={t(dict, "admin.markdownHint")}
        >
          <Textarea
            id={`content-body-${code}`}
            rows={12}
            className="font-mono text-xs"
            value={body}
            disabled={saving}
            onChange={(event) => setBody(event.target.value)}
          />
        </Field>
        <div className="flex justify-end">
          <Button type="submit" loading={saving} disabled={saving}>
            {t(dict, "common.save")}
          </Button>
        </div>
      </CardBody>
    </FormCard>
  );
}

export function ContentDetailView({ locale, contentId }: { locale: Locale; contentId: string }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { data, loading, error, reload } = useAdminFetch<{ content: ContentDetail }>(
    `/api/v1/admin/content/${contentId}`,
  );
  const content = data?.content ?? null;

  const [missing, setMissing] = useState(false);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(false);
  const [deleteInput, setDeleteInput] = useState("");

  useEffect(() => {
    if (error instanceof ApiClientError && error.status === 404) setMissing(true);
  }, [error]);

  async function runWorkflow(action: WorkflowAction, successKey: string) {
    if (busy || !content) return;
    setBusy(true);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/admin/content/${contentId}/workflow`, {
        method: "POST",
        body: { action },
      });
      setNotice({ tone: "success", text: t(dict, successKey) });
      reload();
    } catch (err) {
      setNotice({ tone: "danger", text: adminError(err, dict) });
    } finally {
      setBusy(false);
    }
  }

  async function onDelete() {
    if (busy || !content || deleteInput !== content.slug) return;
    setBusy(true);
    setNotice(null);
    try {
      await apiFetch(`/api/v1/admin/content/${contentId}`, { method: "DELETE" });
      router.push(`/${locale}/admin/content`);
    } catch (err) {
      setNotice({ tone: "danger", text: adminError(err, dict) });
      setBusy(false);
    }
  }

  if (missing) notFound();

  if (loading && !content) return <CardSkeleton label={t(dict, "common.loading")} />;

  if (error && !content) {
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

  if (!content) return <EmptyState title={t(dict, "common.empty")} />;

  const enTitle =
    content.translations.find((entry) => entry.locale === "en")?.title ?? `/${content.slug}`;

  return (
    <div className="space-y-6">
      {notice ? (
        <Alert tone={notice.tone} role={notice.tone === "danger" ? "alert" : "status"}>
          {notice.text}
        </Alert>
      ) : null}

      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-3">
              <span>{enTitle}</span>
              <StatusBadge status={content.status} />
            </span>
          }
          description={`/${content.slug}`}
          action={
            <ButtonLink href={`/${locale}/admin/content`} variant="ghost" size="sm">
              {t(dict, "common.back")}
            </ButtonLink>
          }
        />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.kind")}
              </dt>
              <dd className="mt-0.5">
                <Badge tone="outline">{contentKindLabel(dict, content.kind)}</Badge>
              </dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.author")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{content.author.name ?? content.author.email}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.createdAt")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{formatDate(content.createdAt, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "common.updated")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{formatDate(content.updatedAt, locale)}</dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "admin.actions")} />
        <CardBody>
          <div className="flex flex-wrap gap-2">
            {WORKFLOW.map((step) => {
              if (step.action === "archive" && content.status === "ARCHIVED") return null;
              const allowed = step.from.includes(content.status);
              const hint = allowed
                ? undefined
                : t(dict, "admin.needsStatus", { status: statusLabel(dict, step.hintFrom) });
              if (!allowed) {
                return (
                  <Button
                    key={step.action}
                    size="sm"
                    variant="secondary"
                    disabled
                    title={hint}
                  >
                    {t(dict, step.labelKey)}
                  </Button>
                );
              }
              if (step.confirm) {
                return (
                  <ConfirmAction
                    key={step.action}
                    label={t(dict, step.labelKey)}
                    confirmLabel={t(dict, "admin.confirm")}
                    cancelLabel={t(dict, "common.cancel")}
                    variant="danger"
                    busy={busy}
                    disabled={busy}
                    onConfirm={() => void runWorkflow(step.action, step.successKey)}
                  />
                );
              }
              return (
                <Button
                  key={step.action}
                  size="sm"
                  variant={step.action === "publish" ? "primary" : "secondary"}
                  loading={busy}
                  disabled={busy}
                  onClick={() => void runWorkflow(step.action, step.successKey)}
                >
                  {t(dict, step.labelKey)}
                </Button>
              );
            })}
          </div>
        </CardBody>
      </Card>

      <ContentFieldsForm locale={locale} content={content} onSaved={reload} />

      <div className="grid gap-6 xl:grid-cols-2">
        {(["en", "fr", "ar"] as const).map((code) => (
          <TranslationForm
            key={code}
            locale={locale}
            content={content}
            code={code}
            onSaved={reload}
          />
        ))}
      </div>

      <Card>
        <CardHeader title={t(dict, "admin.timeline")} />
        <CardBody>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.createdAt")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{formatDate(content.createdAt, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "common.updated")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{formatDate(content.updatedAt, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "admin.publishedAt")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">
                {content.publishedAt ? formatDate(content.publishedAt, locale) : t(dict, "common.none")}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader
          title={t(dict, "admin.delete")}
          description={t(dict, "admin.deleteConfirm", { slug: content.slug })}
        />
        <CardBody className="space-y-4">
          <Field label={t(dict, "admin.slug")} htmlFor="content-delete-slug">
            <Input
              id="content-delete-slug"
              value={deleteInput}
              disabled={busy}
              onChange={(event) => setDeleteInput(event.target.value)}
            />
          </Field>
          <div className="flex justify-end">
            <ConfirmAction
              label={t(dict, "admin.delete")}
              confirmLabel={t(dict, "admin.confirm")}
              cancelLabel={t(dict, "common.cancel")}
              variant="danger"
              busy={busy}
              disabled={busy || deleteInput !== content.slug}
              title={
                deleteInput === content.slug
                  ? undefined
                  : t(dict, "admin.deleteConfirm", { slug: content.slug })
              }
              onConfirm={() => void onDelete()}
            />
          </div>
        </CardBody>
      </Card>
    </div>
  );
}
