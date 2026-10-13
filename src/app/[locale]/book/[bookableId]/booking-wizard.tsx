"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { apiFetch, ApiClientError } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatMoney, defaultCurrency, isCurrencyCode } from "@/lib/currency";
import type { BookingQuote } from "@/lib/booking/service";
import type { PublicBooking } from "@/lib/booking/serialize";
import type { InitiatePaymentResult } from "@/lib/payments/service";
import { Button, ButtonLink, LoadingBlock } from "@/components/ui/button";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Alert } from "@/components/ui/alert";
import { BookingSummary } from "@/components/booking/booking-summary";
import { fetchMe, formError, todayIso } from "@/components/auth/helpers";

type QuoteResponse = BookingQuote | { quote: BookingQuote };
type PaymentInitiateResponse = InitiatePaymentResult | { payment: InitiatePaymentResult };

const GUESTS_MIN = 1;
const GUESTS_MAX = 10;

export function BookingWizard({ locale, bookableId }: { locale: Locale; bookableId: string }) {
  const dict = getDictionary(locale);
  const router = useRouter();

  const [step, setStep] = useState<"form" | "review">("form");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [guests, setGuests] = useState(1);
  const [errors, setErrors] = useState<Record<string, string | undefined>>({});
  const [errorText, setErrorText] = useState<string | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [quote, setQuote] = useState<BookingQuote | null>(null);

  const [paymentMode, setPaymentMode] = useState<"FULL" | "DEPOSIT">("FULL");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [customerNote, setCustomerNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const idempotencyKey = useRef<string | null>(null);
  const draftRestored = useRef(false);

  const draftKey = `visit-imedwan:book:${bookableId}`;

  // Restore a booking draft left behind when sign-in was required.
  useEffect(() => {
    if (draftRestored.current) return;
    draftRestored.current = true;
    try {
      const raw = sessionStorage.getItem(draftKey);
      if (!raw) return;
      sessionStorage.removeItem(draftKey);
      const draft = JSON.parse(raw) as {
        startDate?: unknown;
        endDate?: unknown;
        guests?: unknown;
      };
      if (typeof draft.startDate === "string") setStartDate(draft.startDate);
      if (typeof draft.endDate === "string") setEndDate(draft.endDate);
      if (
        typeof draft.guests === "number" &&
        Number.isFinite(draft.guests) &&
        draft.guests >= GUESTS_MIN &&
        draft.guests <= GUESTS_MAX
      ) {
        setGuests(draft.guests);
      }
    } catch {
      // A malformed draft is simply ignored.
    }
  }, [draftKey]);

  async function onQuote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (quoting) return;
    setErrors({});
    setErrorText(null);

    const nextErrors: Record<string, string | undefined> = {};
    if (!startDate) nextErrors.startDate = t(dict, "booking.dateRequired");
    if (!endDate) nextErrors.endDate = t(dict, "booking.dateRequired");
    if (startDate && endDate && endDate < startDate) {
      nextErrors.endDate = t(dict, "booking.endAfterStart");
    }
    if (!Number.isFinite(guests) || guests < GUESTS_MIN || guests > GUESTS_MAX) {
      nextErrors.guests = t(dict, "booking.guestsRequired");
    }
    if (Object.values(nextErrors).some(Boolean)) {
      setErrors(nextErrors);
      return;
    }

    setQuoting(true);
    try {
      const res = await apiFetch<QuoteResponse>("/api/v1/bookings/quote", {
        method: "POST",
        body: { bookableId, startDate, endDate, guests },
      });
      const nextQuote = "quote" in res.data ? res.data.quote : res.data;
      if (!nextQuote.availability.available) {
        setErrorText(t(dict, "booking.notAvailable"));
        return;
      }
      setQuote(nextQuote);
      setPaymentMode("FULL");
      setStep("review");
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      if (error instanceof ApiClientError) {
        switch (error.code) {
          case "NOT_AVAILABLE":
            setErrorText(t(dict, "booking.notAvailable"));
            break;
          case "FULL_FOR_DATES":
            setErrorText(t(dict, "booking.fullForDates"));
            break;
          case "PRICE_NOT_CONFIGURED":
            setErrorText(t(dict, "common.notConfigured"));
            break;
          case "INVALID_DATE_RANGE":
            setErrors({ endDate: t(dict, "booking.endAfterStart") });
            break;
          case "DATE_IN_PAST":
            setErrors({ startDate: t(dict, "booking.dateRequired") });
            break;
          case "INVALID_GUESTS":
          case "GUESTS_EXCEED_CAPACITY":
            setErrors({ guests: t(dict, "booking.guestsRequired") });
            break;
          default:
            if (Object.keys(error.details ?? {}).length > 0) setErrors(error.fieldErrors());
            else setErrorText(formError(error, dict));
        }
      } else {
        setErrorText(formError(error, dict));
      }
    } finally {
      setQuoting(false);
    }
  }

  async function onConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !quote) return;
    setErrors({});
    setErrorText(null);

    // Auth is required to create the booking — keep the draft for the return trip.
    const me = await fetchMe();
    if (!me) {
      try {
        sessionStorage.setItem(
          draftKey,
          JSON.stringify({ startDate, endDate, guests }),
        );
      } catch {
        // Storage may be unavailable — the visitor can re-enter their dates.
      }
      router.push(`/${locale}/login?next=${encodeURIComponent(`/${locale}/book/${bookableId}`)}`);
      return;
    }

    const bookingKey = idempotencyKey.current ?? (idempotencyKey.current = crypto.randomUUID());
    setSubmitting(true);
    try {
      const created = await apiFetch<{ booking: PublicBooking }>("/api/v1/bookings", {
        method: "POST",
        headers: { "Idempotency-Key": bookingKey },
        body: {
          bookableId,
          startDate,
          endDate,
          guests,
          paymentMode,
          ...(customerName.trim() ? { customerName: customerName.trim() } : {}),
          ...(customerPhone.trim() ? { customerPhone: customerPhone.trim() } : {}),
          ...(customerNote.trim() ? { customerNote: customerNote.trim() } : {}),
        },
      });
      const booking = created.data.booking;

      try {
        const initiated = await apiFetch<PaymentInitiateResponse>("/api/v1/payments", {
          method: "POST",
          body: { bookingId: booking.id, mode: paymentMode },
        });
        const result = "payment" in initiated.data ? initiated.data.payment : initiated.data;
        if (result.checkoutUrl) {
          const url = result.checkoutUrl;
          if (url.startsWith("/")) router.push(url);
          else window.location.assign(url);
          return;
        }
      } catch {
        // Payment could not start — the booking exists and is payable later.
      }
      router.push(`/${locale}/account/bookings/${booking.id}`);
    } catch (error) {
      if (error instanceof ApiClientError) {
        switch (error.code) {
          case "NOT_AVAILABLE":
            setErrorText(t(dict, "booking.notAvailable"));
            break;
          case "FULL_FOR_DATES":
            setErrorText(t(dict, "booking.fullForDates"));
            break;
          case "PRICE_NOT_CONFIGURED":
            setErrorText(t(dict, "common.notConfigured"));
            break;
          case "INVALID_DATE_RANGE":
            setStep("form");
            setErrors({ endDate: t(dict, "booking.endAfterStart") });
            break;
          case "DATE_IN_PAST":
            setStep("form");
            setErrors({ startDate: t(dict, "booking.dateRequired") });
            break;
          case "INVALID_GUESTS":
          case "GUESTS_EXCEED_CAPACITY":
            setStep("form");
            setErrors({ guests: t(dict, "booking.guestsRequired") });
            break;
          default:
            setErrorText(formError(error, dict));
        }
      } else {
        setErrorText(formError(error, dict));
      }
      // The same idempotency key is reused if the visitor retries.
    } finally {
      setSubmitting(false);
    }
  }

  const currency = quote
    ? isCurrencyCode(quote.currency)
      ? quote.currency
      : defaultCurrency
    : defaultCurrency;
  const money = (amount: string) => formatMoney(amount, currency, locale);
  const depositAvailable = Boolean(quote?.deposit?.enabled);
  const backBase =
    quote?.bookable.category === "GUIDE" ? `/${locale}/guides` : `/${locale}/stay`;

  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-14">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold text-rocky-900 sm:text-3xl">
          {t(dict, "booking.title")}
        </h1>
        <Link
          href={`/${locale}/discover`}
          className="text-sm font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
        >
          {t(dict, "nav.discover")}
        </Link>
      </div>

      <ol className="mb-6 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
        <li
          className={`rounded-full px-3 py-1 ${
            step === "form" ? "bg-forest-600 text-white" : "bg-forest-100 text-forest-800"
          }`}
        >
          {t(dict, "booking.steps.dates")}
        </li>
        <li
          className={`rounded-full px-3 py-1 ${
            step === "review" ? "bg-forest-600 text-white" : "bg-rocky-100 text-rocky-700"
          }`}
        >
          {t(dict, "booking.steps.summary")}
        </li>
      </ol>

      {errorText ? (
        <div className="mb-6">
          <Alert tone="danger" role="alert">
            {errorText}
          </Alert>
        </div>
      ) : null}

      {step === "form" ? (
        <Card>
          <CardHeader
            title={t(dict, "booking.steps.dates")}
            description={t(dict, "booking.checkDates")}
          />
          <CardBody>
            <div className="mb-6">
              <Alert tone="info">{t(dict, "plan.bookingInfoBody")}</Alert>
            </div>

            <form onSubmit={onQuote} noValidate className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-3">
                <Field
                  label={t(dict, "booking.startDate")}
                  htmlFor="book-start"
                  required
                  error={errors.startDate}
                >
                  <Input
                    id="book-start"
                    name="startDate"
                    type="date"
                    required
                    min={todayIso()}
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    disabled={quoting}
                  />
                </Field>

                <Field
                  label={t(dict, "booking.endDate")}
                  htmlFor="book-end"
                  required
                  error={errors.endDate}
                >
                  <Input
                    id="book-end"
                    name="endDate"
                    type="date"
                    required
                    min={startDate || todayIso()}
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    disabled={quoting}
                  />
                </Field>

                <Field
                  label={t(dict, "booking.guests")}
                  htmlFor="book-guests"
                  required
                  error={errors.guests}
                >
                  <Input
                    id="book-guests"
                    name="guests"
                    type="number"
                    inputMode="numeric"
                    required
                    min={GUESTS_MIN}
                    max={GUESTS_MAX}
                    value={guests}
                    onChange={(e) => setGuests(Number(e.target.value))}
                    disabled={quoting}
                  />
                </Field>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <ButtonLink href={backBase} variant="ghost">
                  {t(dict, "common.back")}
                </ButtonLink>
                <Button type="submit" loading={quoting}>
                  {t(dict, "stay.checkAvailability")}
                </Button>
              </div>
            </form>

            {quoting ? (
              <div className="mt-6">
                <LoadingBlock text={t(dict, "common.loading")} />
              </div>
            ) : null}
          </CardBody>
        </Card>
      ) : quote ? (
        <div className="space-y-6">
          <Card>
            <CardHeader
              title={t(dict, "booking.reviewBeforePay")}
              description={quote.bookable.businessName}
            />
            <CardBody className="space-y-6">
              <BookingSummary quote={quote} dict={dict} locale={locale} />

              <fieldset className="border-t border-rocky-200 pt-4">
                <legend className="mb-2 text-sm font-semibold text-rocky-800">
                  {t(dict, "payment.title")}
                </legend>
                <div className="space-y-3">
                  <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-rocky-200 p-3">
                    <input
                      type="radio"
                      name="paymentMode"
                      value="FULL"
                      checked={paymentMode === "FULL"}
                      onChange={() => setPaymentMode("FULL")}
                      className="mt-0.5 size-4 accent-forest-600"
                    />
                    <span>
                      <span className="block text-sm font-medium text-rocky-800">
                        {t(dict, "booking.payFull")}
                      </span>
                      <span className="mt-0.5 block text-xs text-rocky-600">
                        {t(dict, "booking.fullNote")}
                      </span>
                    </span>
                  </label>

                  {depositAvailable && quote.deposit ? (
                    <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-rocky-200 p-3">
                      <input
                        type="radio"
                        name="paymentMode"
                        value="DEPOSIT"
                        checked={paymentMode === "DEPOSIT"}
                        onChange={() => setPaymentMode("DEPOSIT")}
                        className="mt-0.5 size-4 accent-forest-600"
                      />
                      <span>
                        <span className="block text-sm font-medium text-rocky-800">
                          {t(dict, "booking.payDeposit")}
                        </span>
                        <span className="mt-0.5 block text-xs text-rocky-600">
                          {t(dict, "booking.depositNote", {
                            percent: quote.deposit.percent,
                            amount: money(quote.deposit.amount),
                          })}
                        </span>
                      </span>
                    </label>
                  ) : null}
                </div>
              </fieldset>

              <div className="border-t border-rocky-200 pt-4">
                <h3 className="mb-3 text-sm font-semibold text-rocky-800">
                  {t(dict, "booking.yourDetails")}
                </h3>
                <div className="space-y-4">
                  <Field
                    label={t(dict, "booking.fullName")}
                    htmlFor="customer-name"
                    hint={t(dict, "common.optional")}
                  >
                    <Input
                      id="customer-name"
                      name="customerName"
                      autoComplete="name"
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      disabled={submitting}
                    />
                  </Field>
                  <Field
                    label={t(dict, "booking.phone")}
                    htmlFor="customer-phone"
                    hint={t(dict, "common.optional")}
                  >
                    <Input
                      id="customer-phone"
                      name="customerPhone"
                      type="tel"
                      autoComplete="tel"
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      disabled={submitting}
                    />
                  </Field>
                  <Field
                    label={t(dict, "booking.note")}
                    htmlFor="customer-note"
                    hint={t(dict, "common.optional")}
                  >
                    <Textarea
                      id="customer-note"
                      name="customerNote"
                      maxLength={1000}
                      placeholder={t(dict, "booking.notePlaceholder")}
                      value={customerNote}
                      onChange={(e) => setCustomerNote(e.target.value)}
                      disabled={submitting}
                    />
                  </Field>
                </div>
              </div>

              <form onSubmit={onConfirm} className="flex flex-wrap items-center justify-between gap-3 border-t border-rocky-200 pt-4">
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setStep("form")}
                  disabled={submitting}
                >
                  {t(dict, "common.back")}
                </Button>
                <Button type="submit" variant="accent" loading={submitting}>
                  {submitting ? t(dict, "booking.creatingBooking") : t(dict, "booking.confirmBooking")}
                </Button>
              </form>
            </CardBody>
          </Card>

          <div className="flex flex-wrap justify-end gap-3">
            <ButtonLink href={`/${locale}/account/bookings`} variant="ghost">
              {t(dict, "booking.myBookings")}
            </ButtonLink>
          </div>
        </div>
      ) : null}
    </div>
  );
}
