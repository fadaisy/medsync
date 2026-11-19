import { loadVisitAhead } from "@/data/visits";

/**
 * "N ahead of you" for a booked visit (ADR 0084 §6, owner approved 19 Nov 2026): the intake the desk's check-in
 * made for the booking, then the walk-in's own count. Nothing before check-in, once seen, or on any failure.
 */
const mockRpc = jest.fn();
const mockIntake = jest.fn();
jest.mock("@/lib/supabase", () => ({
  supabase: { rpc: (...a: unknown[]) => mockRpc(...a) },
}));
jest.mock("@/lib/booking", () => ({ fetchVisitIntake: (id: string) => mockIntake(id) }));
jest.mock("@/lib/notifications", () => ({}));
jest.mock("@/lib/pending-symptoms", () => ({}));

describe("N ahead of you for a booked visit", () => {
  beforeEach(() => {
    mockRpc.mockReset();
    mockIntake.mockReset();
  });

  it("present with a count: the intake's status and the server's number", async () => {
    mockIntake.mockResolvedValue({ id: "i9", status: "awaiting_triage" });
    mockRpc.mockResolvedValue({ data: 3, error: null });
    expect(await loadVisitAhead("a1")).toEqual({ status: "awaiting_triage", ahead: 3 });
    expect(mockIntake).toHaveBeenCalledWith("a1");
    expect(mockRpc).toHaveBeenCalledWith("patient_intake_ahead", { p_intake: "i9" });
  });

  it("present with no one ahead: 0 comes back as 0", async () => {
    mockIntake.mockResolvedValue({ id: "i9", status: "arrived" });
    mockRpc.mockResolvedValue({ data: 0, error: null });
    expect(await loadVisitAhead("a1")).toEqual({ status: "arrived", ahead: 0 });
  });

  it("not present: no intake yet, or already seen, and the count is never asked", async () => {
    mockIntake.mockResolvedValue(null);
    expect(await loadVisitAhead("a1")).toBeNull();
    mockIntake.mockResolvedValue({ id: "i9", status: "triaged" });
    expect(await loadVisitAhead("a1")).toBeNull();
    mockIntake.mockResolvedValue({ id: "i9", status: "declared" });
    expect(await loadVisitAhead("a1")).toBeNull();
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("any failure is null, so nothing is drawn", async () => {
    mockIntake.mockRejectedValue(new Error("offline"));
    expect(await loadVisitAhead("a1")).toBeNull();
    mockIntake.mockResolvedValue({ id: "i9", status: "arrived" });
    mockRpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    expect(await loadVisitAhead("a1")).toBeNull();
    mockRpc.mockRejectedValue(new Error("offline"));
    expect(await loadVisitAhead("a1")).toBeNull();
  });
});
