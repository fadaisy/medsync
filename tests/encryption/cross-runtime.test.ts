import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vitest";

import * as node from "@/lib/encryption";
import * as port from "@/supabase/functions/_shared/encryption";

/**
 * Migration 0060 stores `provisional_patients.declared_name_encrypted` /
 * `phone_encrypted` from BOTH runtimes: the Edge Functions write them, the
 * Next dispatcher and the reception board read them. One wire format, or
 * the desk cannot read what the desk wrote. The port runs here on Node's
 * global `crypto.subtle`.
 */
const KEY = randomBytes(32).toString("base64");
const ORIGINAL = process.env.MEDSYNC_PHI_KEY;

beforeAll(() => {
  process.env.MEDSYNC_PHI_KEY = KEY;
});
afterAll(() => {
  if (ORIGINAL === undefined) delete process.env.MEDSYNC_PHI_KEY;
  else process.env.MEDSYNC_PHI_KEY = ORIGINAL;
});

const SAMPLES = ["", "+256772123456", "Nakato, Grace", "Ẹ̀gbọ́n — Ŋ ọmọ 👶", "a".repeat(2048)];

describe("Node ⇄ Web Crypto port — one wire format", () => {
  test("Node-encrypt → port-decrypt", async () => {
    for (const s of SAMPLES) expect(await port.decrypt(node.encrypt(s), KEY)).toBe(s);
  });

  test("port-encrypt → Node-decrypt", async () => {
    for (const s of SAMPLES) expect(node.decrypt(await port.encrypt(s, KEY))).toBe(s);
  });

  test("the port's payload has the Node shape: 12-byte IV, 16-byte tag, base64", async () => {
    const [iv, tag, ct] = (await port.encrypt("x", KEY)).split(":") as [string, string, string];
    expect(Buffer.from(iv, "base64")).toHaveLength(12);
    expect(Buffer.from(tag, "base64")).toHaveLength(16);
    expect(Buffer.from(ct, "base64")).toHaveLength(1);
    expect(await port.encrypt("x", KEY)).not.toBe(await port.encrypt("x", KEY));
  });

  test("the port rejects a tampered tag and a wrong key, as Node does", async () => {
    const payload = await port.encrypt("secret", KEY);
    const [iv, tag, ct] = payload.split(":") as [string, string, string];
    const flipped = Buffer.from(tag, "base64");
    flipped[0] = (flipped[0] as number) ^ 0xff;
    await expect(port.decrypt(`${iv}:${flipped.toString("base64")}:${ct}`, KEY)).rejects.toThrow();
    await expect(port.decrypt(payload, randomBytes(32).toString("base64"))).rejects.toThrow();
    expect(() => node.decrypt(`${iv}:${flipped.toString("base64")}:${ct}`)).toThrow();
  });

  test("blindIndex is byte-identical across runtimes and keyed", async () => {
    for (const s of SAMPLES) {
      const a = node.blindIndex(s);
      expect(a).toMatch(/^[0-9a-f]{64}$/);
      expect(await port.blindIndex(s, KEY)).toBe(a);
    }
    expect(await port.blindIndex("+256772123456", randomBytes(32).toString("base64"))).not.toBe(
      node.blindIndex("+256772123456"),
    );
  });

  test("the port validates the key the way Node does", async () => {
    await expect(port.encrypt("x", undefined as unknown as string)).rejects.toThrow(
      /MEDSYNC_PHI_KEY is not set/,
    );
    await expect(port.encrypt("x", randomBytes(16).toString("base64"))).rejects.toThrow(
      /exactly 32 bytes/,
    );
  });
});
