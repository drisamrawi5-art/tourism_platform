import { hash, verify } from '@node-rs/argon2';

/**
 * Password hashing — Argon2id (spec section 27).
 * Parameters follow the OWASP Password Storage Cheat Sheet recommendation
 * for Argon2id: 19 MiB memory, 2 iterations, 1 degree of parallelism.
 * (@node-rs/argon2 defaults to Argon2id — the algorithm is not set
 * explicitly because its const enum breaks isolatedModules.)
 * Passwords are never stored, logged or returned in plaintext.
 */

const ARGON2_OPTIONS = {
  memoryCost: 19_456, // 19 MiB
  timeCost: 2,
  parallelism: 1,
};

export const PASSWORD_MIN_LENGTH = 10;
export const PASSWORD_MAX_LENGTH = 128;

/**
 * Policy: length only (plus basic entropy sanity). Length rules are applied
 * in the Zod schemas via passwordSchema().
 */
export function isAcceptablePasswordLength(password: string): boolean {
  return password.length >= PASSWORD_MIN_LENGTH && password.length <= PASSWORD_MAX_LENGTH;
}

export async function hashPassword(plain: string): Promise<string> {
  if (!isAcceptablePasswordLength(plain)) {
    throw new Error('Password length requirement not met');
  }
  return hash(plain, ARGON2_OPTIONS);
}

/** Constant-time-ish verification; malformed hashes fail closed. */
export async function verifyPassword(storedHash: string, plain: string): Promise<boolean> {
  if (!storedHash || !plain || plain.length > PASSWORD_MAX_LENGTH) return false;
  try {
    return await verify(storedHash, plain, ARGON2_OPTIONS);
  } catch {
    return false;
  }
}
