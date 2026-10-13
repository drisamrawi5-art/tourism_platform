import { randomUUID } from 'node:crypto';
import type { Role } from '@prisma/client';
import { ZodError, type ZodType } from 'zod';
import { ApiError, errorResponse, zodToDetails } from '@/lib/api/errors';
import { AuthError } from '@/lib/auth/rbac';
import { roleHasPermission, type Permission } from '@/lib/auth/permissions';
import { getCurrentUser, type SessionUser } from '@/lib/auth/session';
import { rateLimit, type RateLimitRule } from '@/lib/rate-limit';
import { logger } from '@/lib/logger';
import { env } from '@/lib/env';

/**
 * Versioned API route factory (spec section 57).
 *
 * Every /api/v1 route created with createHandler() gets, in order:
 *  1. request id + structured access log
 *  2. method check
 *  3. CSRF/origin check on mutating requests (SameSite is not the only defence)
 *  4. server-side Zod validation (body/query/params)
 *  5. rate limiting (per-route rule)
 *  6. authentication (optional/required, optional verified-email gate)
 *  7. RBAC permission/role checks
 *  8. handler execution
 *  9. uniform error handling (never leaks internals or secrets)
 *
 * The client is NEVER trusted for price, availability, roles, booking state
 * or payment state — those are computed in services, not in routes.
 */

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

const MUTATING: ReadonlySet<string> = new Set(['POST', 'PUT', 'PATCH', 'DELETE']);

export type HandlerInput<P = Record<string, string>, B = unknown, Q = Record<string, string>> = {
  req: Request;
  params: P;
  body: B;
  query: Q;
  user: SessionUser | null;
  ip: string;
  userAgent: string | null;
  requestId: string;
};

export type HandlerResult = Response | { status?: number; data: unknown };

export type HandlerOptions<
  P extends Record<string, string>,
  B,
  Q extends Record<string, string>,
> = {
  method?: HttpMethod | readonly HttpMethod[];
  schema?: {
    params?: ZodType<P>;
    body?: ZodType<B>;
    query?: ZodType<Q>;
  };
  /** default "none" */
  auth?: 'none' | 'optional' | 'required';
  /** Requires a verified email address (after auth). */
  verifiedEmail?: boolean;
  permission?: Permission;
  roles?: readonly Role[];
  rateLimit?: RateLimitRule | ((req: Request, user: SessionUser | null) => RateLimitRule | false);
  /** default: true for mutating methods */
  csrf?: boolean;
  handler: (input: HandlerInput<P, B, Q>) => Promise<HandlerResult>;
};

function clientIp(req: Request): string {
  const fwd = req.headers.get('x-forwarded-for');
  if (fwd) return fwd.split(',')[0]!.trim();
  return req.headers.get('x-real-ip') ?? '0.0.0.0';
}

/** Reject cross-origin state-changing requests (CSRF defence-in-depth). */
function assertSameOrigin(req: Request): void {
  const origin = req.headers.get('origin');
  const site = req.headers.get('sec-fetch-site');
  if (site && site !== 'same-origin' && site !== 'none') {
    throw ApiError.csrf();
  }
  if (!origin) return; // same-origin non-browser clients (tests) — no Origin header
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw ApiError.csrf('Malformed Origin header');
  }
  const host = req.headers.get('host');
  const appHost = (() => {
    try {
      return new URL(env.appUrl).host;
    } catch {
      return null;
    }
  })();
  if (originHost !== host && originHost !== appHost) {
    throw ApiError.csrf();
  }
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, { status });
}

export function createHandler<
  P extends Record<string, string> = Record<string, string>,
  B = unknown,
  Q extends Record<string, string> = Record<string, string>,
>(options: HandlerOptions<P, B, Q>) {
  const methods = options.method
    ? Array.isArray(options.method)
      ? options.method
      : [options.method]
    : null;

  return async (
    req: Request,
    ctx: { params: Promise<Record<string, string>> },
  ): Promise<Response> => {
    const requestId = randomUUID();
    const started = Date.now();
    const method = req.method.toUpperCase();
    let status = 200;
    let user: SessionUser | null = null;

    try {
      if (methods && !methods.includes(method as HttpMethod)) {
        throw new ApiError(405, 'METHOD_NOT_ALLOWED', 'Method not allowed');
      }

      const needsCsrf = options.csrf ?? MUTATING.has(method);
      if (needsCsrf) assertSameOrigin(req);

      // --- params (route dynamic segments) --------------------------------
      let params = {} as Record<string, string>;
      if (ctx?.params) {
        params = options.schema?.params
          ? (options.schema.params.parse(await Promise.resolve(ctx.params)) as unknown as Record<string, string>)
          : ((await Promise.resolve(ctx.params)) ?? ({} as Record<string, string>));
      }

      // --- query -----------------------------------------------------------
      const url = new URL(req.url);
      const rawQuery = Object.fromEntries(url.searchParams.entries());
      const query = options.schema?.query
        ? (options.schema.query.parse(rawQuery) as Q)
        : (rawQuery as Q);

      // --- body ------------------------------------------------------------
      let body = undefined as B;
      if (MUTATING.has(method)) {
        const contentType = req.headers.get('content-type') ?? '';
        if (contentType.includes('application/json')) {
          const text = await req.text();
          if (text.length > 2_000_000) throw ApiError.payloadTooLarge();
          const parsed: unknown = text.length ? JSON.parse(text) : {};
          body = options.schema?.body ? (options.schema.body.parse(parsed) as B) : (parsed as B);
        } else if (options.schema?.body) {
          body = options.schema.body.parse(undefined) as B;
        }
      }

      // --- authentication --------------------------------------------------
      const authMode = options.auth ?? 'none';
      if (authMode !== 'none') {
        user = await getCurrentUser();
        if (!user && authMode === 'required') throw ApiError.unauthenticated();
        if (user && options.verifiedEmail && !user.emailVerifiedAt) {
          throw ApiError.emailNotVerified();
        }
      }

      // --- RBAC ------------------------------------------------------------
      if (options.permission && user && !roleHasPermission(user.role, options.permission)) {
        throw ApiError.forbidden();
      }
      if (options.roles && user && !options.roles.includes(user.role)) {
        throw ApiError.forbidden('Insufficient role');
      }

      // --- rate limiting ---------------------------------------------------
      const rl =
        typeof options.rateLimit === 'function' ? options.rateLimit(req, user) : options.rateLimit;
      if (rl) {
        const scope = rl.scope ?? new URL(req.url).pathname;
        const decision = await rateLimit(`${scope}:${rl.key ?? clientIp(req)}`, rl);
        if (!decision.ok) {
          throw ApiError.rateLimited(Math.ceil(decision.retryAfterMs / 1000));
        }
      }

      // --- handler ---------------------------------------------------------
      const result = await options.handler({
        req,
        params: params as P,
        body,
        query,
        user,
        ip: clientIp(req),
        userAgent: req.headers.get('user-agent'),
        requestId,
      });

      if (result instanceof Response) {
        status = result.status;
        return result;
      }
      status = result.status ?? 200;
      return json({ data: result.data, requestId }, status);
    } catch (error) {
      const mapped = mapError(error);
      status = mapped.status;

      if (status >= 500) {
        logger.error('api_error', {
          requestId,
          method,
          url: req.url,
          error: error instanceof Error ? error.message : String(error),
          stack: error instanceof Error ? error.stack : undefined,
        });
      } else if (status === 401 || status === 403) {
        logger.warn('api_denied', { requestId, method, url: req.url, status });
      }

      const body = mapped.body;
      return json(body, status);
    } finally {
      logger.debug('api_access', {
        requestId,
        method,
        path: new URL(req.url).pathname,
        status,
        durationMs: Date.now() - started,
        userId: user?.id,
      });
    }
  };
}

function mapError(error: unknown): { status: number; body: Record<string, unknown> } {
  if (error instanceof SyntaxError) {
    // JSON.parse failure
    return {
      status: 400,
      body: { error: { code: 'INVALID_JSON', message: 'Malformed JSON body' } },
    };
  }
  if (error instanceof AuthError) {
    const code =
      error.code === 'EMAIL_NOT_VERIFIED'
        ? 'EMAIL_NOT_VERIFIED'
        : error.code === 'UNAUTHENTICATED'
          ? 'UNAUTHENTICATED'
          : 'FORBIDDEN';
    return { status: error.status, body: { error: { code, message: error.message } } };
  }
  if (error instanceof ZodError) {
    return {
      status: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Validation failed',
          details: zodToDetails(error),
        },
      },
    };
  }
  return errorResponse(error);
}

// ---------------------------------------------------------------------------
// Pagination
// ---------------------------------------------------------------------------

export type Pagination = { page: number; perPage: number; skip: number; take: number };

export function parsePagination(
  query: Record<string, string>,
  defaults: { perPage?: number; maxPerPage?: number } = {},
): Pagination {
  const maxPerPage = defaults.maxPerPage ?? 100;
  const perPageRaw = Number.parseInt(query.perPage ?? '', 10);
  const pageRaw = Number.parseInt(query.page ?? '', 10);
  const page = Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1;
  const perPage =
    Number.isFinite(perPageRaw) && perPageRaw > 0
      ? Math.min(perPageRaw, maxPerPage)
      : (defaults.perPage ?? 20);
  return { page, perPage, skip: (page - 1) * perPage, take: perPage };
}

export function paginated<T>(
  items: T[],
  total: number,
  pagination: Pagination,
  requestId?: string,
): Response {
  return json(
    {
      data: items,
      pagination: {
        page: pagination.page,
        perPage: pagination.perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / pagination.perPage)),
      },
      ...(requestId ? { requestId } : {}),
    },
    200,
  );
}
