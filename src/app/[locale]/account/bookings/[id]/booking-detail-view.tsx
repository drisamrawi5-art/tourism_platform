"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import { notFound, useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate, formatMoney, defaultCurrency, isCurrencyCode } from "@/lib/currency";
import type { PublicBooking } from "@/lib/booking/serialize";
import type { InitiatePaymentResult } from "@/lib/payments/service";
import { Button, ButtonLink, LoadingBlock } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { StatusBadge } from "@/components/ui/badge";
import { Alert } from "@/components/ui/alert";
import { Field, Textarea } from "@/components/ui/field";
import { Table, THead, TH, TR, TD } from "@/components/ui/stat";
import { StarRating } from "@/components/account/star-rating";
import { formError, useRequireAuth } from "@/components/auth/helpers";

type PaymentInitiateResponse = InitiatePaymentResult | { payment: InitiatePaymentResult };

const CANCELLABLE_STATUSES = ["PENDING", "CONFIRMED"];

export function BookingDetailView({ locale, bookingId }: { locale: Locale; bookingId: string }) {
  const dict = getDictionary(locale);
  const router = useRouter();
  const { ready } = useRequireAuth(locale);

  const [booking, setBooking] = useState<PublicBooking | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [missing, setMissing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionInfo, setActionInfo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [ratingError, setRatingError] = useState<string | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);
  const [reviewDone, setReviewDone] = useState(false);
  const [reviewSubmitting, setReviewSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(false);
    setMissing(false);
    try {
      const res = await apiFetch<{ booking: PublicBooking }>(`/api/v1/bookings/${bookingId}`);
      setBooking(res.data.booking);
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 404) setMissing(true);
      else setLoadError(true);
    } finally {
      setLoading(false);
    }
  }, [bookingId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function onCancel() {
    if (busy || !booking) return;
    if (!window.confirm(t(dict, "booking.cancelConfirm"))) return;
    setBusy(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await apiFetch<{ booking: PublicBooking }>(
        `/api/v1/bookings/${booking.id}/cancel`,
        { method: "POST", body: {} },
      );
      setBooking(res.data.booking);
      setActionInfo(t(dict, "booking.cancelled"));
    } catch (error) {
      setActionError(formError(error, dict));
    } finally {
      setBusy(false);
    }
  }

  async function onPayNow() {
    if (busy || !booking) return;
    setBusy(true);
    setActionError(null);
    setActionInfo(null);
    try {
      const res = await apiFetch<PaymentInitiateResponse>("/api/v1/payments", {
        method: "POST",
        body: {
          bookingId: booking.id,
          mode: booking.paymentMode === "DEPOSIT" ? "DEPOSIT" : "FULL",
        },
      });
      const result = "payment" in res.data ? res.data.payment : res.data;
      if (result.checkoutUrl) {
        const url = result.checkoutUrl;
        if (url.startsWith("/")) router.push(url);
        else window.location.assign(url);
        return;
      }
      if (result.status === "succeeded") {
        await load();
        return;
      }
      setActionInfo(
        result.status === "not_configured"
          ? t(dict, "payment.notConfiguredBody")
          : t(dict, "payment.pending"),
      );
    } catch (error) {
      setActionError(formError(error, dict));
    } finally {
      setBusy(false);
    }
  }

  async function onReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reviewSubmitting || !booking) return;
    setRatingError(null);
    setReviewError(null);

    if (rating < 1) {
      setRatingError(t(dict, "common.required"));
      return;
    }
    const item = booking.items[0];
    if (!item) return;

    setReviewSubmitting(true);
    try {
      await apiFetch("/api/v1/reviews", {
        method: "POST",
        body: {
          bookingId: booking.id,
          bookableId: item.bookableId,
          rating,
          ...(comment.trim() ? { comment: comment.trim() } : {}),
        },
      });
      setReviewDone(true);
      setComment("");
    } catch (error) {
      if (error instanceof ApiClientError && error.status === 409) {
        setReviewError(t(dict, "reviews.notEligible"));
      } else {
        setReviewError(formError(error, dict));
      }
    } finally {
      setReviewSubmitting(false);
    }
  }

  if (!ready) return null;
  if (missing) notFound();

  if (loading && !booking) return <LoadingBlock text={t(dict, "common.loading")} />;

  if (loadError && !booking) {
    return (
      <div className="space-y-4">
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {t(dict, "errors.serverErrorBody")}
        </Alert>
        <Button variant="secondary" onClick={() => void load()}>
          {t(dict, "common.retry")}
        </Button>
      </div>
    );
  }

  if (!booking) return <LoadingBlock text={t(dict, "common.loading")} />;

  const currency = isCurrencyCode(booking.currency) ? booking.currency : defaultCurrency;
  const money = (amount: string) => formatMoney(amount, currency, locale);
  const canCancel = CANCELLABLE_STATUSES.includes(booking.status);
  const canPay = booking.paymentStatus === "UNPAID" && booking.payments.length === 0;
  const canReview = booking.status === "COMPLETED";
  const firstItem = booking.items[0];
  const itemsTitle =
    firstItem?.category === "ACCOMMODATION" ? t(dict, "stay.rooms") : t(dict, "guides.services");

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader
          title={
            <span className="flex flex-wrap items-center gap-3">
              <span>{booking.reference}</span>
              <StatusBadge status={booking.status} />
              <StatusBadge status={booking.paymentStatus} />
            </span>
          }
          description={booking.business?.name ?? undefined}
          action={
            <div className="flex flex-wrap gap-2">
              {canPay ? (
                <Button variant="accent" loading={busy} onClick={() => void onPayNow()}>
                  {t(dict, "booking.payNow")}
                </Button>
              ) : null}
              {canCancel ? (
                <Button variant="danger" loading={busy} onClick={() => void onCancel()}>
                  {t(dict, "booking.cancelBooking")}
                </Button>
              ) : null}
            </div>
          }
        />
        <CardBody className="space-y-4">
          {actionError ? (
            <Alert tone="danger" role="alert">
              {actionError}
            </Alert>
          ) : null}
          {actionInfo ? (
            <Alert tone="info" role="status">
              {actionInfo}
            </Alert>
          ) : null}
          {booking.holdExpiresAt && booking.paymentStatus === "UNPAID" ? (
            <Alert tone="warning" role="status">
              {t(dict, "booking.holdExpiring")}
            </Alert>
          ) : null}
          {booking.cancelledAt ? (
            <Alert tone="danger" role="status">
              {t(dict, "booking.cancelled")}
            </Alert>
          ) : null}

          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.startDate")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{formatDate(booking.startDate, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.endDate")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{formatDate(booking.endDate, locale)}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.guests")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">{booking.guests}</dd>
            </div>
            <div>
              <dt className="text-xs font-medium uppercase tracking-wide text-rocky-500">
                {t(dict, "booking.paymentStatus")}
              </dt>
              <dd className="mt-0.5 text-rocky-800">
                {t(dict, `booking.paymentStatuses.${booking.paymentStatus}`)}
              </dd>
            </div>
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={itemsTitle} />
        <CardBody>
          <Table>
            <THead>
              <tr>
                <TH>{t(dict, "provider.serviceName")}</TH>
                <TH>{t(dict, "booking.startDate")}</TH>
                <TH>{t(dict, "booking.endDate")}</TH>
                <TH>{t(dict, "booking.guests")}</TH>
                <TH align="end">{t(dict, "booking.total")}</TH>
              </tr>
            </THead>
            <tbody>
              {booking.items.map((item) => (
                <TR key={item.bookableId}>
                  <TD className="font-medium text-rocky-900">{item.name ?? item.bookableId}</TD>
                  <TD className="whitespace-nowrap">{formatDate(item.startDate, locale)}</TD>
                  <TD className="whitespace-nowrap">{formatDate(item.endDate, locale)}</TD>
                  <TD>{item.guests}</TD>
                  <TD align="end" className="whitespace-nowrap font-medium tabular-nums">
                    {money(item.subtotal)}
                  </TD>
                </TR>
              ))}
            </tbody>
          </Table>

          <div className="mt-6">
            <h3 className="text-sm font-semibold text-rocky-800">
              {t(dict, "booking.cancellationPolicy")}
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-rocky-600">
              {booking.cancellationPolicyText ?? t(dict, "booking.noCancellationPolicy")}
            </p>
          </div>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "booking.priceSummary")} />
        <CardBody>
          <dl className="space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-rocky-600">{t(dict, "booking.subtotal")}</dt>
              <dd className="font-medium tabular-nums text-rocky-900">{money(booking.subtotal)}</dd>
            </div>
            {booking.depositEnabled && booking.depositAmount ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-rocky-600">{t(dict, "booking.payDeposit")}</dt>
                <dd className="font-medium tabular-nums text-rocky-900">
                  {money(booking.depositAmount)}
                </dd>
              </div>
            ) : null}
            <div className="flex items-baseline justify-between gap-3 border-t border-rocky-200 pt-2">
              <dt className="font-semibold text-rocky-900">{t(dict, "booking.total")}</dt>
              <dd className="text-base font-semibold tabular-nums text-rocky-900">
                {money(booking.total)}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-3 pt-1">
              <dt className="text-rocky-600">{t(dict, "booking.paymentStatuses.PAID")}</dt>
              <dd className="font-medium tabular-nums text-forest-700">{money(booking.amountPaid)}</dd>
            </div>
            {booking.amountRefunded !== "0" && Number(booking.amountRefunded) > 0 ? (
              <div className="flex items-baseline justify-between gap-3">
                <dt className="text-rocky-600">{t(dict, "booking.paymentStatuses.REFUNDED")}</dt>
                <dd className="font-medium tabular-nums text-rocky-900">
                  {money(booking.amountRefunded)}
                </dd>
              </div>
            ) : null}
          </dl>
        </CardBody>
      </Card>

      <Card>
        <CardHeader title={t(dict, "payment.title")} description={t(dict, "payment.secureNote")} />
        <CardBody>
          {booking.payments.length === 0 ? (
            <p className="text-sm text-rocky-600">{t(dict, "common.empty")}</p>
          ) : (
            <ul className="divide-y divide-rocky-100">
              {booking.payments.map((payment) => (
                <li
                  key={payment.id}
                  className="flex flex-wrap items-center gap-x-4 gap-y-1 py-3 first:pt-0 last:pb-0"
                >
                  <span className="font-medium text-rocky-900">
                    {formatMoney(
                      payment.amount,
                      isCurrencyCode(payment.currency) ? payment.currency : currency,
                      locale,
                    )}
                  </span>
                  <span className="text-sm text-rocky-600">
                    {payment.mode === "DEPOSIT"
                      ? t(dict, "booking.payDeposit")
                      : t(dict, "booking.payFull")}
                  </span>
                  <StatusBadge status={payment.status} />
                  <span className="ms-auto text-sm text-rocky-500">
                    {formatDate(payment.createdAt, locale, {
                      dateStyle: "medium",
                      timeStyle: "short",
                    })}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {canReview ? (
        <Card>
          <CardHeader
            title={t(dict, "reviews.writeTitle")}
            description={t(dict, "reviews.verifiedStay")}
          />
          <CardBody>
            {reviewDone ? (
              <Alert tone="success" role="status">
                {t(dict, "reviews.submitted")}
              </Alert>
            ) : (
              <form onSubmit={onReview} noValidate className="space-y-4">
                {reviewError ? (
                  <Alert tone="danger" role="alert">
                    {reviewError}
                  </Alert>
                ) : null}
                <StarRating
                  dict={dict}
                  name="review-rating"
                  value={rating}
                  onChange={(n) => {
                    setRating(n);
                    setRatingError(null);
                  }}
                  disabled={reviewSubmitting}
                />
                {ratingError ? (
                  <p role="alert" className="text-xs font-medium text-danger-600">
                    {ratingError}
                  </p>
                ) : null}
                <Field
                  label={t(dict, "reviews.comment")}
                  htmlFor="review-comment"
                  hint={t(dict, "common.optional")}
                >
                  <Textarea
                    id="review-comment"
                    name="comment"
                    maxLength={2000}
                    placeholder={t(dict, "reviews.commentPlaceholder")}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    disabled={reviewSubmitting}
                  />
                </Field>
                <Button type="submit" loading={reviewSubmitting}>
                  {t(dict, "reviews.submit")}
                </Button>
              </form>
            )}
          </CardBody>
        </Card>
      ) : null}

      <div className="flex flex-wrap justify-between gap-3">
        <ButtonLink href={`/${locale}/account/bookings`} variant="ghost">
          {t(dict, "common.back")}
        </ButtonLink>
        <ButtonLink href={`/${locale}/account`} variant="secondary">
          {t(dict, "nav.account")}
        </ButtonLink>
      </div>
    </div>
  );
}
