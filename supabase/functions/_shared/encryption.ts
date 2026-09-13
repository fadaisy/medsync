/**
 * PHI encryption for the Edge Functions — the SAME wire format as
 * `lib/encryption.ts` (Node), ported to Web Crypto so a column written by
 * either runtime is readable by the other:
 *
 *   `iv:authTag:ciphertext` — three base64 segments, AES-256-GCM, a random
 *   12-byte IV per value, a 16-byte auth tag. Key = MEDSYNC_PHI_KEY, a base64
 *   string that decodes to exactly 32 bytes.
 *
 *   `blindIndex(value)` — hex HMAC-SHA256 of the value keyed by
 *   SHA-256("medsync-blind-index" ‖ key). The blind index `phone_hmac`
 *   (migration 0060) is searched by equality.
 *
 * ZERO imports and the key is a PARAMETER, on purpose: `tests/encryption/
 * cross-runtime.test.ts` runs this file on Node's global `crypto.subtle`
 * against the Node implementation. An Edge Function reads the key at its
 * edge — `Deno.env.get("MEDSYNC_PHI_KEY")` — and hands it in; nothing
 * here touches `Deno` or `process`.
 */

const IV_BYTES = 12;
const TAG_BYTES = 16;
const KEY_BYTES = 32;
const SEGMENT_SEP = ":";
const BLIND_INDEX_LABEL = "medsync-blind-index";

/** Bytes over a plain ArrayBuffer — what Web Crypto's BufferSource accepts. */
type Bytes = Uint8Array<ArrayBuffer>;

/** Validate the base64 key once per call site; throws the same message as Node's `loadKey()`. */
export function phiKeyBytes(keyB64: string | undefined): Bytes {
  if (!keyB64) {
    throw new Error(
      "MEDSYNC_PHI_KEY is not set. Generate one with " +
        "`node -e \"console.log(require('crypto').randomBytes(32).toString('base64'))\"`" +
        " and add it to .env.local + Vercel + Supabase Functions secrets.",
    );
  }
  let key: Bytes;
  try {
    key = fromBase64(keyB64);
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

export async function encrypt(plaintext: string, keyB64: string): Promise<string> {
  if (typeof plaintext !== "string") throw new TypeError("encrypt() expects a string plaintext");
  const key = await importAesKey(phiKeyBytes(keyB64), "encrypt");
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: "AES-GCM", iv, tagLength: TAG_BYTES * 8 },
      key,
      new TextEncoder().encode(plaintext),
    ),
  );
  // Web Crypto appends the tag to the ciphertext; the wire format keeps them apart.
  const ciphertext = sealed.slice(0, sealed.length - TAG_BYTES);
  const tag = sealed.slice(sealed.length - TAG_BYTES);
  return [toBase64(iv), toBase64(tag), toBase64(ciphertext)].join(SEGMENT_SEP);
}

export async function decrypt(payload: string, keyB64: string): Promise<string> {
  if (typeof payload !== "string") throw new TypeError("decrypt() expects a string payload");
  const segments = payload.split(SEGMENT_SEP);
  if (segments.length !== 3) {
    throw new Error("Invalid encrypted payload: expected `iv:authTag:ciphertext`");
  }
  const [ivB64, tagB64, ctB64] = segments as [string, string, string];
  const iv = fromBase64(ivB64);
  const tag = fromBase64(tagB64);
  const ciphertext = fromBase64(ctB64);
  if (iv.length !== IV_BYTES) {
    throw new Error(`Invalid IV length (expected ${IV_BYTES} bytes, got ${iv.length})`);
  }
  if (tag.length !== TAG_BYTES) {
    throw new Error(`Invalid auth tag length (expected ${TAG_BYTES} bytes, got ${tag.length})`);
  }
  const key = await importAesKey(phiKeyBytes(keyB64), "decrypt");
  const sealed = new Uint8Array(ciphertext.length + tag.length);
  sealed.set(ciphertext, 0);
  sealed.set(tag, ciphertext.length);
  // A wrong key or any tampering rejects here (OperationError).
  const plain = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv, tagLength: TAG_BYTES * 8 },
    key,
    sealed,
  );
  return new TextDecoder().decode(plain);
}

/** Same bytes as `blindIndex()` in lib/encryption.ts. Callers normalise first. */
export async function blindIndex(value: string, keyB64: string): Promise<string> {
  if (typeof value !== "string") throw new TypeError("blindIndex() expects a string");
  const key = phiKeyBytes(keyB64);
  const label = new TextEncoder().encode(BLIND_INDEX_LABEL);
  const material = new Uint8Array(label.length + key.length);
  material.set(label, 0);
  material.set(key, label.length);
  const hmacKey = await crypto.subtle.importKey(
    "raw",
    await crypto.subtle.digest("SHA-256", material),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const mac = await crypto.subtle.sign("HMAC", hmacKey, new TextEncoder().encode(value));
  return toHex(new Uint8Array(mac));
}

/* ─── bytes ──────────────────────────────────────────────────────── */

function importAesKey(raw: Bytes, usage: "encrypt" | "decrypt"): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", raw, { name: "AES-GCM" }, false, [usage]);
}

function fromBase64(b64: string): Bytes {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function toBase64(bytes: Bytes): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin);
}

function toHex(bytes: Bytes): string {
  let hex = "";
  for (const b of bytes) hex += b.toString(16).padStart(2, "0");
  return hex;
}
