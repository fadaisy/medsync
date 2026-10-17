import type { ClinicianOption, ServiceLine } from "@/lib/booking";

import { loadAhead, slotDays } from "@/data/visits";

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
        { startsAtIso: "2026-10-21T10:00:00Z", endsAtIso: "2026-10-21T10:15:00Z" },
        { startsAtIso: "2026-10-21T10:30:00Z", endsAtIso: "2026-10-21T10:45:00Z" },
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

  it("one option per part of a day, earliest slot, never a clock time", () => {
    const days = slotDays(c, [line], "follow_up");
    expect(days.map((d) => d.key)).toEqual(["2026-10-20", "2026-10-21"]);
    expect(days[0].sessions).toEqual([
      expect.objectContaining({ part: "Morning", doors: null, placesLeft: 1, fee: 20000 }),
    ]);
    expect(days[1].sessions[0]).toMatchObject({
      part: "Afternoon",
      placesLeft: 2,
      slot: {
        clinicianUserId: "u1",
        departmentId: "d1",
        startsAtIso: "2026-10-21T10:00:00Z",
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
