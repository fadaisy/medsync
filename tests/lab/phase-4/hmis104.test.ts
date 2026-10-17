import { readFileSync } from "node:fs";
import type { HmisMapping, HmisReferralRecord } from "@/lib/lab/hmis105";
import { describe, expect, it } from "vitest";

import {
  AVERAGE_TAT,
  cellKey,
  PENDING,
  recordsCover104,
  referralCells104,
  REFERRED,
} from "@/lib/lab/hmis105";

/**
 * Lab Phase 4 Step 3: HMIS 105 section 10.4 from records (HM-14..HM-17). A synthetic month (October 2026, Africa/
 * Kampala) with one row mapped to a synthetic test; the expected cells are in
 * tests/lab/phase-4/fixtures/hmis104-expected.json for a person to review against the hand count below.
 */
const H = "hospital-a";
const mapping = {
  rows: [{ code: "VS02", sources: [{ testCode: "test.referred" }] }],
} as unknown as HmisMapping;
const d = (iso: string) => new Date(iso);
const r = (id: string, o: Partial<HmisReferralRecord>): HmisReferralRecord => ({
  referralId: id,
  hospitalId: H,
  testCodes: ["test.referred"],
  routine: true,
  state: "handed_over",
  sentAt: null,
  completedAt: null,
  stateAt: null,
  ...o,
});
const records: HmisReferralRecord[] = [
  // Sent 2 Oct, back 6 Oct: 4 days.
  r("rf-1", {
    state: "completed",
    sentAt: d("2026-10-02T07:00:00Z"),
    completedAt: d("2026-10-06T07:00:00Z"),
    stateAt: d("2026-10-06T07:00:00Z"),
  }),
  // Sent 10 Oct, back 12 Oct 19:00: 2.5 days.
  r("rf-2", {
    state: "completed",
    sentAt: d("2026-10-10T07:00:00Z"),
    completedAt: d("2026-10-12T19:00:00Z"),
    stateAt: d("2026-10-12T19:00:00Z"),
  }),
  // Sent 20 Oct, still out at the end of the month: pending.
  r("rf-3", {
    state: "at_hub",
    sentAt: d("2026-10-20T07:00:00Z"),
    stateAt: d("2026-10-21T07:00:00Z"),
  }),
  // Sent in September, back in October: counts in turnaround for October, not in "referred".
  r("rf-4", {
    state: "completed",
    sentAt: d("2026-09-28T07:00:00Z"),
    completedAt: d("2026-10-03T07:00:00Z"),
    stateAt: d("2026-10-03T07:00:00Z"),
  }),
  // Rejected in October: counted once as referred, not pending (HM-17).
  r("rf-5", {
    state: "rejected",
    sentAt: d("2026-10-05T07:00:00Z"),
    stateAt: d("2026-10-07T07:00:00Z"),
  }),
  // Outbreak and cancelled: left out (HM-17).
  r("rf-6", { routine: false, state: "handed_over", sentAt: d("2026-10-08T07:00:00Z") }),
  r("rf-7", {
    state: "cancelled",
    sentAt: d("2026-10-09T07:00:00Z"),
    stateAt: d("2026-10-09T09:00:00Z"),
  }),
  // Another hospital, and a test not on the row.
  r("rf-8", { hospitalId: "hospital-b", sentAt: d("2026-10-02T07:00:00Z") }),
  r("rf-9", { testCodes: ["test.other"], sentAt: d("2026-10-02T07:00:00Z") }),
  // Packed, not yet sent: neither referred nor pending.
  r("rf-10", { state: "packed" }),
  // Sent 31 Oct 22:30 Kampala (19:30Z): in October by the hospital's day.
  r("rf-11", { state: "handed_over", sentAt: d("2026-10-31T19:30:00Z") }),
];

describe("HM-14..HM-17 section 10.4 from records", () => {
  const cells = referralCells104({
    hospitalId: H,
    month: "2026-10",
    timeZone: "Africa/Kampala",
    mapping,
    rows: ["VS02"],
    referrals: records,
  });

  it("S28 HM-14 the cells equal the hand count of the same referrals (reviewed fixture)", () => {
    const expected = JSON.parse(
      readFileSync("tests/lab/phase-4/fixtures/hmis104-expected.json", "utf8"),
    ) as Record<string, unknown>;
    expect(cells).toEqual(expected.cells);
  });

  it("HM-14 referred = handed over in the month; turnaround over the ones back in the month; pending at month end", () => {
    expect(cells[cellKey("VS02", REFERRED)]).toEqual({
      value: 5,
      sources: ["rf-1", "rf-2", "rf-3", "rf-5", "rf-11"],
    });
    expect(cells[cellKey("VS02", AVERAGE_TAT)]).toEqual({
      value: 3.83,
      sources: ["rf-1", "rf-2", "rf-4"],
    });
    expect(cells[cellKey("VS02", PENDING)]).toEqual({ value: 2, sources: ["rf-3", "rf-11"] });
  });

  it("HM-14 no referral completed → turnaround is blank, never 0", () => {
    const none = referralCells104({
      hospitalId: H,
      month: "2026-11",
      timeZone: "Africa/Kampala",
      mapping,
      rows: ["VS02"],
      referrals: [],
    });
    expect(none[cellKey("VS02", AVERAGE_TAT)]).toEqual({ value: null, sources: [] });
    expect(none[cellKey("VS02", REFERRED)]).toEqual({ value: 0, sources: [] });
  });

  it("HM-16 records cover a month only from the month the lab lead declared", () => {
    expect(recordsCover104("2026-10", "2026-11")).toBe(false);
    expect(recordsCover104("2026-11", "2026-11")).toBe(true);
    expect(recordsCover104("2026-12", "2026-11")).toBe(true);
    expect(recordsCover104("2026-12", null)).toBe(false);
  });
});
