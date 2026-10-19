import { PLANNED_GROUPS } from "@/features/visits/book-reasons";
import { APPOINTMENT_REASONS } from "@/lib/booking";

jest.mock("@/lib/supabase", () => ({ supabase: {} }));

describe("Book's planned-care reasons", () => {
  const planned = PLANNED_GROUPS.flatMap((g) => g.reasons.map((r) => r.reason));

  it("offers every Appendix A reason except the new problem, which is the other door", () => {
    const all = APPOINTMENT_REASONS.map((r) => r.value).filter((v) => v !== "new_concern");
    expect([...planned].sort()).toEqual([...all].sort());
  });

  it("offers each reason once", () => {
    expect(new Set(planned).size).toBe(planned.length);
  });
});
