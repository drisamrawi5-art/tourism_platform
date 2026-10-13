"use client";

import { useCallback, useEffect, useState } from "react";
import { ApiClientError, apiFetch, type PaginationMeta } from "@/lib/api/client";
import type { Dictionary } from "@/i18n";
import { formError } from "@/components/auth/helpers";

/**
 * Shared fetch state for the admin pages (thin client views over the
 * /api/v1/admin/* routes). `path === null` skips fetching entirely — used
 * while the session/role gate is still resolving.
 */
export type AdminFetchState<T> = {
  data: T | null;
  pagination: PaginationMeta | null;
  loading: boolean;
  error: unknown;
  /** Re-run the last fetch (after a mutation). */
  reload: () => void;
  /** Replace the local copy (optimistic or post-mutation update). */
  setData: (next: T) => void;
};

export function useAdminFetch<T>(path: string | null): AdminFetchState<T> {
  const [data, setData] = useState<T | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(path !== null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  useEffect(() => {
    if (path === null) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<T>(path)
      .then((res) => {
        if (cancelled) return;
        setData(res.data);
        setPagination(res.pagination ?? null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setData(null);
        setPagination(null);
        setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [path, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, pagination, loading, error, reload, setData };
}

/**
 * Operator-facing error copy: server messages for validation/permission/
 * conflict failures (400/403/404/409) are surfaced verbatim, everything
 * else falls back to the localized generic message.
 */
export function adminError(error: unknown, dict: Dictionary): string {
  if (error instanceof ApiClientError) {
    if (
      (error.status === 400 ||
        error.status === 403 ||
        error.status === 404 ||
        error.status === 409) &&
      error.message
    ) {
      return error.message;
    }
  }
  return formError(error, dict);
}
