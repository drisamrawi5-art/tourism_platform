/**
 * Next.js instrumentation — runs once per server boot.
 * Fails fast in production when required configuration is missing
 * (see src/lib/env.ts).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { assertRuntimeConfig } = await import('@/lib/env');
    assertRuntimeConfig();
  }
}
