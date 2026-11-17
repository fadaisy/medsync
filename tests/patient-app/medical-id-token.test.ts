import { describe, expect, it } from "vitest";

import {
  issueToken,
  readToken,
  TOKEN_TTL_SECONDS,
} from "@/supabase/functions/_shared/medical-id-token";

const SECRET = "s".repeat(40);
const now = new Date("2026-11-16T09:00:00Z");

describe("S24: the QR holds a short-lived token, never health data", () => {
  it("reads back the member until it expires five minutes later", async () => {
    const { token, expiresAt } = await issueToken(SECRET, "user-1", now, "n1");
    expect(TOKEN_TTL_SECONDS).toBe(300);
    expect(expiresAt).toBe("2026-11-16T09:05:00.000Z");
    expect(await readToken(SECRET, token, new Date(now.getTime() + 299_000))).toBe("user-1");
    expect(await readToken(SECRET, token, new Date(now.getTime() + 300_000))).toBeNull();
  });
  it("an altered, foreign or malformed token is refused", async () => {
    const { token } = await issueToken(SECRET, "user-1", now, "n1");
    const [v, body, sig] = token.split(".");
    const forged = `${v}.${btoa(JSON.stringify({ u: "user-2", exp: 9_999_999_999, n: "x" })).replace(/=+$/, "")}.${sig}`;
    expect(await readToken(SECRET, forged, now)).toBeNull();
    expect(await readToken("o".repeat(40), token, now)).toBeNull();
    expect(await readToken(SECRET, `${v}.${body}`, now)).toBeNull();
    expect(await readToken(SECRET, "nonsense", now)).toBeNull();
  });
  it("holds only an id, an expiry and a nonce", async () => {
    const { token } = await issueToken(SECRET, "user-1", now, "n1");
    const payload = JSON.parse(atob(token.split(".")[1]!.replace(/-/g, "+").replace(/_/g, "/")));
    expect(Object.keys(payload).sort()).toEqual(["exp", "n", "u"]);
  });
  it("refuses to sign with a short secret", async () => {
    await expect(issueToken("short", "u", now, "n")).rejects.toThrow();
  });
});
