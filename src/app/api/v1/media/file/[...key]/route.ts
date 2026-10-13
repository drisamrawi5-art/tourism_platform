import { roleHasPermission } from '@/lib/auth/permissions';
import { getCurrentUser } from '@/lib/auth/session';
import { db } from '@/lib/db';
import { getStorage } from '@/lib/storage';
import { assertSafeKey } from '@/lib/storage/types';

function jsonError(code: string, message: string, status: number): Response {
  return Response.json({ error: { code, message } }, { status });
}

/** Serves stored bytes after status/ownership checks (plain handler: streams). */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ key: string[] }> },
): Promise<Response> {
  const segments = (await ctx.params).key;
  const key = segments.map((segment) => segment ?? '').join('/');

  try {
    assertSafeKey(key);
  } catch {
    return jsonError('BAD_KEY', 'Invalid media key', 400);
  }

  const media = await db.media.findUnique({ where: { storageKey: key } });
  if (!media) return jsonError('NOT_FOUND', 'Media not found', 404);

  const served = media.status === 'PUBLISHED' || media.status === 'APPROVED';
  if (!served) {
    const user = await getCurrentUser();
    const allowed =
      user !== null &&
      (user.id === media.uploadedById || roleHasPermission(user.role, 'media.moderate'));
    if (!allowed) return jsonError('FORBIDDEN', 'Insufficient permissions', 403);
  }

  const got = await getStorage().get(key);
  if (!got) return jsonError('NOT_FOUND', 'Media not found', 404);

  const chunks: Buffer[] = [];
  for await (const chunk of got.stream) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const body = Buffer.concat(chunks);

  return new Response(new Uint8Array(body), {
    headers: {
      'content-type': media.mimeType,
      'cache-control': served ? 'public, max-age=31536000, immutable' : 'no-store',
      'content-disposition': 'inline',
    },
  });
}
