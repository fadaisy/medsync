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

import {
  purgeOnSignOut,
  readSnapshot,
  saveSnapshot,
  SNAPSHOT_TTL_MS,
} from "@/lib/ncdreg/offline/cache";
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
    expect(await ob.flush()).toEqual({ sent: 3, failed: 0, discarded: 0, held: 0 });
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
    const a1 = cmd("A", "visit.save_nurse", { weightKg: 300 });
    const a2 = cmd("A");
    const b1 = cmd("B");
    for (const c of [a1, a2, b1]) await ob.enqueue(c);
    expect(await ob.flush()).toEqual({ sent: 1, failed: 1, discarded: 0, held: 0 });
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
    expect(await ob.flush()).toEqual({ sent: 0, failed: 0, discarded: 1, held: 0 });
    expect(await ob.waiting()).toBe(0);
    expect((await ob.notes())[0]?.message).toBe("This demo patient was removed.");
  });

  it("a refusal that needs a person's decision is held, blocks that patient only, and is released or discarded deliberately", async () => {
    const db = await fresh();
    const sent: QueuedCommand[] = [];
    const ob = new Outbox(db, async (c) => {
      sent.push(c);
      const conf = (c.payload.confirmations as string[] | undefined) ?? [];
      if (c.payload.weightKg === 300 && !conf.includes("weight_kg"))
        return {
          ok: false,
          hold: true,
          code: "needs_confirmation",
          message: "Confirm",
          detail: { fields: ["weight_kg"] },
        };
      return { ok: true };
    });
    const a1 = cmd("A", "visit.save_nurse", { weightKg: 300 });
    const a2 = cmd("A");
    const b1 = cmd("B");
    for (const c of [a1, a2, b1]) await ob.enqueue(c);
    expect(await ob.flush()).toEqual({ sent: 1, failed: 0, discarded: 0, held: 1 });
    expect(sent.map((c) => c.id)).toEqual([a1.id, b1.id]); // a2 waits behind the held a1
    expect((await ob.heldItems()).map((x) => x.c.id)).toEqual([a1.id]);
    // Still held on the next flush: never discarded, never resent without a decision.
    await ob.flush();
    expect(await ob.waiting()).toBe(2);
    await ob.release(a1.id, { confirmations: ["weight_kg"] });
    expect(await ob.flush()).toMatchObject({ sent: 2, held: 0 });
    expect(await ob.waiting()).toBe(0);
    // A deliberate discard leaves a note.
    const c = cmd("A", "visit.save_nurse", { weightKg: 300 });
    await ob.enqueue(c);
    await ob.flush();
    await ob.discard(c.id, "entered twice");
    expect(await ob.waiting()).toBe(0);
    expect((await ob.notes()).some((x) => x.id === c.id && /entered twice/.test(x.message))).toBe(
      true,
    );
  });

  it("the device copy expires: a snapshot older than the TTL is removed on read", async () => {
    const db = await fresh();
    const at = Date.parse("2026-10-05T08:00:00Z");
    await saveSnapshot(db, {
      fetchedAt: new Date(at).toISOString(),
      date: "2026-10-05",
      clinic: [],
      overdue: [],
    });
    expect(await readSnapshot(db, at + SNAPSHOT_TTL_MS - 1)).not.toBeNull();
    expect(await readSnapshot(db, at + SNAPSHOT_TTL_MS + 1)).toBeNull();
    expect(await readSnapshot(db, at)).toBeNull(); // removed, not hidden
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

describe("the offline read cache (§9)", () => {
  const snap = (ids: string[]) => ({
    fetchedAt: new Date().toISOString(),
    date: "2026-10-05",
    clinic: ids.map((personId) => ({
      personId,
      name: `Name ${personId}`,
      registryNumber: "DEMO-1",
      sex: "female" as const,
      age: 50,
      conditions: [],
      visitId: null,
      stage: "not_arrived",
      heightCm: 160,
      glucose: false,
      trajectory: [],
    })),
    overdue: [],
  });

  it("is encrypted at rest and replaced whole, so removed (demo) records leave the device at the next sync", async () => {
    const db = await fresh();
    await saveSnapshot(db, snap(["A", "B"]));
    const raw = await idbGet<{ ct: ArrayBuffer }>(db, "cache", "snapshot");
    expect(new TextDecoder().decode(raw!.ct)).not.toContain("Name A");
    await saveSnapshot(db, snap(["B"])); // A was a demo patient, removed on the server
    expect((await readSnapshot(db))!.clinic.map((p) => p.personId)).toEqual(["B"]);
  });

  it("is purged on sign-out only once the outbox is empty", async () => {
    const db = await fresh();
    const ob = new Outbox(db, async () => ({ ok: false, retry: true }));
    await saveSnapshot(db, snap(["A"]));
    await ob.enqueue(cmd("A"));
    expect(await purgeOnSignOut(db)).toEqual({ purged: false, waiting: 1 });
    expect(await readSnapshot(db)).not.toBeNull();
    const ob2 = new Outbox(db, server().send);
    await ob2.flush();
    expect(await purgeOnSignOut(db)).toEqual({ purged: true, waiting: 0 });
    expect(await readSnapshot(db)).toBeNull();
    expect(await idbGet(db, "meta", "key")).toBeUndefined();
  });
});
