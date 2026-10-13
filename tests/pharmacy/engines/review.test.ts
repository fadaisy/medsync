import type { PharmacyAccess, PharmacyPermission } from "@/lib/pharmacy/access";
import type { LaneReasonCode } from "@/lib/pharmacy/lanes";
import type { QueryLite } from "@/lib/pharmacy/lines";
import type { ReviewEvent } from "@/lib/pharmacy/review/review";
import { describe, expect, it } from "vitest";

import {
  acceptanceNeeded,
  acceptKind,
  mayAccept,
  mayDecline,
  mayRecordNotSupplied,
  readOnlyNotice,
  remainingLines,
  reviewBasis,
  supplyWithoutReviewAllowed,
  voidedByChange,
  WAITING_FOR_PHARMACIST,
} from "@/lib/pharmacy/review/review";

/**
 * Pharmacy Phase 1 — review (RQ-1, RQ-9, RQ-12, LN-2, LO-7, Section 8). Fixture data: lines L1–L3 of an
 * invented prescription, invented user ids (Law 8).
 */
const access = (...p: PharmacyPermission[]): PharmacyAccess => ({ permissions: new Set(p) });
const PHARMACIST = access(
  "pharmacy.view",
  "pharmacy.review",
  "pharmacy.dispense",
  "pharmacy.stock",
  "pharmacy.controlled",
);
const TECHNICIAN = access("pharmacy.view", "pharmacy.dispense", "pharmacy.stock");

const perLine = new Map<string, LaneReasonCode[]>([
  ["L1", ["overridden_stop"]],
  ["L2", []],
  ["L3", []],
]);
const T0 = new Date("2026-10-12T07:00:00.000Z");
const query = (o: Partial<QueryLite> = {}): QueryLite => ({
  id: "Q1",
  scope: "line",
  lineIds: ["L1"],
  sentAt: T0,
  events: [],
  ...o,
});

describe("RQ-1 a review is an event by a holder of pharmacy.review", () => {
  it("RQ-1 S14: an overridden stop is accepted as accepted_overridden_stop; anything else as accepted", () => {
    expect(acceptKind(["overridden_stop"])).toBe("accepted_overridden_stop");
    expect(acceptKind(["typed_dose"])).toBe("accepted");
    expect(acceptKind([])).toBe("accepted");
  });

  it("RQ-1 S13: a pharmacist may accept; a pharmacy technician may not (a forged acceptLine is refused)", () => {
    expect(mayAccept(PHARMACIST)).toBe(true);
    expect(mayAccept(TECHNICIAN)).toBe(false);
  });

  it("RQ-1: the standard lane is checked at supply; no acceptance is needed", () => {
    expect(reviewBasis("standard", "L1", [])).toEqual({ kind: "checked_at_supply" });
    expect(acceptanceNeeded("standard", perLine, "L1")).toBe("none");
  });
});

describe("LN-2 every line of a pharmacist-first prescription needs an acceptance", () => {
  it("LN-2: a line with a reason needs its own tap; a line with none can go with the remaining", () => {
    expect(acceptanceNeeded("pharmacist_first", perLine, "L1")).toBe("own_tap");
    expect(acceptanceNeeded("pharmacist_first", perLine, "L2")).toBe("accept_remaining");
    expect(acceptanceNeeded("pharmacist_first", perLine, "unknown")).toBe("accept_remaining");
  });

  it("LN-2 S14: 'Accept the remaining lines' takes the unflagged lines and leaves the flagged one", () => {
    expect(
      remainingLines("pharmacist_first", perLine, ["L1", "L2", "L3"], new Set(["L3"])),
    ).toEqual(["L2"]);
    expect(remainingLines("standard", perLine, ["L1", "L2"], new Set())).toEqual([]);
  });

  it("LN-2 S13: a pharmacy technician sees a pharmacist-first prescription read-only", () => {
    expect(readOnlyNotice(TECHNICIAN, "pharmacist_first")).toBe(WAITING_FOR_PHARMACIST);
    expect(WAITING_FOR_PHARMACIST).toBe("Waiting for a pharmacist");
    expect(readOnlyNotice(PHARMACIST, "pharmacist_first")).toBeNull();
    expect(readOnlyNotice(TECHNICIAN, "standard")).toBeNull();
  });
});

describe("Section 8 recordNotSupplied waits for an acceptance on a pharmacist-first line", () => {
  it("S13: a forged recordNotSupplied on a line no pharmacist accepted is refused", () => {
    expect(
      mayRecordNotSupplied({
        access: TECHNICIAN,
        lane: "pharmacist_first",
        versionId: "L1",
        events: [],
      }),
    ).toBe(false);
  });

  it("S13: once accepted (or in the standard lane) a holder of pharmacy.dispense may record it", () => {
    const events: ReviewEvent[] = [{ id: "r1", prescriptionId: "L1", kind: "accepted" }];
    expect(
      mayRecordNotSupplied({
        access: TECHNICIAN,
        lane: "pharmacist_first",
        versionId: "L1",
        events,
      }),
    ).toBe(true);
    expect(
      mayRecordNotSupplied({ access: TECHNICIAN, lane: "standard", versionId: "L1", events: [] }),
    ).toBe(true);
    expect(
      mayRecordNotSupplied({
        access: access("pharmacy.view"),
        lane: "standard",
        versionId: "L1",
        events: [],
      }),
    ).toBe(false);
  });
});

describe("RQ-9 a changed line voids the old version's acceptances and staged decisions", () => {
  const events: ReviewEvent[] = [
    { id: "a-old", prescriptionId: "L1", kind: "accepted" },
    { id: "d-old", prescriptionId: "L1", kind: "decision_saved" },
    { id: "d-new", prescriptionId: "L1b", kind: "decision_saved" },
  ];

  it("RQ-9 S17: an acceptance counts only for the row id it was written on", () => {
    const { standing, voided } = voidedByChange("L1b", events);
    expect(standing.map((e) => e.id)).toEqual(["d-new"]);
    expect(voided.map((e) => e.id)).toEqual(["a-old", "d-old"]);
    expect(reviewBasis("pharmacist_first", "L1b", events)).toBeNull();
    expect(reviewBasis("pharmacist_first", "L1", events)).toEqual({
      kind: "accepted",
      eventId: "a-old",
    });
  });

  it("RQ-9: a cleared staged decision no longer stands", () => {
    const { standing } = voidedByChange("L1", [
      { id: "d1", prescriptionId: "L1", kind: "decision_saved" },
      { id: "c1", prescriptionId: "L1", kind: "decision_cleared" },
    ]);
    expect(standing).toEqual([]);
  });
});

describe("RQ-12 supply without a pharmacist (D-PH1-05)", () => {
  const base = {
    settingOn: true,
    legalQ1OnRecord: true,
    controlled: false,
    access: TECHNICIAN,
  };

  it("RQ-12 S54: refused with the setting off, allowed with it on and legal question 1 answered", () => {
    expect(supplyWithoutReviewAllowed({ ...base, settingOn: false })).toEqual({
      ok: false,
      reason: "setting_off",
    });
    expect(supplyWithoutReviewAllowed({ ...base, legalQ1OnRecord: false })).toEqual({
      ok: false,
      reason: "no_legal_answer",
    });
    expect(supplyWithoutReviewAllowed(base)).toEqual({ ok: true });
  });

  it("RQ-12 S54: a controlled line never takes this path; a viewer without dispense cannot", () => {
    expect(supplyWithoutReviewAllowed({ ...base, controlled: true })).toEqual({
      ok: false,
      reason: "controlled",
    });
    expect(supplyWithoutReviewAllowed({ ...base, access: access("pharmacy.view") })).toEqual({
      ok: false,
      reason: "not_permitted",
    });
  });

  it("RQ-12: the recorded reason clears a pharmacist-first line for supply", () => {
    expect(
      reviewBasis("pharmacist_first", "L1", [
        {
          id: "w1",
          prescriptionId: "L1",
          kind: "supplied_without_review",
          reasonCode: "no_pharmacist",
        },
      ]),
    ).toEqual({ kind: "supplied_without_review", eventId: "w1", reasonCode: "no_pharmacist" });
  });
});

describe("LO-7 declining needs a query on the line", () => {
  it("LO-7 S29: a pharmacist cannot decline a line that was never queried", () => {
    expect(mayDecline({ access: PHARMACIST, lineId: "L1", queries: [] })).toBe(false);
  });

  it("LO-7 S29: after a query (open or answered 'keep') a pharmacist may decline; a technician never", () => {
    const answered = query({ events: [{ kind: "answered", at: T0, answer: "keep" }] });
    expect(mayDecline({ access: PHARMACIST, lineId: "L1", queries: [query()] })).toBe(true);
    expect(mayDecline({ access: PHARMACIST, lineId: "L1", queries: [answered] })).toBe(true);
    expect(mayDecline({ access: TECHNICIAN, lineId: "L1", queries: [answered] })).toBe(false);
  });
});
