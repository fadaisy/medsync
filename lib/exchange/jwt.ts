/**
 * Machine authentication (Lab Phase 4 D-LAB4-15, B2, B5; bridge-and-security.md §2). Pure, on `node:crypto`, no
 * dependency: verify a SMART Backend Services client assertion (a JWT the machine signs with its private key; we
 * hold only its public keys), and mint and hash the opaque access token that replaces it for ≤ 5 minutes.
 *
 * Accepted algorithms: ES384 and RS384 (the SMART pair). No `none`, no HMAC, no algorithm taken from the key.
 */
import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from "node:crypto";
import type { JsonWebKey } from "node:crypto";

export const ALGORITHMS = ["ES384", "RS384"] as const;
export type Alg = (typeof ALGORITHMS)[number];
export const MAX_ASSERTION_SECONDS = 300;
export const TOKEN_SECONDS = 300;

export interface Jwk {
  kid: string;
  kty: "EC" | "RSA";
  alg?: string;
  crv?: string;
  x?: string;
  y?: string;
  n?: string;
  e?: string;
}
export interface AssertionClaims {
  iss: string;
  sub: string;
  aud: string;
  exp: number;
  iat?: number;
  jti: string;
}

const b64urlJson = (s: string): unknown => JSON.parse(Buffer.from(s, "base64url").toString("utf8"));

export type VerifyResult =
  | { ok: true; claims: AssertionClaims; kid: string }
  | { ok: false; reason: string };

/**
 * Verify the assertion against the sender's registered keys: the algorithm allowlist, the key id, the signature,
 * issuer = subject = the sender id, the audience (our token endpoint), expiry within 5 minutes and not past, and
 * a jti (whose single use the caller enforces with exchange_jti).
 */
export function verifyAssertion(
  token: string,
  o: { senderId: string; audience: string; keys: readonly Jwk[]; now: Date; skewSeconds?: number },
): VerifyResult {
  const parts = token.split(".");
  if (parts.length !== 3) return { ok: false, reason: "malformed" };
  let header: { alg?: string; kid?: string; typ?: string };
  let claims: AssertionClaims;
  try {
    header = b64urlJson(parts[0]!) as typeof header;
    claims = b64urlJson(parts[1]!) as AssertionClaims;
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (!header.alg || !(ALGORITHMS as readonly string[]).includes(header.alg))
    return { ok: false, reason: "algorithm" };
  const jwk = o.keys.find((k) => k.kid === header.kid);
  if (!jwk) return { ok: false, reason: "unknown_key" };
  const expectedKty = header.alg === "ES384" ? "EC" : "RSA";
  if (jwk.kty !== expectedKty || (jwk.alg && jwk.alg !== header.alg))
    return { ok: false, reason: "algorithm" };
  let good = false;
  try {
    const key = createPublicKey({ key: jwk as unknown as JsonWebKey, format: "jwk" });
    const data = Buffer.from(`${parts[0]}.${parts[1]}`);
    const sig = Buffer.from(parts[2]!, "base64url");
    good =
      header.alg === "ES384"
        ? verify("sha384", data, { key, dsaEncoding: "ieee-p1363" }, sig)
        : verify("sha384", data, key, sig);
  } catch {
    return { ok: false, reason: "signature" };
  }
  if (!good) return { ok: false, reason: "signature" };
  const now = Math.floor(o.now.getTime() / 1000);
  const skew = o.skewSeconds ?? 60;
  if (claims.iss !== o.senderId || claims.sub !== o.senderId)
    return { ok: false, reason: "subject" };
  if (claims.aud !== o.audience) return { ok: false, reason: "audience" };
  if (typeof claims.exp !== "number" || claims.exp + skew < now)
    return { ok: false, reason: "expired" };
  if (claims.exp - now > MAX_ASSERTION_SECONDS + skew) return { ok: false, reason: "too_long" };
  if (typeof claims.jti !== "string" || claims.jti.length < 8 || claims.jti.length > 200)
    return { ok: false, reason: "jti" };
  return { ok: true, claims, kid: jwk.kid };
}

/** An opaque access token and the hash we store (the token itself is never stored). */
export function mintToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: tokenHash(token) };
}
export const tokenHash = (token: string) => createHash("sha256").update(token).digest("hex");

/** B3: the fingerprint the lab lead compares at pairing (SHA-256 of the canonical public key, grouped). */
export function keyFingerprint(jwk: Jwk): string {
  const canon =
    jwk.kty === "EC"
      ? { crv: jwk.crv, kty: jwk.kty, x: jwk.x, y: jwk.y }
      : { e: jwk.e, kty: jwk.kty, n: jwk.n };
  return createHash("sha256")
    .update(JSON.stringify(canon))
    .digest("hex")
    .slice(0, 32)
    .match(/.{4}/g)!
    .join(" ")
    .toUpperCase();
}

/**
 * A one-time pairing code: 20 characters of a 32-letter alphabet (100 bits, bridge-and-security §2.3), shown in
 * groups of five for typing. Only its hash is stored.
 */
export function pairingCode(length = 20): { code: string; hash: string } {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O, 1/I; 256 % 32 = 0, so no bias
  const raw = [...randomBytes(length)].map((b) => alphabet[b % alphabet.length]).join("");
  return { code: raw.match(/.{1,5}/g)!.join("-"), hash: codeHash(raw) };
}
/** Spaces, dashes and case do not matter when the code is typed back. */
export const codeHash = (code: string) =>
  createHash("sha256").update(code.replace(/[\s-]/g, "").toUpperCase()).digest("hex");
/** Constant-time comparison of two hex hashes. */
export const sameHash = (a: string, b: string) =>
  a.length === b.length && timingSafeEqual(Buffer.from(a, "hex"), Buffer.from(b, "hex"));
