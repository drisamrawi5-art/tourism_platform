"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { apiFetch, qs, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Button, LoadingBlock } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { Field, Input, Select } from "@/components/ui/field";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { fieldErrors, formError, useRequireAuth } from "@/components/auth/helpers";
import { ErrorAlert, categoryLabel } from "@/components/provider/ui";
import { bookableName, fetchAllBookables, isoDay } from "@/components/provider/data";
import type {
  ProviderBlock,
  ProviderBookable,
  ProviderRule,
} from "@/components/provider/types";

type RuleRow = {
  key: number;
  startDate: string;
  endDate: string;
  capacity: string;
};

let ruleRowSeq = 0;

function toRuleRow(rule: ProviderRule): RuleRow {
  return {
    key: (ruleRowSeq += 1),
    startDate: rule.startDate.slice(0, 10),
    endDate: rule.endDate ? rule.endDate.slice(0, 10) : "",
    capacity: String(rule.capacity),
  };
}

/**
 * Availability management for one bookable.
 *
 * - Capacity rules: GET + PUT /provider/bookables/[id]/rules (the PUT replaces
 *   the full set, so the editor always shows every rule of the bookable).
 * - Blocks: GET + POST /provider/bookables/[id]/blocks over a fixed window
 *   (past 30 days → next year) and DELETE …/blocks/[blockId].
 *   New blocks are created with the BLOCKED state — the block form's purpose.
 */
export function AvailabilityView({
  locale,
  initialBookable,
}: {
  locale: Locale;
  initialBookable: string | null;
}) {
  const dict = getDictionary(locale);
  const { ready } = useRequireAuth(locale);

  const [bookables, setBookables] = useState<ProviderBookable[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [listError, setListError] = useState<unknown>(null);
  const [selectedId, setSelectedId] = useState<string | null>(initialBookable);

  const [from, setFrom] = useState(() => isoDay(-30));
  const [to, setTo] = useState(() => isoDay(365));
  const [reloadKey, setReloadKey] = useState(0);

  const [rules, setRules] = useState<ProviderRule[] | null>(null);
  const [blocks, setBlocks] = useState<ProviderBlock[] | null>(null);
  const [dataError, setDataError] = useState<unknown>(null);

  // Rules editor
  const [ruleRows, setRuleRows] = useState<RuleRow[]>([]);
  const [rulesError, setRulesError] = useState<string | null>(null);
  const [rulesSaved, setRulesSaved] = useState(false);
  const [savingRules, setSavingRules] = useState(false);

  // Block form
  const [blockStart, setBlockStart] = useState("");
  const [blockEnd, setBlockEnd] = useState("");
  const [blockReason, setBlockReason] = useState("");
  const [blockErrors, setBlockErrors] = useState<Record<string, string | undefined>>({});
  const [blockBanner, setBlockBanner] = useState<string | null>(null);
  const [blockInfo, setBlockInfo] = useState<string | null>(null);
  const [creatingBlock, setCreatingBlock] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);

  const loadList = useCallback(async () => {
    setListLoading(true);
    setListError(null);
    try {
      const list = await fetchAllBookables();
      setBookables(list);
      setSelectedId((prev) =>
        prev && list.some((b) => b.id === prev) ? prev : (list[0]?.id ?? null),
      );
    } catch (err) {
      setListError(err);
    } finally {
      setListLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadList();
  }, [loadList]);

  const effectiveId =
    selectedId !== null && bookables.some((b) => b.id === selectedId)
      ? selectedId
      : (bookables[0]?.id ?? null);

  const loadData = useCallback(
    async (id: string, rangeFrom: string, rangeTo: string) => {
      setDataError(null);
      try {
        const [rulesRes, blocksRes] = await Promise.all([
          apiFetch<{ rules: ProviderRule[] }>(`/api/v1/provider/bookables/${id}/rules`),
          apiFetch<{ blocks: ProviderBlock[] }>(
            `/api/v1/provider/bookables/${id}/blocks${qs({ from: rangeFrom, to: rangeTo })}`,
          ),
        ]);
        const loadedRules = rulesRes.data.rules ?? [];
        setRules(loadedRules);
        setRuleRows(loadedRules.map(toRuleRow));
        setBlocks(blocksRes.data.blocks ?? []);
      } catch (err) {
        setDataError(err);
      }
    },
    [],
  );

  useEffect(() => {
    if (!effectiveId) return;
    void loadData(effectiveId, from, to);
  }, [effectiveId, from, to, reloadKey, loadData]);

  function reload() {
    setReloadKey((key) => key + 1);
  }

  function updateRuleRow(key: number, patch: Partial<RuleRow>) {
    setRuleRows((prev) => prev.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  }

  function addRuleRow() {
    setRuleRows((prev) => [
      ...prev,
      { key: (ruleRowSeq += 1), startDate: isoDay(0), endDate: "", capacity: "" },
    ]);
  }

  function removeRuleRow(key: number) {
    setRuleRows((prev) => prev.filter((row) => row.key !== key));
  }

  async function onSaveRules(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (savingRules || !effectiveId) return;
    setRulesError(null);
    setRulesSaved(false);

    for (const row of ruleRows) {
      const capacityNum = Number(row.capacity);
      if (!row.startDate) {
        setRulesError(t(dict, "common.required"));
        return;
      }
      if (row.endDate && row.endDate < row.startDate) {
        setRulesError(t(dict, "booking.endAfterStart"));
        return;
      }
      if (
        !row.capacity.trim() ||
        !Number.isInteger(capacityNum) ||
        capacityNum < 0 ||
        capacityNum > 10000
      ) {
        setRulesError(t(dict, "common.error"));
        return;
      }
    }

    setSavingRules(true);
    try {
      await apiFetch(`/api/v1/provider/bookables/${effectiveId}/rules`, {
        method: "PUT",
        body: {
          rules: ruleRows.map((row) => ({
            startDate: row.startDate,
            endDate: row.endDate || null,
            capacity: Number(row.capacity),
          })),
        },
      });
      setRulesSaved(true);
      reload();
    } catch (err) {
      setRulesError(formError(err, dict));
    } finally {
      setSavingRules(false);
    }
  }

  async function onCreateBlock(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (creatingBlock || !effectiveId) return;
    const errs: Record<string, string | undefined> = {};
    if (!blockStart) errs.startDate = t(dict, "common.required");
    if (!blockEnd) errs.endDate = t(dict, "common.required");
    if (blockStart && blockEnd && blockEnd <= blockStart) {
      errs.endDate = t(dict, "booking.endAfterStart");
    }
    setBlockErrors(errs);
    setBlockBanner(null);
    setBlockInfo(null);
    if (Object.values(errs).some(Boolean)) return;

    setCreatingBlock(true);
    try {
      await apiFetch(`/api/v1/provider/bookables/${effectiveId}/blocks`, {
        method: "POST",
        body: {
          startDate: blockStart,
          endDate: blockEnd,
          state: "BLOCKED",
          reason: blockReason.trim() ? blockReason.trim() : null,
        },
      });
      setBlockInfo(t(dict, "account.saved"));
      setBlockStart("");
      setBlockEnd("");
      setBlockReason("");
      // Keep the new block inside the fetched window, then refetch.
      setFrom((prev) => (blockStart < prev ? blockStart : prev));
      setTo((prev) => (blockEnd > prev ? blockEnd : prev));
      reload();
    } catch (err) {
      if (err instanceof ApiClientError && Object.keys(err.details ?? {}).length > 0) {
        setBlockErrors(fieldErrors(err));
      }
      setBlockBanner(formError(err, dict));
    } finally {
      setCreatingBlock(false);
    }
  }

  async function onRemoveBlock(blockId: string) {
    if (removingId || !effectiveId) return;
    setRemovingId(blockId);
    setBlockBanner(null);
    try {
      await apiFetch(`/api/v1/provider/bookables/${effectiveId}/blocks/${blockId}`, {
        method: "DELETE",
      });
      setBlockInfo(t(dict, "account.saved"));
      reload();
    } catch (err) {
      setBlockBanner(formError(err, dict));
    } finally {
      setRemovingId(null);
    }
  }

  if (!ready) return null;
  if (listLoading) return <LoadingBlock text={t(dict, "common.loading")} />;
  if (listError !== null) {
    return <ErrorAlert dict={dict} error={listError} onRetry={() => void loadList()} />;
  }

  const selected = bookables.find((b) => b.id === effectiveId) ?? null;

  if (bookables.length === 0 || !selected) {
    return (
      <EmptyState
        title={t(dict, "common.empty")}
        description={t(dict, "provider.draftNote")}
        action={{
          href: `/${locale}/provider/services`,
          label: t(dict, "provider.addService"),
        }}
      />
    );
  }

  const dataReady = rules !== null && blocks !== null;

  return (
    <div className="space-y-6">
      {/* Bookable picker */}
      <Card>
        <CardHeader title={t(dict, "provider.availability")} />
        <CardBody>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={t(dict, "filters.serviceType")} htmlFor="availability-bookable">
              <Select
                id="availability-bookable"
                value={selected.id}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {bookables.map((bookable) => (
                  <option key={bookable.id} value={bookable.id}>
                    {bookableName(bookable)}
                  </option>
                ))}
              </Select>
            </Field>
            <div className="flex items-end">
              <span className="text-sm text-rocky-600">
                {categoryLabel(dict, selected.category)}
              </span>
            </div>
          </div>
        </CardBody>
      </Card>

      {dataError !== null ? (
        <ErrorAlert dict={dict} error={dataError} onRetry={reload} />
      ) : null}

      {/* Capacity rules */}
      <Card>
        <CardHeader
          title={t(dict, "provider.availabilityRule")}
          action={
            rulesSaved ? (
              <span className="text-sm font-medium text-forest-700">
                {t(dict, "account.saved")}
              </span>
            ) : undefined
          }
        />
        <CardBody>
          {!dataReady ? (
            dataError === null ? <LoadingBlock text={t(dict, "common.loading")} /> : null
          ) : (
            <form onSubmit={onSaveRules} noValidate className="space-y-4">
              {rulesError ? (
                <Alert tone="danger" role="alert">
                  {rulesError}
                </Alert>
              ) : null}

              {ruleRows.length === 0 ? (
                <EmptyState compact title={t(dict, "common.empty")} />
              ) : (
                <div className="space-y-4">
                  {ruleRows.map((row) => (
                    <div
                      key={row.key}
                      className="rounded-lg border border-rocky-200 bg-rocky-50/60 p-4"
                    >
                      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                        <Field
                          label={t(dict, "booking.startDate")}
                          htmlFor={`rule-start-${row.key}`}
                          required
                        >
                          <Input
                            id={`rule-start-${row.key}`}
                            type="date"
                            value={row.startDate}
                            onChange={(e) => updateRuleRow(row.key, { startDate: e.target.value })}
                            disabled={savingRules}
                          />
                        </Field>
                        <Field
                          label={t(dict, "booking.endDate")}
                          htmlFor={`rule-end-${row.key}`}
                          hint={t(dict, "common.optional")}
                        >
                          <Input
                            id={`rule-end-${row.key}`}
                            type="date"
                            value={row.endDate}
                            onChange={(e) => updateRuleRow(row.key, { endDate: e.target.value })}
                            disabled={savingRules}
                          />
                        </Field>
                        <Field
                          label={t(dict, "filters.capacity")}
                          htmlFor={`rule-capacity-${row.key}`}
                          required
                        >
                          <Input
                            id={`rule-capacity-${row.key}`}
                            type="number"
                            min={0}
                            max={10000}
                            step={1}
                            value={row.capacity}
                            onChange={(e) => updateRuleRow(row.key, { capacity: e.target.value })}
                            disabled={savingRules}
                          />
                        </Field>
                        <div className="flex items-end justify-end">
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            onClick={() => removeRuleRow(row.key)}
                            disabled={savingRules}
                          >
                            {t(dict, "account.remove")}
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-wrap items-center justify-between gap-3">
                <Button
                  type="button"
                  variant="secondary"
                  onClick={addRuleRow}
                  disabled={savingRules}
                >
                  <span aria-hidden="true">{"+"}</span>
                  {t(dict, "filters.capacity")}
                </Button>
                <Button type="submit" loading={savingRules}>
                  {t(dict, "account.saveChanges")}
                </Button>
              </div>
            </form>
          )}
        </CardBody>
      </Card>

      {/* Blocks */}
      <Card>
        <CardHeader title={t(dict, "provider.blockDates")} />
        <CardBody className="space-y-5">
          {blockInfo ? (
            <Alert tone="success" role="status">
              {blockInfo}
            </Alert>
          ) : null}
          {blockBanner ? (
            <Alert tone="danger" role="alert">
              {blockBanner}
            </Alert>
          ) : null}

          <form onSubmit={onCreateBlock} noValidate className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-3">
              <Field
                label={t(dict, "booking.startDate")}
                htmlFor="block-start"
                required
                error={blockErrors.startDate}
              >
                <Input
                  id="block-start"
                  type="date"
                  value={blockStart}
                  onChange={(e) => setBlockStart(e.target.value)}
                  disabled={creatingBlock}
                />
              </Field>
              <Field
                label={t(dict, "booking.endDate")}
                htmlFor="block-end"
                required
                error={blockErrors.endDate}
              >
                <Input
                  id="block-end"
                  type="date"
                  value={blockEnd}
                  onChange={(e) => setBlockEnd(e.target.value)}
                  disabled={creatingBlock}
                />
              </Field>
              <Field
                label={t(dict, "provider.blockReason")}
                htmlFor="block-reason"
                hint={t(dict, "common.optional")}
                error={blockErrors.reason}
              >
                <Input
                  id="block-reason"
                  maxLength={200}
                  value={blockReason}
                  onChange={(e) => setBlockReason(e.target.value)}
                  disabled={creatingBlock}
                />
              </Field>
            </div>
            <div className="flex justify-end">
              <Button type="submit" loading={creatingBlock}>
                {t(dict, "provider.blockDates")}
              </Button>
            </div>
          </form>

          <div className="border-t border-rocky-100 pt-5">
            {!dataReady ? (
              dataError === null ? <LoadingBlock text={t(dict, "common.loading")} /> : null
            ) : (blocks ?? []).length === 0 ? (
              <EmptyState compact title={t(dict, "common.empty")} />
            ) : (
              <Table>
                <THead>
                  <tr>
                    <TH>{t(dict, "booking.startDate")}</TH>
                    <TH>{t(dict, "booking.endDate")}</TH>
                    <TH>{t(dict, "filters.availability")}</TH>
                    <TH>{t(dict, "provider.blockReason")}</TH>
                    <TH align="end" />
                  </tr>
                </THead>
                <tbody>
                  {(blocks ?? []).map((block) => (
                    <TR key={block.id}>
                      <TD className="whitespace-nowrap">{block.startDate.slice(0, 10)}</TD>
                      <TD className="whitespace-nowrap">{block.endDate.slice(0, 10)}</TD>
                      <TD>
                        <StatusBadge status={block.state} />
                      </TD>
                      <TD className="max-w-48 truncate">{block.reason ?? "—"}</TD>
                      <TD align="end">
                        <Button
                          size="sm"
                          variant="danger"
                          loading={removingId === block.id}
                          disabled={removingId !== null && removingId !== block.id}
                          onClick={() => void onRemoveBlock(block.id)}
                        >
                          {t(dict, "account.remove")}
                        </Button>
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
