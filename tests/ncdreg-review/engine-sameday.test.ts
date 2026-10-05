/**
 * Review: two closed visits on one date (allowed by §9, "keep both") make C04/C05/not_recorded depend
 * on row order. loadDataset has no ORDER BY, so the result depends on Postgres heap order.
 */
import type { DPerson, DVisit } from "@/lib/ncdreg/indicators/dataset";
import { describe, expect, it } from "vitest";

import { computeIndicators } from "@/lib/ncdreg/indicators/engine";
import { CONDITION_CATALOGUE } from "@/lib/ncdreg/standard/conditions";

const visit = (id: string, bp: [number, number] | null): DVisit => ({
  id,
  date: "2026-09-10",
  type: "scheduled",
  closed: true,
  invalid: false,
  historical: false,
  enteredDate: "2026-09-10",
  bp,
  glucose: null,
  hba1c: null,
  weightKg: 70,
  medicines: [],
  medicinesRecorded: true,
  missedDoses: "none",
  medicinesObtained: "full",
  notObtainedReason: null,
  nextAppointment: "2026-12-10",
  disposition: null,
  recordedControl: {},
});
const person = (visits: DVisit[]): DPerson => ({
  id: "p1",
  sex: "female",
  birthYear: 1970,
  isSynthetic: true,
  district: null,
  knownCvd: [],
  hasValidPhone: true,
  recallRemovedAt: null,
  registrations: [{ id: "r1", condition: "hypertension", date: "2025-01-01" }],
  visits,
  reviews: [],
  events: [],
  appointments: [],
  calls: [],
});
const c05 = (ps: DPerson[]) =>
  computeIndicators(
    { facilityId: "f", timeZone: "Africa/Kampala", persons: ps },
    { month: "2026-09", catalogue: CONDITION_CATALOGUE, enabled: new Set(["hypertension"]) },
  ).results.C05!.num;

describe("review: same-day duplicate visits", () => {
  it("C05 is the same whatever order the two visits come back in", () => {
    const a = visit("v1", [160, 100]);
    const b = visit("v2", null);
    expect(c05([person([a, b])])).toBe(c05([person([b, a])]));
  });
});
