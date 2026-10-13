/**
 * Centralised, typed runtime configuration.
 *
 * Secrets are only read from environment variables and are never exposed to
 * the client bundle (this module is server-only — do not import from client
 * components).
 */

const missing: string[] = [];

function str(key: string, fallback = ''): string {
  const v = process.env[key];
  if (v === undefined || v === '') {
    missing.push(key);
    return fallback;
  }
  return v;
}

function int(key: string, fallback: number): number {
  const v = process.env[key];
  if (!v) return fallback;
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : fallback;
}

export const env = {
  get nodeEnv(): 'development' | 'test' | 'production' {
    const v = process.env.NODE_ENV;
    return v === 'production' || v === 'test' ? v : 'development';
  },
  get isProd(): boolean {
    return this.nodeEnv === 'production';
  },
  get appUrl(): string {
    return str('APP_URL', 'http://localhost:3000');
  },
  get databaseUrl(): string {
    return str('DATABASE_URL', process.env.TEST_DATABASE_URL ?? '');
  },

  // --- auth ---------------------------------------------------------------
  /** 32+ chars required in production; dev has an explicit default. */
  get sessionSecret(): string {
    const secret = process.env.SESSION_SECRET ?? '';
    if (!secret) {
      if (this.isProd) {
        throw new Error('SESSION_SECRET must be set in production');
      }
      return 'insecure-development-secret-do-not-use-in-production';
    }
    if (this.isProd && secret.length < 32) {
      throw new Error('SESSION_SECRET must be at least 32 characters in production');
    }
    return secret;
  },
  get sessionCookieName(): string {
    return str('SESSION_COOKIE_NAME', 'vi_session');
  },
  get sessionTtlHours(): number {
    return int('SESSION_TTL_HOURS', 720);
  },

  // --- payments -----------------------------------------------------------
  /** Registry key: "none" | "mock" (dev/test) | future providers. */
  get paymentProvider(): string {
    return (process.env.PAYMENT_PROVIDER ?? 'none').toLowerCase();
  },
  get paymentWebhookSecret(): string {
    return process.env.PAYMENT_WEBHOOK_SECRET ?? '';
  },

  // --- storage ------------------------------------------------------------
  get storageDriver(): 'local' | 's3' {
    return (process.env.STORAGE_DRIVER ?? 'local') === 's3' ? 's3' : 'local';
  },
  get localStorageDir(): string {
    return str('LOCAL_STORAGE_DIR', '.data/media');
  },
  get s3(): {
    endpoint?: string;
    region: string;
    bucket: string;
    accessKeyId?: string;
    secretAccessKey?: string;
    publicUrl?: string;
  } {
    return {
      endpoint: process.env.S3_ENDPOINT || undefined,
      region: str('S3_REGION', 'auto'),
      bucket: str('S3_BUCKET', ''),
      accessKeyId: process.env.S3_ACCESS_KEY_ID || undefined,
      secretAccessKey: process.env.S3_SECRET_ACCESS_KEY || undefined,
      publicUrl: process.env.S3_PUBLIC_URL || undefined,
    };
  },

  // --- mail ---------------------------------------------------------------
  get mailDriver(): 'console' | 'smtp' {
    return (process.env.MAIL_DRIVER ?? 'console') === 'smtp' ? 'smtp' : 'console';
  },
  get mailFrom(): string {
    return str('MAIL_FROM', 'hello@visitimedwan.example');
  },
  get smtp(): { host?: string; port: number; user?: string; pass?: string } {
    return {
      host: process.env.SMTP_HOST || undefined,
      port: int('SMTP_PORT', 587),
      user: process.env.SMTP_USER || undefined,
      pass: process.env.SMTP_PASS || undefined,
    };
  },

  // --- maps ---------------------------------------------------------------
  get mapProvider(): 'none' | 'osm' | 'mapbox' | 'google' {
    const v = (process.env.MAP_PROVIDER ?? 'none').toLowerCase();
    return v === 'osm' || v === 'mapbox' || v === 'google' ? v : 'none';
  },
  get mapboxToken(): string {
    return process.env.MAPBOX_TOKEN ?? '';
  },
  get googleMapsApiKey(): string {
    return process.env.GOOGLE_MAPS_API_KEY ?? '';
  },
} as const;

/**
 * Fail fast on boot when production configuration is incomplete.
 * Called from src/instrumentation.ts.
 */
export function assertRuntimeConfig(): void {
  missing.length = 0;
  // Touch all getters so validation runs.
  void env.sessionSecret;
  void env.databaseUrl;
  void env.appUrl;
  if (env.isProd && missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
}
