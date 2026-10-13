"use client";

import { getDictionary, t } from "@/i18n";
import { useLocale } from "@/components/use-locale";
import { Badge, statusTone } from "@/components/ui/badge";

/**
 * Status badge with a localized label (StatusBadge renders the raw enum).
 * Falls back to the raw value when the dictionary has no entry, so an
 * unmapped status still displays honestly instead of leaking a dict key.
 *
 * Example: <LocalizedStatusBadge status="PAID" dictKey="booking.paymentStatuses" />
 */
export function LocalizedStatusBadge({
  status,
  dictKey,
}: {
  status: string;
  /** Dictionary section holding the labels, e.g. "booking.statuses". */
  dictKey: string;
}) {
  const locale = useLocale();
  const dict = getDictionary(locale);
  const fullKey = `${dictKey}.${status}`;
  const label = t(dict, fullKey);
  return <Badge tone={statusTone(status)}>{label === fullKey ? status : label}</Badge>;
}
