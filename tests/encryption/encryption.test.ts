import { randomBytes } from "node:crypto";
import type * as Encryption from "@/lib/encryption";
import { afterEach, beforeEach, describe, expect, test } from "vitest";

let encrypt: (typeof Encryption)["encrypt"];
let decrypt: (typeof Encryption)["decrypt"];
let generateKey: (typeof Encryption)["generateKey"];

beforeEach(async () => {
  // Fresh dynamic import per test so the `server-only` guard doesn't
  // freeze a stale module cache when we mutate MEDSYNC_PHI_KEY mid-suite.
  const mod = await import("@/lib/encryption");
  encrypt = mod.encrypt;
  decrypt = mod.decrypt;
  generateKey = mod.generateKey;
});

describe("lib/encryption — AES-256-GCM", () => {
  const ORIGINAL_KEY = process.env.MEDSYNC_PHI_KEY;
  const TEST_KEY = randomBytes(32).toString("base64");

  beforeEach(() => {
    process.env.MEDSYNC_PHI_KEY = TEST_KEY;
  });

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.MEDSYNC_PHI_KEY;
    } else {
      process.env.MEDSYNC_PHI_KEY = ORIGINAL_KEY;
    }
  });

  test("round-trip preserves the plaintext", () => {
    const plaintext = "Mukasa, Joseph · MRN-2026-00481 · NIN CM12345678901234";
    const encrypted = encrypt(plaintext);
    expect(decrypt(encrypted)).toBe(plaintext);
  });

  test("round-trip works for an empty string", () => {
    expect(decrypt(encrypt(""))).toBe("");
  });

  test("round-trip preserves UTF-8 (non-ASCII clinical notes)", () => {
    const plaintext = "Temp 38.4°C · SpO₂ 89% · Lüsaka district";
    expect(decrypt(encrypt(plaintext))).toBe(plaintext);
  });

  test("output format is `iv:authTag:ciphertext` (3 base64 segments)", () => {
    const out = encrypt("hello");
    const parts = out.split(":");
    expect(parts).toHaveLength(3);
    parts.forEach((p) => expect(p).toMatch(/^[A-Za-z0-9+/=]+$/));
  });

  test("same plaintext encrypts to different ciphertext each call (random IV)", () => {
    const a = encrypt("identical");
    const b = encrypt("identical");
    expect(a).not.toBe(b);
    expect(decrypt(a)).toBe(decrypt(b));
  });

  test("tampering with the ciphertext bytes is rejected by GCM auth tag", () => {
    const encrypted = encrypt("secret");
    const [iv, authTag, ct] = encrypted.split(":") as [string, string, string];
    // Flip one bit of the ciphertext.
    const tampered = Buffer.from(ct, "base64");
    tampered[0] = (tampered[0] ?? 0) ^ 0x01;
    const tamperedPayload = [iv, authTag, tampered.toString("base64")].join(":");
    expect(() => decrypt(tamperedPayload)).toThrow();
  });

  test("tampering with the auth tag is rejected", () => {
    const encrypted = encrypt("secret");
    const [iv, authTag, ct] = encrypted.split(":") as [string, string, string];
    const tag = Buffer.from(authTag, "base64");
    tag[0] = (tag[0] ?? 0) ^ 0x01;
    const tamperedPayload = [iv, tag.toString("base64"), ct].join(":");
    expect(() => decrypt(tamperedPayload)).toThrow();
  });

  test("tampering with the IV is rejected", () => {
    const encrypted = encrypt("secret");
    const [iv, authTag, ct] = encrypted.split(":") as [string, string, string];
    const ivBuf = Buffer.from(iv, "base64");
    ivBuf[0] = (ivBuf[0] ?? 0) ^ 0x01;
    const tamperedPayload = [ivBuf.toString("base64"), authTag, ct].join(":");
    expect(() => decrypt(tamperedPayload)).toThrow();
  });

  test("decrypt under a different key throws", async () => {
    const encrypted = encrypt("originally encrypted under TEST_KEY");
    process.env.MEDSYNC_PHI_KEY = randomBytes(32).toString("base64");
    // Re-import to pick up the env mutation (defensive — loadKey reads env
    // each call so the cached module is fine, but a fresh import is safer).
    const fresh = await import("@/lib/encryption");
    expect(() => fresh.decrypt(encrypted)).toThrow();
  });

  test("malformed payload throws (missing segments)", () => {
    expect(() => decrypt("not-a-payload")).toThrow(/iv:authTag:ciphertext/);
    expect(() => decrypt("only:two")).toThrow(/iv:authTag:ciphertext/);
  });

  test("malformed payload throws (wrong IV length)", () => {
    const encrypted = encrypt("hello");
    const [, authTag, ct] = encrypted.split(":") as [string, string, string];
    // Provide a wrong-length IV.
    const badIv = Buffer.alloc(8).toString("base64");
    expect(() => decrypt([badIv, authTag, ct].join(":"))).toThrow(/IV length/);
  });

  test("malformed payload throws (wrong auth tag length)", () => {
    const encrypted = encrypt("hello");
    const [iv, , ct] = encrypted.split(":") as [string, string, string];
    const badTag = Buffer.alloc(10).toString("base64");
    expect(() => decrypt([iv, badTag, ct].join(":"))).toThrow(/auth tag length/);
  });

  test("generateKey produces a 32-byte base64 key", () => {
    const k = generateKey();
    expect(Buffer.from(k, "base64").length).toBe(32);
  });
});

describe("lib/encryption — missing / invalid key", () => {
  const ORIGINAL_KEY = process.env.MEDSYNC_PHI_KEY;

  afterEach(() => {
    if (ORIGINAL_KEY === undefined) {
      delete process.env.MEDSYNC_PHI_KEY;
    } else {
      process.env.MEDSYNC_PHI_KEY = ORIGINAL_KEY;
    }
  });

  test("encrypt throws a helpful message when MEDSYNC_PHI_KEY is missing", () => {
    delete process.env.MEDSYNC_PHI_KEY;
    expect(() => encrypt("anything")).toThrow(/MEDSYNC_PHI_KEY is not set/);
  });

  test("decrypt throws a helpful message when MEDSYNC_PHI_KEY is missing", () => {
    delete process.env.MEDSYNC_PHI_KEY;
    // Pre-build a syntactically valid payload so the key-check (which runs
    // after segment parsing) is the trigger, not the format check.
    const payload = ["AAAAAAAAAAAAAAAA", "AAAAAAAAAAAAAAAAAAAAAA==", "AA=="].join(":");
    expect(() => decrypt(payload)).toThrow(/MEDSYNC_PHI_KEY is not set/);
  });

  test("encrypt throws when MEDSYNC_PHI_KEY decodes to wrong length", () => {
    process.env.MEDSYNC_PHI_KEY = Buffer.alloc(16).toString("base64"); // 16, not 32
    expect(() => encrypt("anything")).toThrow(/32 bytes/);
  });
});
