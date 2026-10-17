import AsyncStorage from "@react-native-async-storage/async-storage";

import {
  flushOutbox,
  insertOrQueue,
  newId,
  readOutbox,
  savedLine,
  unqueue,
} from "@/offline/outbox";

type Result = { error: { code: string; message: string } | null };

/** A fake Supabase: one signed-in user, and a table that answers from `answer`. */
const mockDb = {
  user: "u1" as string | null,
  rows: new Map<string, Record<string, unknown>>(),
  answer: (row: Record<string, unknown>): Result => {
    if (mockDb.offline)
      return { error: { code: "", message: "TypeError: Network request failed" } };
    if (mockDb.rows.has(String(row.id)))
      return { error: { code: "23505", message: "duplicate key" } };
    mockDb.rows.set(String(row.id), row);
    return { error: null };
  },
  offline: false,
};

jest.mock("@/lib/supabase", () => ({
  supabase: {
    auth: {
      getSession: async () => ({
        data: { session: mockDb.user ? { user: { id: mockDb.user } } : null },
      }),
    },
    from: () => ({ insert: async (row: Record<string, unknown>) => mockDb.answer(row) }),
  },
}));

const row = (id = newId(), owner = "u1") => ({ id, patient_user_id: owner, kind: "bp" });

beforeEach(async () => {
  await AsyncStorage.clear();
  mockDb.rows.clear();
  mockDb.offline = false;
  mockDb.user = "u1";
});

describe("outbox", () => {
  it("sends when online", async () => {
    expect(await insertOrQueue("personal_health_logs", row("a"))).toBe("sent");
    expect(mockDb.rows.has("a")).toBe(true);
    expect(await readOutbox()).toHaveLength(0);
  });

  it("queues when offline, then replays once online", async () => {
    mockDb.offline = true;
    expect(await insertOrQueue("personal_health_logs", row("b"))).toBe("queued");
    expect(await readOutbox()).toHaveLength(1);
    mockDb.offline = false;
    expect(await flushOutbox()).toBe(1);
    expect(mockDb.rows.has("b")).toBe(true);
    expect(await readOutbox()).toHaveLength(0);
  });

  it("is idempotent: a replay of a row that already landed counts as sent", async () => {
    mockDb.offline = true;
    await insertOrQueue("personal_health_logs", row("c"));
    mockDb.offline = false;
    mockDb.rows.set("c", row("c")); // the first try landed; only the answer was lost
    expect(await flushOutbox()).toBe(1);
    expect(mockDb.rows.size).toBe(1);
    expect(await readOutbox()).toHaveLength(0);
  });

  it("keeps items while offline, and another account's items", async () => {
    mockDb.offline = true;
    await insertOrQueue("personal_health_logs", row("d"));
    await insertOrQueue("personal_health_logs", row("e", "someone-else"));
    expect(await flushOutbox()).toBe(0);
    mockDb.offline = false;
    expect(await flushOutbox()).toBe(1);
    expect((await readOutbox()).map((i) => (i.payload.row as { id: string }).id)).toEqual(["e"]);
  });

  it("an undo before sending takes the item out of the queue", async () => {
    mockDb.offline = true;
    await insertOrQueue("self_medication_takes", row("f"));
    expect(await unqueue("f")).toBe(true);
    expect(await unqueue("f")).toBe(false);
    expect(await readOutbox()).toHaveLength(0);
  });

  it("makes v4-shaped ids and says what happened in plain words", () => {
    expect(newId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(savedLine("sent")).toBe("Saved · only you can see it");
    expect(savedLine("queued")).toBe("Saved on this phone. It will send when you are online");
    expect(savedLine("failed")).toBe("Couldn't save that. Try again later.");
  });
});
