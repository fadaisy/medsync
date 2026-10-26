import type { ClinicianOption, ClinicSession, ServiceLine } from "@/lib/booking";

import { clinicDays, loadAhead, mergeDays, slotDays } from "@/data/visits";

const mockRpc = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
}));
jest.mock("@/lib/booking", () => ({}));
jest.mock("@/lib/notifications", () => ({}));
jest.mock("@/lib/pending-symptoms", () => ({}));

describe("N ahead of you: the read", () => {
  beforeEach(() => mockRpc.mockReset());

  it("asks for the patient's own intake and returns the count", async () => {
    mockRpc.mockResolvedValue({ data: 4, error: null });
    expect(await loadAhead("i1")).toBe(4);
    expect(mockRpc).toHaveBeenCalledWith("patient_intake_ahead", { p_intake: "i1" });
  });

  it("is null on any error, so nothing is shown (0170 not applied, not present, offline)", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    expect(await loadAhead("i1")).toBeNull();
    mockRpc.mockResolvedValue({ data: null, error: null });
    expect(await loadAhead("i1")).toBeNull();
    mockRpc.mockRejectedValue(new Error("offline"));
    expect(await loadAhead("i1")).toBeNull();
  });
});

describe("a clinician's open slots as days", () => {
  const c = {
    userId: "u1",
    fullName: "Dr [Name A]",
    cadreId: "c1",
    departmentId: "d1",
    departmentName: "General clinic",
    slotsByDate: {
      "2026-10-21": [
        { startsAtIso: "2026-10-21T10:30:00Z", endsAtIso: "2026-10-21T10:45:00Z" },
        { startsAtIso: "2026-10-21T10:00:00Z", endsAtIso: "2026-10-21T10:15:00Z" },
      ],
      "2026-10-20": [{ startsAtIso: "2026-10-20T05:00:00Z", endsAtIso: "2026-10-20T05:15:00Z" }],
    },
  } as unknown as ClinicianOption;
  const line = {
    id: "l1",
    departmentId: "d1",
    reasonCodes: ["follow_up"],
    fee: { posture: "full", baseFeeUgx: 20000, lineName: "OPD", cadreFees: [] },
  } as unknown as ServiceLine;

  it("every open time of each day, in order, each one place with its own slot", () => {
    const days = slotDays(c, [line], "follow_up");
    expect(days.map((d) => d.key)).toEqual(["2026-10-20", "2026-10-21"]);
    expect(days[0].sessions).toEqual([
      expect.objectContaining({ part: "Morning", doors: null, placesLeft: 1, fee: 20000 }),
    ]);
    expect(days[1].sessions.map((s) => s.slot?.startsAtIso)).toEqual([
      "2026-10-21T10:00:00Z",
      "2026-10-21T10:30:00Z",
    ]);
    expect(days[1].sessions[1]).toMatchObject({
      id: "slot:2026-10-21T10:30:00Z",
      part: "Afternoon",
      placesLeft: 1,
      slot: {
        clinicianUserId: "u1",
        departmentId: "d1",
        startsAtIso: "2026-10-21T10:30:00Z",
        endsAtIso: "2026-10-21T10:45:00Z",
        serviceLineId: "l1",
      },
    });
  });

  it("no line for this reason: no fee and no line sent", () => {
    const [day] = slotDays(c, [line], "refill");
    expect(day.sessions[0].fee).toBeNull();
    expect(day.sessions[0].slot?.serviceLineId).toBeUndefined();
  });
});

describe("a doctor's calendar holds the clinic days they run", () => {
  const line = {
    id: "l1",
    name: "General Clinic",
    departmentName: "Internal Medicine",
    reasonCodes: ["new_concern"],
    fee: { posture: "none", baseFeeUgx: null, lineName: "General Clinic", cadreFees: [] },
    feeLine: null,
  } as unknown as ServiceLine;
  const s = (over: Partial<ClinicSession>): ClinicSession => ({
    id: "s1",
    serviceLineId: "l1",
    startsAtIso: "2026-10-21T05:00:00Z",
    endsAtIso: "2026-10-21T09:00:00Z",
    clinicianUserId: "u1",
    clinicianName: "Dr [Name A]",
    venue: null,
    placesLeft: 20,
    ...over,
  });

  it("keeps only that clinician's days, for a reason the clinic takes", () => {
    const sessions = [s({}), s({ id: "s2", clinicianUserId: "u2" })];
    expect(clinicDays(sessions, [line], "new_concern", "u1").map((d) => d.sessions[0].id)).toEqual([
      "s1",
    ]);
    expect(clinicDays(sessions, [line], "follow_up", "u1")).toEqual([]);
    expect(clinicDays(sessions, [line], "new_concern")).toHaveLength(1);
  });

  it("merges slots and clinic days by day, in order", () => {
    const a = [{ key: "2026-10-22", sessions: [] }];
    const b = clinicDays([s({})], [line], "new_concern", "u1");
    expect(mergeDays(a, b).map((d) => d.key)).toEqual(["2026-10-21", "2026-10-22"]);
    expect(mergeDays(b, b)[0].sessions).toHaveLength(2);
  });
});
