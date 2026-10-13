"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { apiFetch, qs } from "@/lib/api/client";
import { getDictionary, t } from "@/i18n";
import type { Locale } from "@/i18n/config";
import { formatDate, formatMoney, defaultCurrency, isCurrencyCode } from "@/lib/currency";
import type { PublicBooking } from "@/lib/booking/serialize";
import { Card, CardBody, CardHeader } from "@/components/ui/card";
import { ButtonLink } from "@/components/ui/button";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Alert, EmptyState } from "@/components/ui/alert";
import { useRequireAuth } from "@/components/auth/helpers";

type OverviewData = {
  unread: number;
  bookings: PublicBooking[];
};

export function AccountOverview({ locale }: { locale: Locale }) {
  const dict = getDictionary(locale);
  const { user, ready } = useRequireAuth(locale);
  const [data, setData] = useState<OverviewData | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [notifications, bookings] = await Promise.all([
        apiFetch<{ items: unknown[]; total: number; unread: number }>(
          `/api/v1/account/notifications${qs({ page: 1, perPage: 1 })}`,
        ),
        apiFetch<PublicBooking[]>(`/api/v1/bookings/mine${qs({ page: 1, perPage: 3 })}`),
      ]);
      setData({
        unread: notifications.data.unread ?? 0,
        bookings: bookings.data ?? [],
      });
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  if (!ready || !user) return null;

  const currencyFor = (booking: PublicBooking) =>
    isCurrencyCode(booking.currency) ? booking.currency : defaultCurrency;

  return (
    <div className="space-y-6">
      {error ? (
        <Alert tone="danger" role="alert" title={t(dict, "common.error")}>
          {t(dict, "errors.serverErrorBody")}
        </Alert>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-3">
        <Card>
          <CardHeader
            title={t(dict, "account.profile")}
            action={
              <Link
                href={`/${locale}/account/profile`}
                className="text-sm font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
              >
                {t(dict, "account.settings")}
              </Link>
            }
          />
          <CardBody className="space-y-3">
            <p className="text-base font-semibold text-rocky-900">{user.name ?? user.email}</p>
            <p className="text-sm text-rocky-600">{user.email}</p>
            <div>
              {user.emailVerifiedAt ? (
                <Badge tone="success">{t(dict, "common.verification.VERIFIED")}</Badge>
              ) : (
                <Badge tone="warning">{t(dict, "common.pendingVerification")}</Badge>
              )}
            </div>
          </CardBody>
        </Card>

        <Card>
          <CardHeader
            title={t(dict, "account.notifications")}
            action={
              <Link
                href={`/${locale}/account/profile`}
                className="text-sm font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
              >
                {t(dict, "account.profile")}
              </Link>
            }
          />
          <CardBody className="space-y-3">
            <p className="text-2xl font-semibold tabular-nums text-forest-700">
              {data ? data.unread : "—"}
            </p>
            <p className="text-sm text-rocky-600">
              {data && data.unread > 0
                ? t(dict, "notifications.unread", { n: data.unread })
                : t(dict, "account.noNotifications")}
            </p>
          </CardBody>
        </Card>

        <Card>
          <CardHeader title={t(dict, "nav.bookNow")} />
          <CardBody className="flex flex-wrap gap-3">
            <ButtonLink href={`/${locale}/account/wishlist`} variant="secondary">
              {t(dict, "nav.wishlist")}
            </ButtonLink>
            <ButtonLink href={`/${locale}/stay`}>{t(dict, "nav.bookNow")}</ButtonLink>
            <ButtonLink href={`/${locale}/guides`} variant="ghost">
              {t(dict, "nav.guides")}
            </ButtonLink>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader
          title={t(dict, "booking.myBookings")}
          action={
            <Link
              href={`/${locale}/account/bookings`}
              className="text-sm font-medium text-water-700 underline underline-offset-2 hover:text-water-800"
            >
              {t(dict, "common.viewAll")}
            </Link>
          }
        />
        <CardBody>
          {!data ? null : data.bookings.length === 0 ? (
            <EmptyState
              compact
              title={t(dict, "booking.noBookings")}
              description={t(dict, "booking.noBookingsBody")}
              action={{ href: `/${locale}/stay`, label: t(dict, "nav.bookNow") }}
            />
          ) : (
            <ul className="divide-y divide-rocky-100">
              {data.bookings.map((booking) => (
                <li key={booking.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3 first:pt-0 last:pb-0">
                  <Link
                    href={`/${locale}/account/bookings/${booking.id}`}
                    className="font-medium text-rocky-900 underline-offset-2 hover:underline"
                  >
                    {booking.reference}
                  </Link>
                  <StatusBadge status={booking.status} />
                  <span className="text-sm text-rocky-600">
                    {formatDate(booking.startDate, locale)}
                  </span>
                  <span className="ms-auto text-sm font-medium tabular-nums text-rocky-900">
                    {formatMoney(booking.total, currencyFor(booking), locale)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>
    </div>
  );
}
