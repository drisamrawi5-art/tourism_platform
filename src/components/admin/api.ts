"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch, type PaginationMeta } from "@/lib/api/client";

/**
 * Minimal client data hook for the admin portal.
 *
 * - `url === null` skips the request (used while the session or the required
 *   permission is still unknown, so unprivileged users never fire calls that
 *   the API will reject with 403).
 * - Stale data stays visible while reloading, so pagination and mutations do
 *   not flash the loading block over existing content.
 */
export type ApiState<T> = {
  data: T | null;
  pagination: PaginationMeta | null;
  loading: boolean;
  error: unknown;
  reload: () => void;
  setData: (next: T | ((prev: T | null) => T | null)) => void;
};

export function useApi<T>(url: string | null): ApiState<T> {
  const [data, setDataState] = useState<T | null>(null);
  const [pagination, setPagination] = useState<PaginationMeta | null>(null);
  const [loading, setLoading] = useState(url !== null);
  const [error, setError] = useState<unknown>(null);
  const [nonce, setNonce] = useState(0);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  const setData = useCallback((next: T | ((prev: T | null) => T | null)) => {
    setDataState((prev) =>
      typeof next === "function" ? (next as (p: T | null) => T | null)(prev) : next,
    );
  }, []);

  useEffect(() => {
    if (url === null) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    apiFetch<T>(url)
      .then((res) => {
        if (cancelled) return;
        setDataState(res.data ?? null);
        setPagination(res.pagination ?? null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [url, nonce]);

  return { data, pagination, loading, error, reload, setData };
}
