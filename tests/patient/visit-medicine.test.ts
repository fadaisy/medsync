/**
 * "Add to my medicines" (ADR 0203 §7), the pure half: only a take-home item on the shared copy can be added, and
 * the tracker row copies the prescription as written, with no dose times and a note naming the visit.
 */
import type { VisitSummaryContent } from "@/lib/patient/visit-summary";
import { describe, expect, it } from "vitest";

import { isTakeHomeOn, selfMedicationFromPrescription } from "@/lib/patient/visit-medicine";

const content: VisitSummaryContent = {
  v: 1,
  visit: { startedAt: "2026-10-02T22:30:00Z", hospitalName: "Lane Hospital", clinician: null },
  outcome: "You went home.",
  outcomeNote: null,
  sections: {
    found: [{ id: "dx:d1", text: "Malaria", detail: null }],
    medicines: [{ id: "rx:p1", text: "Artemether/lumefantrine", detail: null }],
    stopped: [{ id: "stop:p2", text: "Ibuprofen", detail: null }],
    tests: [],
  },
  next: null,
  comeBackIf: null,
};

describe("isTakeHomeOn", () => {
  it("is true only for a take-home medicine on this copy", () => {
    expect(isTakeHomeOn(content, "p1")).toBe(true);
    expect(isTakeHomeOn(content, "p2")).toBe(false); // stopped, not take-home
    expect(isTakeHomeOn(content, "d1")).toBe(false);
    expect(isTakeHomeOn(content, "rx:p1")).toBe(false);
    expect(
      isTakeHomeOn({ ...content, sections: { ...content.sections, medicines: [] } }, "p1"),
    ).toBe(false);
  });
});

describe("selfMedicationFromPrescription", () => {
  const rx = {
    id: "p1",
    drugName: "Artemether/lumefantrine",
    dose: "4 tablets",
    route: "oral",
    frequency: "12-hourly",
    duration: "3 days",
  };

  it("copies the dose exactly, words the route, and sets no times", () => {
    expect(selfMedicationFromPrescription(rx, content.visit)).toEqual({
      name: "Artemether/lumefantrine",
      dose: "4 tablets",
      instructions: "By mouth, 12-hourly, for 3 days",
      schedule_pattern: "as_needed",
      schedule_times: null,
      // 22:30Z is 01:30 the next day in Kampala.
      notes: "From your visit at Lane Hospital on 3 Oct 2026.",
      source_prescription_id: "p1",
    });
  });

  it("keeps an unknown route as written and drops what the prescription did not state", () => {
    const row = selfMedicationFromPrescription(
      { ...rx, route: "topical", frequency: null, duration: null },
      content.visit,
    );
    expect(row.instructions).toBe("topical");
  });
});
