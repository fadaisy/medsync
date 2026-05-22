import "server-only";

import { createCipheriv, createDecipheriv, randomBytes, timingSafeEqual } from "node:crypto";

/**
 * App-level PHI encryption — AES-256-GCM.
 *
 * Wire format of an encrypted column: `iv:authTag:ciphertext`, three base64
 * segments joined by a single colon. Random 12-byte IV per value (the GCM
 * standard); 16-byte auth tag detects any tampering on decrypt.
 *
 * Key lives in `MEDSYNC_PHI_KEY` — a base64 string that decodes to exactly
 * 32 bytes. Generate with `generateKey()` below or
 * `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`.
 *
 * `server-only` ensures a client component importing this fails at build
 * time instead of leaking the key.
 *
 * Trade-offs encoded:
 *   - Encrypted columns are NOT queryable or indexable by content. Search by
 *     ciphertext is a deliberate non-feature — operational columns stay
 *     plaintext (see DESIGN-medsync.md and ADR-0008).
 *   - Key rotation requires a re-encrypt pass; not handled in this lib. See
 *     ADR-0008 §key-rotation.
 *
 * See `tests/encryption/encryption.test.ts` for the full contract:
 * round-trip, IV uniqueness, ciphertext-tamper rejection, auth-tag-tamper
 * rejection, wrong-key rejection, missing-key behaviour.
 */

const ALGORITHM = "aes-256-gcm";
const IV_BYTES = 12; // GCM-standard
const KEY_BYTES = 32; // AES-256
const SEGMENT_SEP = ":";

function loadKey(): Buffer {
  const raw = process.env.MEDSYNC_PHI_KEY;
  if (!raw) {
    throw new Error(
      "MEDSYNC_PHI_KEY is not set. Generate one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`" +
        " and add it to .env.local + Vercel + Supabase Functions secrets.",
    );
  }
  let key: Buffer;
  try {
    key = Buffer.from(raw, "base64");
  } catch {
    throw new Error("MEDSYNC_PHI_KEY is not valid base64");
  }
  if (key.length !== KEY_BYTES) {
    throw new Error(
      `MEDSYNC_PHI_KEY must decode to exactly ${KEY_BYTES} bytes (got ${key.length}).`,
    );
  }
  return key;
}

/**
 * Encrypt UTF-8 plaintext. Returns `iv:authTag:ciphertext` (3 base64
 * segments). A fresh random IV is generated per call, so encrypting the
 * same plaintext twice yields different ciphertext — required for IND-CPA.
 */
export function encrypt(plaintext: string): string {
  if (typeof plaintext !== "string") {
    throw new TypeError("encrypt() expects a string plaintext");
  }
  const key = loadKey();
  const iv = randomBytes(IV_BYTES);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return [iv.toString("base64"), authTag.toString("base64"), ciphertext.toString("base64")].join(
    SEGMENT_SEP,
  );
}

/**
 * Decrypt a payload produced by `encrypt()`. Throws on malformed payload,
 * wrong key, or any tampering with the IV, auth tag, or ciphertext bytes
 * (GCM's auth tag covers all three).
 */
export function decrypt(payload: string): string {
  if (typeof payload !== "string") {
    throw new TypeError("decrypt() expects a string payload");
  }
  const segments = payload.split(SEGMENT_SEP);
  if (segments.length !== 3) {
    throw new Error("Invalid encrypted payload: expected `iv:authTag:ciphertext`");
  }
  const [ivB64, authTagB64, ciphertextB64] = segments as [string, string, string];

  const iv = Buffer.from(ivB64, "base64");
  const authTag = Buffer.from(authTagB64, "base64");
  const ciphertext = Buffer.from(ciphertextB64, "base64");

  if (iv.length !== IV_BYTES) {
    throw new Error(`Invalid IV length (expected ${IV_BYTES} bytes, got ${iv.length})`);
  }
  if (authTag.length !== 16) {
    throw new Error(`Invalid auth tag length (expected 16 bytes, got ${authTag.length})`);
  }

  const key = loadKey();
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  // GCM `final()` throws if auth tag doesn't validate.
  const plaintext = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return plaintext.toString("utf8");
}

/**
 * Convenience: generate a fresh 32-byte key as base64. Use to seed
 * MEDSYNC_PHI_KEY for a new environment, or to rotate (separate procedure,
 * see ADR-0008).
 */
export function generateKey(): string {
  return randomBytes(KEY_BYTES).toString("base64");
}

/**
 * Constant-time equality on two encrypted payloads. Only useful in the rare
 * case where you need to compare two ciphertexts without decrypting them
 * (you almost never do — same plaintext encrypts to different ciphertext
 * each call). Exported because it's the safe way to do byte comparison
 * when you need it.
 */
export function ciphertextsEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
