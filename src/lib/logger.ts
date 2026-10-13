/**
 * Typed structured logger with secret redaction.
 *
 * - JSON lines in production, readable single-line in development.
 * - NEVER logs passwords, tokens, card data, secrets (see docs/logging.md).
 */

type Level = 'debug' | 'info' | 'warn' | 'error';

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

const SENSITIVE_KEYS = new Set([
  'password',
  'passwordhash',
  'newpassword',
  'currentpassword',
  'token',
  'tokenhash',
  'accesstoken',
  'refreshtoken',
  'sessiontoken',
  'secret',
  'sessionsecret',
  'apikey',
  'authorization',
  'cookie',
  'setcookie',
  'cardnumber',
  'cvv',
  'cvc',
  'pan',
  'pin',
  'payload', // webhook payloads may carry provider data; keep them out of logs
]);

function redact(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return value;
  if (depth > 6) return '[deep]';
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, depth + 1));
  if (value instanceof Error) {
    return { name: value.name, message: value.message, stack: value.stack };
  }
  if (typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      if (SENSITIVE_KEYS.has(k.toLowerCase())) {
        out[k] = '[redacted]';
      } else if (typeof v === 'string' && v.length > 2000) {
        out[k] = `${v.slice(0, 500)}…[truncated]`;
      } else {
        out[k] = redact(v, depth + 1);
      }
    }
    return out;
  }
  if (typeof value === 'string' && value.length > 4000) {
    return `${value.slice(0, 1000)}…[truncated]`;
  }
  return value;
}

function minLevel(): number {
  const raw = (process.env.LOG_LEVEL ?? 'info').toLowerCase() as Level;
  return LEVEL_ORDER[raw] ?? LEVEL_ORDER.info;
}

function emit(level: Level, msg: string, fields?: Record<string, unknown>) {
  if (LEVEL_ORDER[level] < minLevel()) return;
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg,
    ...(fields ? (redact(fields) as Record<string, unknown>) : {}),
  };
  const line =
    process.env.NODE_ENV === 'production'
      ? JSON.stringify(entry)
      : `${entry.ts} ${level.toUpperCase().padEnd(5)} ${msg}${
          fields ? ' ' + JSON.stringify(redact(fields)) : ''
        }`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.log(line);
}

export const logger = {
  debug: (msg: string, fields?: Record<string, unknown>) => emit('debug', msg, fields),
  info: (msg: string, fields?: Record<string, unknown>) => emit('info', msg, fields),
  warn: (msg: string, fields?: Record<string, unknown>) => emit('warn', msg, fields),
  error: (msg: string, fields?: Record<string, unknown>) => emit('error', msg, fields),
  /** Child logger with bound fields (e.g. request id). */
  child: (bound: Record<string, unknown>) => ({
    debug: (msg: string, fields?: Record<string, unknown>) =>
      emit('debug', msg, { ...bound, ...fields }),
    info: (msg: string, fields?: Record<string, unknown>) =>
      emit('info', msg, { ...bound, ...fields }),
    warn: (msg: string, fields?: Record<string, unknown>) =>
      emit('warn', msg, { ...bound, ...fields }),
    error: (msg: string, fields?: Record<string, unknown>) =>
      emit('error', msg, { ...bound, ...fields }),
  }),
};

export type Logger = typeof logger;
