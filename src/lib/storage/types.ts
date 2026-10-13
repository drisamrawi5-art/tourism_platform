/**
 * Object storage abstraction (spec section 77).
 * Business logic never touches the filesystem directly — the storage driver
 * is swappable (local dev / S3-compatible production) via STORAGE_DRIVER.
 */

export type PutResult = { key: string; size: number };

export interface StorageProvider {
  readonly key: 'local' | 's3';
  put(key: string, data: Buffer, contentType: string): Promise<PutResult>;
  get(key: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null>;
  delete(key: string): Promise<void>;
  /** Public URL when the driver supports it (null = serve via app route). */
  publicUrl(key: string): string | null;
}

const KEY_RE = /^[a-z0-9][a-z0-9/_\-.]{0,400}\.(avif|webp|jpe?g|png|mp4|webm)$/i;

/** Reject traversal, absolute paths and unexpected characters. */
export function assertSafeKey(key: string): void {
  if (!KEY_RE.test(key) || key.includes('..') || key.includes('//')) {
    throw new Error(`Unsafe storage key: ${key}`);
  }
}

export function buildMediaKey(mime: string, uuid: string): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const ext = mime.split('/')[1]?.replace('jpeg', 'jpg') ?? 'bin';
  return `media/${yyyy}/${mm}/${uuid}.${ext}`;
}
