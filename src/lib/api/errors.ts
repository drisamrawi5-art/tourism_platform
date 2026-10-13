import { ZodError } from 'zod';

/** Structured API error with stable machine-readable codes. */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: Record<string, string[]>,
  ) {
    super(message);
  }

  static badRequest(code: string, message: string, details?: Record<string, string[]>) {
    return new ApiError(400, code, message, details);
  }
  static unauthenticated(message = 'Authentication required') {
    return new ApiError(401, 'UNAUTHENTICATED', message);
  }
  static emailNotVerified(message = 'Email verification required') {
    return new ApiError(401, 'EMAIL_NOT_VERIFIED', message);
  }
  static forbidden(message = 'Insufficient permissions') {
    return new ApiError(403, 'FORBIDDEN', message);
  }
  static csrf(message = 'Cross-site request rejected') {
    return new ApiError(403, 'CSRF_REJECTED', message);
  }
  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }
  static conflict(code: string, message: string) {
    return new ApiError(409, code, message);
  }
  static payloadTooLarge(message = 'Payload too large') {
    return new ApiError(413, 'PAYLOAD_TOO_LARGE', message);
  }
  static rateLimited(retryAfterSeconds: number, message = 'Too many requests') {
    return new ApiError(429, 'RATE_LIMITED', message, {
      'retry-after': [String(retryAfterSeconds)],
    });
  }
  static serviceUnavailable(code: string, message: string) {
    return new ApiError(503, code, message);
  }
  static internal(message = 'Internal server error') {
    return new ApiError(500, 'INTERNAL_ERROR', message);
  }
}

export function zodToDetails(err: ZodError): Record<string, string[]> {
  const details: Record<string, string[]> = {};
  for (const issue of err.issues) {
    const path = issue.path.join('.') || '_';
    (details[path] ??= []).push(issue.message);
  }
  return details;
}

export function errorResponse(
  error: unknown,
  requestId?: string,
): { status: number; body: Record<string, unknown> } {
  if (error instanceof ApiError) {
    return {
      status: error.status,
      body: {
        error: { code: error.code, message: error.message, ...(error.details ?? {}) },
        ...(requestId ? { requestId } : {}),
      },
    };
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
        ...(requestId ? { requestId } : {}),
      },
    };
  }
  // Unknown errors never leak internals to clients.
  return {
    status: 500,
    body: {
      error: { code: 'INTERNAL_ERROR', message: 'Internal server error' },
      ...(requestId ? { requestId } : {}),
    },
  };
}
