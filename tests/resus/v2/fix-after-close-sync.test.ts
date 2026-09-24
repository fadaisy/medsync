import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * R6 — after-close records reach every desk and never overwrite blindly (no
 * DB: the scope and the query builder are stubbed). What is pinned: a saved
 * after-death task or debrief says "something changed" on the private episode
 * topic, ids only; a debrief save over a newer version is refused, not
 * written; only the submitted-debrief trigger reads as "already submitted".
 */

const EPISODE = "5b0c3f5e-3c1a-4b8e-9d2a-1f6e2c7a9b10";
const BASE = "2026-09-24T08:00:00.000Z";
const SAVED = new Date("2026-09-24T08:05:00.000Z");

const h = vi.hoisted(() => ({
  selects: [] as unknown[][],
  upsert: vi.fn(),
  execute: vi.fn(),
  txError: null as Error | null,
}));

function chain(rows: unknown[]) {
  const c = {
    from: () => c,
    where: () => c,
    limit: async () => rows,
  };
  return c;
}

vi.mock("@/lib/resus/scope", () => ({
  requireResusScope: async () => ({ userId: "u-1", hospitalId: "h-1" }),
}));
vi.mock("@/lib/encounter/feature", () => ({ encounterEngineLive: () => false }));
vi.mock("@/lib/encounter/handoff", () => ({ openEncounterFromTriage: vi.fn() }));
vi.mock("@/lib/resus/v2-record", () => ({
  commitResusEvents: vi.fn(),
  fetchAllResusEvents: vi.fn(async () => []),
  fetchActiveResusEvents: vi.fn(async () => []),
}));
vi.mock("@/db", () => ({
  db: {
    select: () => chain(h.selects.shift() ?? []),
    execute: h.execute,
    transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
      if (h.txError) throw h.txError;
      return fn({
        insert: () => ({
          values: () => ({
            onConflictDoUpdate: () => ({ returning: async () => h.upsert() }),
            then: (ok: (v: unknown) => void) => ok(undefined),
          }),
        }),
      });
    },
  },
}));

const { recordAfterDeathTaskV2, saveDebriefV2 } =
  await import("@/app/nurse/resus/_v2/actions-closeout");

const closedJustNow = () => [{ state: "concluded", endedAt: new Date() }];
const save = () =>
  saveDebriefV2({
    episodeId: EPISODE,
    attendeeCount: 4,
    wentWell: "Early shock",
    toImprove: "",
    actions: "",
    equipmentIssues: "",
    welfareCheckDone: true,
    submit: false,
    baseUpdatedAtIso: BASE,
  });
const broadcastText = () => JSON.stringify(h.execute.mock.calls[0]?.[0]?.queryChunks ?? []);

beforeEach(() => {
  h.selects = [];
  h.upsert.mockReset();
  h.execute.mockReset();
  h.txError = null;
});

describe("R6 — after-close records reach every desk", () => {
  it("R6: an after-death task broadcasts on the private episode topic, ids only", async () => {
    h.selects.push(closedJustNow());
    const r = await recordAfterDeathTaskV2({
      episodeId: EPISODE,
      taskId: "CO-ADT-01",
      state: "done",
    });
    expect(r).toEqual({ ok: true });
    expect(h.execute).toHaveBeenCalledTimes(1);
    expect(broadcastText()).toContain(`resus:${EPISODE}`);
    expect(broadcastText()).toContain("after_close");
  });

  it("R6: a saved debrief broadcasts and returns its new version", async () => {
    h.selects.push(closedJustNow());
    h.upsert.mockReturnValue([{ updatedAt: SAVED }]);
    await expect(save()).resolves.toEqual({ ok: true, updatedAtIso: SAVED.toISOString() });
    expect(h.execute).toHaveBeenCalledTimes(1);
  });
});

describe("R6 — one device's old save never overwrites another's", () => {
  it("R6: a save over a newer version is refused and names that version", async () => {
    h.selects.push(closedJustNow(), [{ status: "draft", updatedAt: SAVED }]);
    h.upsert.mockReturnValue([]);
    const r = await save();
    expect(r).toMatchObject({ ok: false, stale: true, updatedAtIso: SAVED.toISOString() });
    expect(h.execute).not.toHaveBeenCalled();
  });

  it("R6: a refused save of a submitted debrief reads as already submitted", async () => {
    h.selects.push(closedJustNow(), [{ status: "submitted", updatedAt: SAVED }]);
    h.upsert.mockReturnValue([]);
    const r = await save();
    expect(r.ok ? "" : r.error).toMatch(/already submitted/);
  });

  it("R6: only the submitted-debrief trigger maps to 'already submitted'; anything else can retry", async () => {
    h.selects.push(closedJustNow(), closedJustNow());
    h.txError = new Error("resus_debriefs is immutable once submitted");
    const locked = await save();
    expect(locked.ok ? "" : locked.error).toMatch(/already submitted/);
    h.txError = new Error("connection reset");
    const other = await save();
    expect(other.ok ? "" : other.error).toBe("Could not save the debrief — try again.");
  });
});
