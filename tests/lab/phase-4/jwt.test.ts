import { describe, expect, it } from "vitest";

import { codeHash, pairingCode, sameHash } from "@/lib/exchange/jwt";

/** GATE S S-2, S-5 (bridge-and-security §2.3): the pairing code's strength and how it is typed back. */
describe("pairing code", () => {
  it("is 20 characters of a 32-letter alphabet (100 bits), grouped in fives, with no 0, O, 1 or I", () => {
    const { code } = pairingCode();
    expect(code).toMatch(/^[A-HJ-NP-Z2-9]{5}(-[A-HJ-NP-Z2-9]{5}){3}$/);
  });
  it("matches its hash however it is typed back: spaces, dashes or lower case", () => {
    const { code, hash } = pairingCode();
    for (const typed of [code, code.replace(/-/g, ""), code.replace(/-/g, " ").toLowerCase()])
      expect(sameHash(codeHash(typed), hash)).toBe(true);
    expect(sameHash(codeHash(`${code}X`), hash)).toBe(false);
    expect(sameHash("ab", hash)).toBe(false);
  });
});

describe("verifyAssertion (GATE S S-3)", async () => {
  const { generateKeyPairSync, createHmac, sign } = await import("node:crypto");
  const { verifyAssertion } = await import("@/lib/exchange/jwt");
  const { publicKey, privateKey } = generateKeyPairSync("ec", { namedCurve: "P-384" });
  const pub = publicKey.export({ format: "jwk" }) as Record<string, string>;
  const key = { kid: "k1", kty: "EC" as const, crv: "P-384", x: pub.x!, y: pub.y!, alg: "ES384" };
  const now = new Date("2026-10-17T10:00:00Z");
  const t = Math.floor(now.getTime() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const claims = {
    iss: "s1",
    sub: "s1",
    aud: "https://x.test/token",
    exp: t + 240,
    jti: "jti-12345678",
  };
  const make = (o: { header?: object; body?: object; hmac?: boolean } = {}) => {
    const h = b64({ alg: "ES384", kid: "k1", ...o.header });
    const b = b64({ ...claims, ...o.body });
    const sig = o.hmac
      ? createHmac("sha384", "secret").update(`${h}.${b}`).digest()
      : sign("sha384", Buffer.from(`${h}.${b}`), { key: privateKey, dsaEncoding: "ieee-p1363" });
    return `${h}.${b}.${sig.toString("base64url")}`;
  };
  const check = (token: string) =>
    verifyAssertion(token, { senderId: "s1", audience: claims.aud, keys: [key], now });

  it("accepts a well-formed ES384 assertion", () => {
    expect(check(make())).toMatchObject({ ok: true, kid: "k1" });
  });
  it.each([
    ["HS256 with a shared secret", make({ header: { alg: "HS256" }, hmac: true }), "algorithm"],
    ["an unknown key id", make({ header: { kid: "k9" } }), "unknown_key"],
    ["an expired assertion", make({ body: { exp: t - 3600 } }), "expired"],
    ["another sender's subject", make({ body: { sub: "s2" } }), "subject"],
    ["a jti too short to be unique", make({ body: { jti: "x" } }), "jti"],
    [
      "a body changed after signing",
      make().replace(/\.[^.]+\./, `.${b64({ ...claims, sub: "s1", exp: t + 200 })}.`),
      "signature",
    ],
    ["not a JWT", "abc", "malformed"],
  ])("refuses %s", (_, token, reason) => {
    expect(check(token)).toEqual({ ok: false, reason });
  });
});
