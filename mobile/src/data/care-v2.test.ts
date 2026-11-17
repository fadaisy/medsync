import AsyncStorage from "@react-native-async-storage/async-storage";

import { careReadingBody, planItemsOf, saveCareReading, tickDose } from "@/data/care-v2";
import { flushOutbox, readOutbox } from "@/offline/outbox";

/**
 * S18 on the phone: offline ticks and readings wait in the outbox and replay with the same client key, and the
 * server (fake here, keyed like 0301's UNIQUE (patient, client_key)) keeps one row however often they arrive.
 */
const mockServer = {
  offline: false,
  calls: [] as { fn: string; body: Record<string, unknown> }[],
  saved: new Map<string, Record<string, unknown>>(),
  inserted: new Map<string, Record<string, unknown>>(),
};

jest.mock("@/lib/edge", () => ({
  callEdge: async (fn: string, body: Record<string, unknown>) => {
    if (mockServer.offline) return { ok: false, error: "offline", code: "offline" };
    mockServer.calls.push({ fn, body });
    const key = `${fn}:${String(body.clientKey)}`;
    if (!mockServer.saved.has(key)) mockServer.saved.set(key, body);
    return { ok: true, data: {} };
  },
}));

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: async () => ({ data: { session: { user: { id: "u1" } } } }) },
    from: () => ({
      insert: async (row: Record<string, unknown>) => {
        if (mockServer.offline) return { error: { code: "", message: "Network request failed" } };
        if (mockServer.inserted.has(String(row.client_key ?? row.id)))
          return { error: { code: "23505", message: "duplicate" } };
        mockServer.inserted.set(String(row.client_key ?? row.id), row);
        return { error: null };
      },
    }),
  },
}));

beforeEach(async () => {
  await AsyncStorage.clear();
  mockServer.offline = false;
  mockServer.calls = [];
  mockServer.saved.clear();
  mockServer.inserted.clear();
});

const dose = {
  planVersionId: "11111111-1111-4111-8111-111111111111",
  medicineKey: "metformin",
  dueAtIso: "2026-11-16T05:00:00.000Z",
  status: "taken" as const,
};

describe("care mode on the phone: S18", () => {
  it("an offline tick waits, then replays once with the same key, even when flushed twice at once", async () => {
    mockServer.offline = true;
    expect(await tickDose({ ...dose, clientKey: "tick-key-0001" })).toBe("queued");
    expect(await readOutbox()).toHaveLength(1);
    mockServer.offline = false;
    await Promise.all([flushOutbox(), flushOutbox()]);
    expect(mockServer.calls).toHaveLength(1);
    expect(mockServer.calls[0]!.body.clientKey).toBe("tick-key-0001");
    expect(await readOutbox()).toHaveLength(0);
  });

  it("a tick sent twice is one saved tick", async () => {
    await tickDose({ ...dose, clientKey: "tick-key-0002" });
    await tickDose({ ...dose, clientKey: "tick-key-0002" });
    expect([...mockServer.saved.keys()].filter((k) => k.endsWith("tick-key-0002"))).toHaveLength(1);
  });

  it("an offline reading: the log row and the team's copy share one key, and each lands once", async () => {
    mockServer.offline = true;
    const input = { kind: "sugar" as const, value: 6.4, context: "fasting" as const };
    expect(await saveCareReading(input, { kind: "glucose", v1: 6.4, unit: "mmol/L", note: "context:fasting" })).toBe("queued");
    const queued = await readOutbox();
    expect(queued.map((i) => i.kind)).toEqual(["insert", "reading"]);
    const rowId = (queued[0]!.payload.row as { id: string; client_key: string }).id;
    expect((queued[0]!.payload.row as { client_key: string }).client_key).toBe(rowId);
    expect((queued[1]!.payload.body as { clientKey: string }).clientKey).toBe(rowId);
    mockServer.offline = false;
    await flushOutbox();
    await flushOutbox();
    expect(mockServer.inserted.size).toBe(1);
    expect(mockServer.calls.filter((c) => c.fn === "pt-care-reading")).toHaveLength(1);
    expect(await readOutbox()).toHaveLength(0);
  });

  it("another account's queued item is never sent", async () => {
    mockServer.offline = true;
    await tickDose({ ...dose, clientKey: "tick-key-0003" });
    const items = await readOutbox();
    items[0]!.payload.owner = "someone-else";
    await AsyncStorage.setItem("medsync-outbox-v1", JSON.stringify(items));
    mockServer.offline = false;
    await flushOutbox();
    expect(mockServer.calls).toHaveLength(0);
  });
});

describe("plan items and reading bodies", () => {
  it("keeps only well-formed items and never invents a time (MR3)", () => {
    expect(
      planItemsOf([
        { key: "m", name: "Metformin", times: ["08:00", "8pm"] },
        { key: "x" },
        { key: "s", name: "Sugar check", kind: "check", times: ["07:00"] },
      ]),
    ).toEqual([
      { key: "m", name: "Metformin", why: null, kind: "dose", times: ["08:00"] },
      { key: "s", name: "Sugar check", why: null, kind: "check", times: ["07:00"] },
    ]);
    expect(planItemsOf(null)).toEqual([]);
  });
  it("an incomplete reading has no body", () => {
    const at = new Date("2026-11-16T05:00:00Z");
    expect(careReadingBody({ kind: "bp", top: 150, bottom: null }, "k", at)).toBeNull();
    expect(careReadingBody({ kind: "bp", top: 150, bottom: 95 }, "k", at)).toMatchObject({ kind: "bp", top: 150 });
  });
});
