/**
 * §9 / B5: the outbox on a fake IndexedDB. Order per patient, back-off without blocking other
 * patients, a lost response replayed without duplication (the server is idempotent by command id),
 * permanent refusals become visible notes, online-only commands never queue, and nothing is stored
 * in plaintext.
 */
import "fake-indexeddb/auto";

import type { QueuedCommand, SendResult } from "@/lib/ncdreg/offline/outbox";
import { IDBFactory } from "fake-indexeddb";
import { describe, expect, it } from "vitest";

import { Outbox } from "@/lib/ncdreg/offline/outbox";
import { idbGet, idbKeys, openStore } from "@/lib/ncdreg/offline/store";

let n = 0;
const cmd = (
  personId: string,
  type: QueuedCommand["type"] = "visit.save_nurse",
  extra: Record<string, unknown> = {},
): QueuedCommand => ({
  id: `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`,
  type,
  payload: { personId, ...extra },
  clientTs: new Date().toISOString(),
});

/** A fake server that applies each command id once. */
function server() {
  const applied: string[] = [];
  const seen = new Set<string>();
  return {
    applied,
    send: async (c: QueuedCommand): Promise<SendResult> => {
      if (!seen.has(c.id)) {
        seen.add(c.id);
        applied.push(c.id);
      }
      return { ok: true };
    },
  };
}

/** Each test gets its own IndexedDB. */
const fresh = () => openStore(new IDBFactory());

describe("outbox", () => {
  it("sends in order, per patient, and records the last sync", async () => {
    const db = await fresh();
    const s = server();
    const ob = new Outbox(db, s.send);
    const a1 = cmd("A");
    const b1 = cmd("B");
    const a2 = cmd("A");
    for (const c of [a1, b1, a2]) await ob.enqueue(c);
    expect(await ob.waiting()).toBe(3);
    expect(await ob.flush()).toEqual({ sent: 3, failed: 0, discarded: 0 });
    expect(s.applied).toEqual([a1.id, b1.id, a2.id]);
    expect(await ob.waiting()).toBe(0);
    expect(await ob.lastSync()).not.toBeNull();
  });

  it("a failing command backs off and holds its patient's later commands, not other patients'", async () => {
    const db = await fresh();
    let clock = 1_000_000;
    const sent: string[] = [];
    let down = true;
    const ob = new Outbox(
      db,
      async (c) => {
        if (down && c.payload.personId === "A") return { ok: false, retry: true };
        sent.push(c.id);
        return { ok: true };
      },
      () => clock,
    );
    const a1 = cmd("A");
    const a2 = cmd("A");
    const b1 = cmd("B");
    for (const c of [a1, a2, b1]) await ob.enqueue(c);
    expect(await ob.flush()).toEqual({ sent: 1, failed: 1, discarded: 0 });
    expect(sent).toEqual([b1.id]);
    down = false;
    expect((await ob.flush()).sent).toBe(0); // still backing off
    clock += 10_000;
    await ob.flush();
    expect(sent).toEqual([b1.id, a1.id, a2.id]);
  });

  it("a lost response is replayed without duplication", async () => {
    const db = await fresh();
    const s = server();
    let lose = true;
    const ob = new Outbox(
      db,
      async (c) => {
        const r = await s.send(c);
        if (lose) {
          lose = false;
          throw new Error("connection reset"); // applied on the server, response lost
        }
        return r;
      },
      () => clock,
    );
    let clock = 0;
    const c = cmd("A");
    await ob.enqueue(c);
    await ob.flush();
    expect(await ob.waiting()).toBe(1);
    clock += 60_000;
    await ob.flush();
    expect(await ob.waiting()).toBe(0);
    expect(s.applied).toEqual([c.id]);
  });

  it("a permanent refusal is discarded with a visible note, not retried", async () => {
    const db = await fresh();
    const ob = new Outbox(db, async () => ({
      ok: false,
      retry: false,
      message: "This demo patient was removed.",
    }));
    await ob.enqueue(cmd("A"));
    expect(await ob.flush()).toEqual({ sent: 0, failed: 0, discarded: 1 });
    expect(await ob.waiting()).toBe(0);
    expect((await ob.notes())[0]?.message).toBe("This demo patient was removed.");
  });

  it("online-only commands never queue", async () => {
    const db = await fresh();
    const ob = new Outbox(db, server().send);
    await expect(ob.enqueue(cmd("A", "event.record"))).rejects.toThrow(/connection/);
    await expect(ob.enqueue(cmd("A", "merge.decide"))).rejects.toThrow(/connection/);
  });

  it("nothing is stored in plaintext, and the device key cannot be exported", async () => {
    const db = await fresh();
    const ob = new Outbox(db, server().send);
    await ob.enqueue(
      cmd("A", "person.enrol", { identity: { givenName: "Florence", familyName: "Nabirye" } }),
    );
    const [k] = (await idbKeys(db, "outbox")) as string[];
    const raw = await idbGet<{ ct: ArrayBuffer }>(db, "outbox", k!);
    expect(JSON.stringify(raw)).not.toContain("Florence");
    expect(new TextDecoder().decode(raw!.ct)).not.toContain("Florence");
    const key = await idbGet<CryptoKey>(db, "meta", "key");
    expect(key?.extractable).toBe(false);
    await expect(crypto.subtle.exportKey("raw", key!)).rejects.toThrow();
  });
});
