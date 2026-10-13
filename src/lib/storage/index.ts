import { env } from '@/lib/env';
import { LocalStorageProvider } from '@/lib/storage/local';
import { S3StorageProvider } from '@/lib/storage/s3';
import type { StorageProvider } from '@/lib/storage/types';

let provider: StorageProvider | null = null;

export function getStorage(): StorageProvider {
  if (!provider) {
    provider = env.storageDriver === 's3' ? new S3StorageProvider() : new LocalStorageProvider();
  }
  return provider;
}

/** Test seam. */
export function setStorage(custom: StorageProvider | null): void {
  provider = custom;
}

export type { StorageProvider, PutResult } from '@/lib/storage/types';
