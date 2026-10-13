import { getSetting } from '@/lib/settings';

/**
 * Upload validation (spec sections 31, 77).
 *
 * Security posture:
 * - extension allowlist AND MIME allowlist AND magic-byte sniffing — all
 *   three must agree (a .jpg that is really an HTML file is rejected)
 * - size limits come from Settings (never hardcoded)
 * - EXIF/GPS stripping happens at serve time via Next's image optimizer;
 *   originals are stored privately behind the media file route
 */

const enum Sniff {
  JPEG = 'image/jpeg',
  PNG = 'image/png',
  WEBP = 'image/webp',
  AVIF = 'image/avif',
  MP4 = 'video/mp4',
  WEBM = 'video/webm',
}

function startsWith(buf: Buffer, bytes: number[], offset = 0): boolean {
  if (buf.length < offset + bytes.length) return false;
  return bytes.every((b, i) => buf[offset + i] === b);
}

function ascii(buf: Buffer, offset: number, length: number): string {
  if (buf.length < offset + length) return '';
  return buf.toString('ascii', offset, offset + length);
}

/** Identify the real content type from file signature (magic bytes). */
export function sniffMimeType(buf: Buffer): string | null {
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return Sniff.JPEG;
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return Sniff.PNG;
  if (ascii(buf, 0, 4) === 'RIFF' && ascii(buf, 8, 4) === 'WEBP') return Sniff.WEBP;
  if (ascii(buf, 4, 4) === 'ftyp') {
    const brand = ascii(buf, 8, 4);
    if (brand === 'avif' || brand === 'avis') return Sniff.AVIF;
    return Sniff.MP4;
  }
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return Sniff.WEBM;
  return null;
}

export type UploadValidation =
  | { ok: true; mime: string }
  | {
      ok: false;
      code: 'TOO_LARGE' | 'EMPTY' | 'UNSUPPORTED_TYPE' | 'TYPE_MISMATCH';
      message: string;
    };

const EXTENSION_BY_MIME: Record<string, string[]> = {
  'image/jpeg': ['.jpg', '.jpeg'],
  'image/png': ['.png'],
  'image/webp': ['.webp'],
  'image/avif': ['.avif'],
  'video/mp4': ['.mp4'],
  'video/webm': ['.webm'],
};

export async function validateUpload(input: {
  buffer: Buffer;
  filename: string;
  declaredMime: string;
}): Promise<UploadValidation> {
  const { buffer, filename, declaredMime } = input;
  const lower = filename.toLowerCase();

  if (buffer.byteLength === 0) {
    return { ok: false, code: 'EMPTY', message: 'File is empty' };
  }

  const [maxImageBytes, maxVideoBytes, allowedImageTypes, allowedVideoTypes] = await Promise.all([
    getSetting('media.maxImageBytes'),
    getSetting('media.maxVideoBytes'),
    getSetting('media.allowedImageTypes'),
    getSetting('media.allowedVideoTypes'),
  ]);

  const sniffed = sniffMimeType(buffer);
  const allowed = new Set<string>([...allowedImageTypes, ...allowedVideoTypes]);

  if (!sniffed || !allowed.has(sniffed)) {
    return {
      ok: false,
      code: 'UNSUPPORTED_TYPE',
      message: 'File type is not allowed',
    };
  }

  // Declared MIME, sniffed MIME and extension must all agree.
  const extensions = EXTENSION_BY_MIME[sniffed] ?? [];
  const hasAllowedExtension = extensions.some((ext) => lower.endsWith(ext));
  const declaredMatches =
    declaredMime === sniffed ||
    (sniffed === 'image/jpeg' && declaredMime === 'image/jpg') ||
    (sniffed === 'image/avif' && declaredMime === 'image/heic'); // browsers vary; sniff wins

  if (!hasAllowedExtension || (declaredMime && !declaredMatches)) {
    return {
      ok: false,
      code: 'TYPE_MISMATCH',
      message: 'File content does not match its name or declared type',
    };
  }

  const isVideo = sniffed.startsWith('video/');
  const maxBytes = isVideo ? maxVideoBytes : maxImageBytes;
  if (buffer.byteLength > maxBytes) {
    return {
      ok: false,
      code: 'TOO_LARGE',
      message: `File exceeds the ${Math.round(maxBytes / (1024 * 1024))} MB limit`,
    };
  }

  return { ok: true, mime: sniffed };
}

/** Extension for a validated MIME (used to build the storage key). */
export function extensionForMime(mime: string): string {
  const first = EXTENSION_BY_MIME[mime]?.[0] ?? '.bin';
  return first;
}
