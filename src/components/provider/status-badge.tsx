import { t, type Dictionary } from "@/i18n";
import { Badge, statusTone } from "@/components/ui/badge";

/**
 * Status badge with a localized TEXT label (never color alone).
 * Resolution order covers publication, booking, payment and availability
 * enums; unknown values fall back to the raw enum value.
 */
const LABEL_SOURCES = [
  "common.status",
  "booking.statuses",
  "booking.paymentStatuses",
  "provider.states",
] as const;

export function statusLabel(dict: Dictionary, value: string): string {
  for (const source of LABEL_SOURCES) {
    const key = `${source}.${value}`;
    const label = t(dict, key);
    if (label !== key) return label;
  }
  return value;
}

export function LocalizedStatus({
  dict,
  status,
}: {
  dict: Dictionary;
  status: string;
}) {
  return <Badge tone={statusTone(status)}>{statusLabel(dict, status)}</Badge>;
}
