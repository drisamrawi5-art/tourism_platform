/**
 * Typed browser/Server-Action fetch wrapper for the versioned API.
 *
 * Response envelopes (src/lib/api/handler.ts):
 *   success → { data, requestId } or { data, pagination, requestId }
 *   error   → { error: { code, message, details? } } with a non-2xx status
 *
 * Same-origin requests carry the session cookie automatically; mutating
 * requests include the Origin header the handler validates (CSRF).
 */

export type PaginationMeta = {
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
};

export type Envelope<T> = {
  data: T;
  pagination?: PaginationMeta;
  requestId?: string;
};

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: Record<string, string[]>;

  constructor(status: number, code: string, message: string, details?: Record<string, string[]>) {
    super(message);
    this.name = 'ApiClientError';
    this.status = status;
    this.code = code;
    this.details = details;
  }

  /** Field-level validation errors from Zod (path → messages). */
  fieldErrors(): Record<string, string | undefined> {
    const out: Record<string, string> = {};
    for (const [key, messages] of Object.entries(this.details ?? {})) {
      const first = messages[0];
      if (first) out[key] = first;
    }
    return out;
  }
}

export type ApiFetchOptions = {
  method?: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** ms; default 15000. 0 disables. */
  timeoutMs?: number;
};

export async function apiFetch<T>(
  path: string,
  options: ApiFetchOptions = {},
): Promise<Envelope<T>> {
  const { method = 'GET', body, headers, signal, timeoutMs = 15_000 } = options;

  const controller = new AbortController();
  const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(), timeoutMs) : null;
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', () => controller.abort(), { once: true });
  }

  try {
    const response = await fetch(path, {
      method,
      credentials: 'same-origin',
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...headers,
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    });

    if (response.status === 204) {
      return { data: undefined as T };
    }

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      payload = null;
    }

    if (!response.ok) {
      const err = (
        payload as {
          error?: { code?: string; message?: string; details?: Record<string, string[]> };
        } | null
      )?.error;
      throw new ApiClientError(
        response.status,
        err?.code ?? 'UNKNOWN_ERROR',
        err?.message ?? `Request failed (${response.status})`,
        err?.details,
      );
    }

    return (payload ?? {}) as Envelope<T>;
  } catch (error) {
    if (error instanceof ApiClientError) throw error;
    if (error instanceof DOMException && error.name === 'AbortError') {
      throw new ApiClientError(408, 'TIMEOUT', 'The request timed out');
    }
    throw new ApiClientError(0, 'NETWORK_ERROR', 'Network error — check your connection');
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Convenience: unwrap the `data` field. */
export async function apiData<T>(path: string, options?: ApiFetchOptions): Promise<T> {
  const envelope = await apiFetch<T>(path, options);
  return envelope.data;
}

/** Build a query string from a record, skipping empty/undefined values. */
export function qs(params: Record<string, string | number | undefined | null>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === '') continue;
    search.set(key, String(value));
  }
  const str = search.toString();
  return str ? `?${str}` : '';
}
