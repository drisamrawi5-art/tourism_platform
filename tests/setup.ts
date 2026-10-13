/**
 * Global test setup (vitest.setup).
 * Unit tests must run without a database; integration tests point at
 * visit_imedwan_test explicitly (never the dev database).
 */

// vitest sets NODE_ENV=test itself (process.env.NODE_ENV is read-only typed).
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@127.0.0.1:5433/visit_imedwan_test';
process.env.TEST_DATABASE_URL ??=
  'postgresql://postgres:postgres@127.0.0.1:5433/visit_imedwan_test';
process.env.APP_URL ??= 'http://localhost:3000';
// The mock provider powers payment tests: signed HMAC webhooks, no money.
// It refuses to run in production, so this can never leak into a live build.
process.env.PAYMENT_PROVIDER ??= 'mock';
process.env.PAYMENT_WEBHOOK_SECRET ??= 'test-webhook-secret-0123456789abcdef';
process.env.MAIL_DRIVER ??= 'console';
process.env.STORAGE_DRIVER ??= 'local';
process.env.SESSION_SECRET ??= 'test-only-secret-not-used-in-production-000000';
process.env.SESSION_COOKIE_NAME ??= 'vi_session';
process.env.SESSION_TTL_HOURS ??= '720';
