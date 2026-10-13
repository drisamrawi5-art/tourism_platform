import { apiFetch, qs } from "@/lib/api/client";
import type { ProviderBookable } from "./types";

/**
 * Data helpers shared by the provider portal views.
 * All fetching happens in the browser through apiFetch (session cookie + CSRF
 * origin header); every caller handles ApiClientError itself.
 */

/** YYYY-MM-DD in UTC (same semantics as the API's own range defaults). */
export function isoDay(offsetDays = 0): string {
  return new Date(Date.now() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

/**
 * Every bookable of the signed-in provider.
 *
 * The API has no GET /provider/bookables/[id], so detail/availability pages
 * page through the list (100/page, bounded) and pick the row they need.
 */
export async function fetchAllBookables(): Promise<ProviderBookable[]> {
  const all: ProviderBookable[] = [];
  for (let page = 1; page <= 10; page += 1) {
    const res = await apiFetch<ProviderBookable[]>(
      `/api/v1/provider/bookables${qs({ page, perPage: 100 })}`,
    );
    const items = res.data ?? [];
    all.push(...items);
    const meta = res.pagination;
    if (!meta || page >= meta.totalPages) break;
  }
  return all;
}

/** Display name of a bookable: unit / service name, else its slug. */
export function bookableName(b: ProviderBookable): string {
  return b.unit?.name ?? b.guideService?.name ?? b.slug;
}
