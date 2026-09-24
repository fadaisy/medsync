import type * as Common from "@/app/nurse/resus/_v2/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resus Desk v2 server actions — the review fixes that live in the action
 * layer (no DB: the scope, the prelude and the write core are stubbed). What
 * is pinned: a lapsed session never redirects a background call (R2), the
 * bedside time reaches the row (R3), re-activate needs no reason (LC-08), and
 * the bed status is part of the disposition record (§5.12 step 2).
 */

const scope = vi.hoisted(() => ({ fn: vi.fn() }));
vi.mock("@/lib/resus/scope", () => ({ requireResusScope: scope.fn }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/encounter/feature", () => ({ encounterEngineLive: () => false }));
vi.mock("@/lib/encounter/handoff", () => ({ openEncounterFromTriage: vi.fn() }));
const commit = vi.hoisted(() => vi.fn());
vi.mock("@/lib/resus/v2-record", () => ({
  commitResusEvents: commit,
  fetchAllResusEvents: vi.fn(async () => []),
  fetchActiveResusEvents: vi.fn(async () => []),
}));
vi.mock("@/app/nurse/resus/_v2/common", async (importOriginal) => {
  const real = await importOriginal<typeof Common>();
  return { ...real, prelude: vi.fn(real.prelude) };
});

const { redirect } = await import("next/navigation");
const common = await import("@/app/nurse/resus/_v2/common");
const { cancelResusV2, closeResusV2, reactivateResusV2 } =
  await import("@/app/nurse/resus/_v2/actions-closeout");

const EPISODE = "5b0c3f5e-3c1a-4b8e-9d2a-1f6e2c7a9b10";
const id = () => crypto.randomUUID();
const AT = "2026-09-24T07:10:00.000Z";

function landedPrelude(phase: string) {
  vi.mocked(common.prelude).mockResolvedValueOnce({
    ok: true,
    scope: { userId: "u-1", hospitalId: "h-1", departmentId: "d-1" } as never,
    header: {
      id: EPISODE,
      hospitalId: "h-1",
      departmentId: "d-1",
      departmentName: "Emergency",
      state: "active",
      phase,
      currentArrestSeq: 0,
      patientUserId: null,
      triageRecordId: null,
      endedAt: null,
      lastActivityAt: new Date(AT),
      startedAt: new Date("2026-09-24T06:00:00.000Z"),
    },
    events: [],
    rows: 3,
    replay: null,
  });
}

/** The single commitResusEvents call's input. */
const written = () =>
  commit.mock.calls[0]![0] as {
    events: { recordedAt?: string; payload: Record<string, unknown> }[];
    header?: { endedAt?: Date };
  };

beforeEach(() => {
  commit.mockReset();
  commit.mockResolvedValue({ ok: true, serverTime: AT, events: [{ eventId: "e-1" }] });
  scope.fn.mockReset();
});

describe("a lapsed session never redirects a background call (R2)", () => {
  it("the scope check answers null instead of throwing the sign-in redirect", async () => {
    scope.fn.mockImplementation(async () => redirect("/sign-in"));
    await expect(common.resusScopeOrNull()).resolves.toBeNull();
  });

  it("other failures still throw", async () => {
    scope.fn.mockRejectedValue(new Error("db down"));
    await expect(common.resusScopeOrNull()).rejects.toThrow("db down");
  });

  it("a write answers 'signed out … will retry', so the queue keeps the entry", async () => {
    scope.fn.mockImplementation(async () => redirect("/sign-in/mfa"));
    const r = await cancelResusV2({
      episodeId: EPISODE,
      clientEventId: id(),
      reason: "Opened in error",
    });
    expect(r).toMatchObject({ ok: false, signedOut: true });
    expect(r.ok ? "" : r.error).toMatch(/will retry/);
    expect(commit).not.toHaveBeenCalled();
  });
});

describe("the bedside time reaches the row (Law 6)", () => {
  it("LC-08: re-activate needs no reason and keeps its bedside time", async () => {
    landedPrelude("boarding");
    const r = await reactivateResusV2({ episodeId: EPISODE, clientEventId: id(), recordedAt: AT });
    expect(r.ok).toBe(true);
    const w = written();
    expect(w.events[0]!.recordedAt).toBe(AT);
    expect(w.events[0]!.payload).toMatchObject({ reason: null, label: "Resus re-activated" });
  });

  it("LC-03: a cancel is stamped, and ended, at its bedside time", async () => {
    landedPrelude("survey");
    await cancelResusV2({
      episodeId: EPISODE,
      clientEventId: id(),
      recordedAt: AT,
      reason: "Opened in error",
    });
    expect(written().events[0]!.recordedAt).toBe(AT);
    expect(written().header?.endedAt?.toISOString()).toBe(AT);
  });
});

describe("the bed status is part of the disposition (§5.12 step 2)", () => {
  const close = (bed: Record<string, unknown>) =>
    closeResusV2({
      episodeId: EPISODE,
      clientEventId: id(),
      outcomeCode: "stabilised",
      disposition: {
        suggestedLevel: null,
        chosenLevel: null,
        destination: "ward",
        unitId: null,
        mismatch: null,
        mismatchNote: null,
        ruleIds: [],
        ...bed,
      },
      sbar: { situation: "", background: "", assessment: "", recommendation: "" },
      receiving: null,
      escort: null,
    });
  const disposition = () =>
    written().events.find((e) => e.payload.decision === "disposition")!.payload;

  it("who accepted the bed is recorded and read", async () => {
    landedPrelude("survey");
    await close({ bed: "accepted", bedAcceptedBy: "Ward 4 in-charge" });
    expect(disposition()).toMatchObject({ bed: "accepted", bedAcceptedBy: "Ward 4 in-charge" });
    expect(disposition().label).toMatch(/bed accepted by Ward 4 in-charge/);
  });

  it("a close-out that does not send the bed still closes (both null)", async () => {
    landedPrelude("survey");
    const r = await close({});
    expect(r.ok).toBe(true);
    expect(disposition()).toMatchObject({ bed: null, bedAcceptedBy: null });
  });
});
