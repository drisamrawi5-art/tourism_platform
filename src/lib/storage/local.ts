import { createReadStream } from 'node:fs';
import { mkdir, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { env } from '@/lib/env';
import { assertSafeKey, type PutResult, type StorageProvider } from '@/lib/storage/types';

/**
 * Local filesystem driver — development only.
 * Files live under LOCAL_STORAGE_DIR (gitignored) and are served through the
 * authenticated media route, never as statically executable files.
 */

const CONTENT_TYPES: Record<string, string> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  mp4: 'video/mp4',
  webm: 'video/webm',
};

export class LocalStorageProvider implements StorageProvider {
  readonly key = 'local' as const;

  private root(): string {
    return path.resolve(process.cwd(), env.localStorageDir);
  }

  private resolve(key: string): string {
    assertSafeKey(key);
    const full = path.resolve(this.root(), key);
    if (!full.startsWith(this.root() + path.sep)) {
      throw new Error('Path traversal blocked');
    }
    return full;
  }

  async put(key: string, data: Buffer, _contentType: string): Promise<PutResult> {
    const full = this.resolve(key);
    await mkdir(path.dirname(full), { recursive: true });
    await writeFile(full, data);
    return { key, size: data.byteLength };
  }

  async get(key: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> {
    const full = this.resolve(key);
    try {
      await stat(full);
    } catch {
      return null;
    }
    const ext = key.split('.').pop()?.toLowerCase() ?? '';
    return {
      stream: createReadStream(full),
      contentType: CONTENT_TYPES[ext] ?? 'application/octet-stream',
    };
  }

  async delete(key: string): Promise<void> {
    const full = this.resolve(key);
    await rm(full, { force: true });
  }

  publicUrl(): string | null {
    // Served through /api/v1/media/file/[...key] with status checks.
    return null;
  }
}
