import type * as Common from "@/app/nurse/resus/_v2/common";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Resus close-out → EMR handoff wiring (HARMONISATION §5.6, R4). Under EMR v1 nothing opens an
 * encounter before the resus commit (the orphan fix); consumeResusHandoff runs only after the
 * commit succeeded, and its failure never fails the close. Flag off: the old seam, unchanged.
 * No DB: the scope, prelude, commit and the EMR write are stubbed.
 */

const order: string[] = [];
const emrOn = vi.hoisted(() => ({ value: true }));
const commit = vi.hoisted(() => vi.fn());
const openEncounter = vi.hoisted(() => vi.fn());
const write = vi.hoisted(() => vi.fn());
const consume = vi.hoisted(() => vi.fn());

vi.mock("@/lib/resus/scope", () => ({ requireResusScope: vi.fn() }));
vi.mock("@/db", () => ({ db: {} }));
vi.mock("@/lib/encounter/feature", () => ({ encounterEngineLive: () => true }));
vi.mock("@/lib/encounter/handoff", () => ({ openEncounterFromTriage: openEncounter }));
vi.mock("@/lib/emr/feature", () => ({ emrV1LiveFor: () => emrOn.value }));
vi.mock("@/lib/emr/write/handoff", () => ({ consumeResusHandoff: consume }));
vi.mock("@/lib/emr/write/context", async () => {
  class EmrWriteError extends Error {
    constructor(
      readonly code: string,
      message: string,
    ) {
      super(message);
    }
  }
  return { EmrWriteError, withPatientWrite: write };
});
vi.mock("@/lib/resus/v2-record", () => ({
  commitResusEvents: commit,
  fetchAllResusEvents: vi.fn(async () => []),
  fetchActiveResusEvents: vi.fn(async () => []),
}));
vi.mock("@/app/nurse/resus/_v2/common", async (importOriginal) => {
  const real = await importOriginal<typeof Common>();
  return { ...real, prelude: vi.fn(real.prelude) };
});

const common = await import("@/app/nurse/resus/_v2/common");
const { closeResusV2 } = await import("@/app/nurse/resus/_v2/actions-closeout");

const EPISODE = "5b0c3f5e-3c1a-4b8e-9d2a-1f6e2c7a9b10";
const PATIENT = "7c1d4a6e-2b3f-4c5d-8e9f-0a1b2c3d4e5f";
const AT = "2026-09-24T07:10:00.000Z";

function prelude(patientUserId: string | null = PATIENT) {
  vi.mocked(common.prelude).mockResolvedValueOnce({
    ok: true,
    scope: {
      userId: "u-1",
      fullName: "Nurse A",
      hospitalId: "h-1",
      departmentId: "d-1",
      affiliationId: "a-1",
      cadreCode: "NURSE",
    } as never,
    header: {
      id: EPISODE,
      hospitalId: "h-1",
      departmentId: "d-1",
      departmentName: "Emergency",
      state: "active",
      phase: "survey",
      currentArrestSeq: 0,
      patientUserId,
      triageRecordId: "t-1",
      endedAt: null,
      lastActivityAt: new Date(AT),
      startedAt: new Date("2026-09-24T06:00:00.000Z"),
    },
    events: [],
    rows: 3,
    replay: null,
  });
}

const close = () =>
  closeResusV2({
    episodeId: EPISODE,
    clientEventId: crypto.randomUUID(),
    outcomeCode: "stabilised",
    disposition: {
      suggestedLevel: null,
      chosenLevel: null,
      destination: "ward",
      unitId: null,
      mismatch: null,
      mismatchNote: null,
      ruleIds: [],
    },
    sbar: { situation: "", background: "", assessment: "", recommendation: "" },
    receiving: null,
    escort: null,
  });

const header = () => (commit.mock.calls[0]![0] as { header: Record<string, unknown> }).header;

beforeEach(() => {
  order.length = 0;
  emrOn.value = true;
  for (const m of [commit, openEncounter, write, consume]) m.mockReset();
  commit.mockImplementation(async () => {
    order.push("commit");
    return { ok: true, serverTime: AT, events: [{ eventId: "e-1" }] };
  });
  openEncounter.mockImplementation(async () => {
    order.push("open");
    return { ok: true, encounterId: "enc-old" };
  });
  write.mockImplementation(async (_actor, patientUserId: string, fn: (ctx: unknown) => unknown) => {
    order.push(`handoff:${patientUserId}`);
    return fn({});
  });
  consume.mockResolvedValue({ id: "note-1", encounterId: "enc-new" });
});

describe("close-out → EMR handoff under EMR v1", () => {
  it("opens nothing before the commit, then hands off after it; the flag is left for the handoff", async () => {
    prelude();
    const r = await close();
    expect(order).toEqual(["commit", `handoff:${PATIENT}`]);
    expect(openEncounter).not.toHaveBeenCalled();
    expect(header()).toMatchObject({ pendingEncounterHandoff: true });
    expect(header()).not.toHaveProperty("encounterId");
    expect(consume).toHaveBeenCalledWith({}, { patientUserId: PATIENT, episodeId: EPISODE });
    expect(r).toMatchObject({ ok: true, encounterId: "enc-new" });
    expect(write.mock.calls[0]![0]).toMatchObject({
      userId: "u-1",
      hospitalId: "h-1",
      isClinical: true,
    });
  });

  it("a failed commit hands nothing off", async () => {
    prelude();
    commit.mockResolvedValueOnce({ ok: false, error: "Could not record." });
    const r = await close();
    expect(r.ok).toBe(false);
    expect(write).not.toHaveBeenCalled();
  });

  it("a failed handoff never fails the close: the resus is closed, the flag stays set", async () => {
    prelude();
    write.mockRejectedValueOnce(new Error("no basis"));
    const r = await close();
    expect(r).toMatchObject({ ok: true, encounterId: null });
  });

  it("an unidentified patient keeps the flag for later; nothing is written", async () => {
    prelude(null);
    const r = await close();
    expect(r).toMatchObject({ ok: true, encounterId: null });
    expect(write).not.toHaveBeenCalled();
  });
});

describe("flag off: the pre-EMR seam, unchanged", () => {
  it("opens the encounter from triage before the commit, and never hands off", async () => {
    emrOn.value = false;
    prelude();
    const r = await close();
    expect(order).toEqual(["open", "commit"]);
    expect(header()).toMatchObject({ pendingEncounterHandoff: false, encounterId: "enc-old" });
    expect(write).not.toHaveBeenCalled();
    expect(r).toMatchObject({ ok: true, encounterId: "enc-old" });
  });
});
