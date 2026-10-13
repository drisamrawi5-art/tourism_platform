import { env } from '@/lib/env';
import { assertSafeKey, type PutResult, type StorageProvider } from '@/lib/storage/types';

/**
 * S3-compatible driver (production). Requires @aws-sdk/client-s3 and:
 *   STORAGE_DRIVER=s3, S3_ENDPOINT, S3_REGION, S3_BUCKET,
 *   S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_PUBLIC_URL (optional CDN)
 * Works with AWS S3, MinIO, R2-compatible endpoints, etc.
 */

export class S3StorageProvider implements StorageProvider {
  readonly key = 's3' as const;
  private clientPromise: Promise<import('@aws-sdk/client-s3').S3Client> | null = null;

  private async client() {
    if (!this.clientPromise) {
      this.clientPromise = (async () => {
        const { S3Client } = await import('@aws-sdk/client-s3');
        const cfg = env.s3;
        if (!cfg.bucket) throw new Error('S3_BUCKET is required for the s3 storage driver');
        return new S3Client({
          region: cfg.region,
          endpoint: cfg.endpoint,
          forcePathStyle: Boolean(cfg.endpoint),
          credentials:
            cfg.accessKeyId && cfg.secretAccessKey
              ? { accessKeyId: cfg.accessKeyId, secretAccessKey: cfg.secretAccessKey }
              : undefined,
        });
      })();
    }
    return this.clientPromise;
  }

  async put(key: string, data: Buffer, contentType: string): Promise<PutResult> {
    assertSafeKey(key);
    const { PutObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.client();
    await client.send(
      new PutObjectCommand({
        Bucket: env.s3.bucket,
        Key: key,
        Body: data,
        ContentType: contentType,
        // Uploaded files are data, never executable — serve with a strict type.
        CacheControl: 'public, max-age=31536000, immutable',
      }),
    );
    return { key, size: data.byteLength };
  }

  async get(key: string): Promise<{ stream: NodeJS.ReadableStream; contentType: string } | null> {
    assertSafeKey(key);
    const { GetObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.client();
    try {
      const res = await client.send(new GetObjectCommand({ Bucket: env.s3.bucket, Key: key }));
      if (!res.Body) return null;
      return {
        stream: res.Body as NodeJS.ReadableStream,
        contentType: res.ContentType ?? 'application/octet-stream',
      };
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<void> {
    assertSafeKey(key);
    const { DeleteObjectCommand } = await import('@aws-sdk/client-s3');
    const client = await this.client();
    await client.send(new DeleteObjectCommand({ Bucket: env.s3.bucket, Key: key }));
  }

  publicUrl(key: string): string | null {
    const base = env.s3.publicUrl;
    if (!base) return null;
    return `${base.replace(/\/$/, '')}/${key}`;
  }
}
