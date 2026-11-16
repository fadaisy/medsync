/**
 * The medical ID's QR token (patient app v2 §5.9, M10; S24). ZERO imports: shared by the Edge Function that
 * issues it and by tests. The QR never holds health data: only an opaque, signed, short-lived token that a
 * hospital's desk exchanges, signed in, for the patient's record. It names the member and when it stops working.
 *
 * Format: `t1.<base64url(json {u, exp, n})>.<base64url(HMAC-SHA256)>`. Expired, altered or unsigned: refused.
 */
export const TOKEN_TTL_SECONDS = 5 * 60;

const enc = new TextEncoder();
const b64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
const fromB64url = (s: string) =>
  Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function hmac(secret: string, data: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

export async function issueToken(
  secret: string,
  userId: string,
  now: Date,
  nonce: string,
): Promise<{ token: string; expiresAt: string }> {
  if (secret.length < 32) throw new Error("medical ID secret is too short");
  const exp = Math.floor(now.getTime() / 1000) + TOKEN_TTL_SECONDS;
  const body = b64url(enc.encode(JSON.stringify({ u: userId, exp, n: nonce })));
  const sig = b64url(await hmac(secret, `t1.${body}`));
  return { token: `t1.${body}.${sig}`, expiresAt: new Date(exp * 1000).toISOString() };
}

/** The member a token names, or null when it is expired, altered or not ours. Constant-time on the signature. */
export async function readToken(secret: string, token: string, now: Date): Promise<string | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "t1") return null;
  let want: Uint8Array, got: Uint8Array;
  try {
    want = await hmac(secret, `t1.${parts[1]}`);
    got = fromB64url(parts[2]!);
  } catch {
    return null;
  }
  if (want.length !== got.length) return null;
  let diff = 0;
  for (let i = 0; i < want.length; i++) diff |= want[i]! ^ got[i]!;
  if (diff !== 0) return null;
  try {
    const p = JSON.parse(new TextDecoder().decode(fromB64url(parts[1]!))) as {
      u?: string;
      exp?: number;
    };
    if (typeof p.u !== "string" || typeof p.exp !== "number") return null;
    return p.exp > Math.floor(now.getTime() / 1000) ? p.u : null;
  } catch {
    return null;
  }
}
