// ═══════════════════════════════════════════════════════════════
// Password hashing — scrypt via Node's built-in crypto.
//
// No external dependency (no bcrypt/argon2 native build on Windows).
// Stored format:  scrypt$<N>$<r>$<p>$<saltHex>$<hashHex>
//
// Node-only. Never import this from middleware or a client component.
// ═══════════════════════════════════════════════════════════════

import { randomBytes, scrypt as scryptCb, timingSafeEqual } from "crypto";
import { promisify } from "util";

const scrypt = promisify(scryptCb) as (
  password: string | Buffer,
  salt: string | Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number }
) => Promise<Buffer>;

// OWASP-recommended scrypt parameters (2024): N=2^17 with r=8, p=1.
// We use N=2^16 to keep interactive logins snappy on a laptop while
// staying well above the minimum.
const N = 65536;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;
// scrypt needs roughly 128 * N * r bytes; give it headroom or Node throws.
const MAXMEM = 256 * N * R;

export const MIN_PASSWORD_LENGTH = 10;

/** Hash a plaintext password for storage. */
export async function hashPassword(plain: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const derived = await scrypt(plain.normalize("NFKC"), salt, KEY_LENGTH, {
    N,
    r: R,
    p: P,
    maxmem: MAXMEM,
  });
  return `scrypt$${N}$${R}$${P}$${salt.toString("hex")}$${derived.toString("hex")}`;
}

/**
 * Check a plaintext password against a stored hash.
 * Returns false (never throws) for malformed or empty hashes, so a user
 * with no password set simply cannot log in.
 */
export async function verifyPassword(plain: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored || !plain) return false;

  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;

  const n = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  if (!Number.isInteger(n) || !Number.isInteger(r) || !Number.isInteger(p)) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[4], "hex");
    expected = Buffer.from(parts[5], "hex");
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  try {
    const derived = await scrypt(plain.normalize("NFKC"), salt, expected.length, {
      N: n,
      r,
      p,
      maxmem: Math.max(MAXMEM, 256 * n * r),
    });
    return derived.length === expected.length && timingSafeEqual(derived, expected);
  } catch {
    return false;
  }
}

/**
 * Validate a candidate password. Returns null when acceptable,
 * otherwise a human-readable reason.
 */
export function validatePasswordStrength(plain: string): string | null {
  if (!plain || plain.length < MIN_PASSWORD_LENGTH) {
    return `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`;
  }
  if (plain.length > 200) {
    return "Password must be 200 characters or fewer.";
  }
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(plain)).length;
  if (classes < 3) {
    return "Password must include at least three of: lowercase, uppercase, number, symbol.";
  }
  if (/^(.)\1+$/.test(plain)) {
    return "Password must not be a single repeated character.";
  }
  return null;
}

/** Generate a readable, strong random password for seeding/resets. */
export function generatePassword(length = 16): string {
  // Ambiguous characters (0/O, 1/l/I) removed so it can be read aloud.
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789!@#$%^&*";
  const bytes = randomBytes(length * 2);
  let out = "";
  for (let i = 0; out.length < length && i < bytes.length; i++) {
    const index = bytes[i] % alphabet.length;
    // Reject-sample lightly to avoid modulo bias at the tail of the alphabet.
    if (bytes[i] >= Math.floor(256 / alphabet.length) * alphabet.length) continue;
    out += alphabet[index];
  }
  // Guarantee the generated value passes our own strength rules.
  return validatePasswordStrength(out) === null ? out : generatePassword(length);
}
