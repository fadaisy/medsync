import type { AuditMovement } from "@/lib/pharmacy/audit/derive";
import type { LossMovement } from "@/lib/pharmacy/losses/derive";
import type { MedRow, ReportFigures } from "@/lib/pharmacy/reports/derive";
import { describe, expect, it } from "vitest";

import { RULES } from "@/content/pharmacy-rework-records";
import { canCorrect, movementEvent } from "@/lib/pharmacy/audit/derive";
import { atRisk, causeOf, losses, sumBy, totalOf } from "@/lib/pharmacy/losses/derive";
import { openCases, reportGate, reportIssues } from "@/lib/pharmacy/reports/derive";
import { rosterHours, shiftOf, teamRows } from "@/lib/pharmacy/team/derive";

const loss = (o: Partial<LossMovement>): LossMovement => ({
  id: "m",
  at: "2026-10-05T07:00:00Z",
  placeId: null,
  place: "Main store",
  productId: "p",
  product: "Amoxicillin capsules",
  unit: "caps",
  batchNumber: "AX1",
  qty: 1,
  reasonCode: null,
  reasonNote: null,
  who: null,
  unitPrice: 0,
  ...o,
});

describe("losses (Scenario 11)", () => {
  it("names the cause from the reason, then the note (prototype causeOf)", () => {
    expect(causeOf("expired", null)).toBe("expired");
    expect(causeOf("adjusted", "Froze on 20 Oct: shake test failed")).toBe("cold_chain");
    expect(causeOf(null, "Box dropped on the ward")).toBe("damaged");
    expect(causeOf("cold_chain", null)).toBe("cold_chain");
    expect(causeOf(null, "recall notice")).toBe("recall");
    expect(causeOf(null, "count short")).toBe("unexplained");
  });

  it("the month's total is the ledger's loss lines, opened-vial wastage among them, through one function", () => {
    const lines = losses([
      loss({ id: "a", qty: 400, reasonCode: "expired", unitPrice: 80 }),
      loss({ id: "b", qty: 900, reasonCode: "expired", unitPrice: 40 }),
      loss({ id: "c", qty: 3, reasonCode: "damaged", unitPrice: 3500 }),
      loss({
        id: "d",
        qty: 59,
        reasonCode: "wastage:opened_vial",
        unitPrice: 350,
        place: "Immunisation clinic",
      }),
    ]);
    expect(lines).toHaveLength(4);
    expect(totalOf(lines)).toBe(400 * 80 + 900 * 40 + 3 * 3500 + 59 * 350);
    expect(sumBy(lines, (l) => l.cause)[0]).toEqual({ k: "expired", v: 68_000 });
    expect(lines.filter((l) => l.epi).map((l) => l.cause)).toEqual(["opened_vial"]);
  });

  it("amlodipine will expire before it is used; earliest expiry is used first", () => {
    const b = (
      productId: string,
      no: string,
      expires: string,
      have: number,
      amc: number,
      unitPrice: number,
    ) => ({
      productId,
      product: productId,
      unit: "tabs",
      batchNumber: no,
      expires,
      recalled: false,
      have,
      amc,
      unitPrice,
      places: [],
      done: [],
    });
    const risk = atRisk(
      [
        b("amlo", "AM24233", "2026-12-31", 4000, 1200, 60),
        b("amlo", "AM25042", "2028-04-30", 800, 1200, 60),
        b("ferr", "FF24190", "2026-11-30", 3000, 1900, 20),
        b("amox", "AX1", "2026-09-30", 50, 2600, 80),
      ],
      "2026-10-30",
      RULES.riskMonths,
    );
    expect(risk.map((r) => [r.productId, r.waste, r.value])).toEqual([
      ["amlo", 1600, 96_000],
      ["ferr", 1100, 22_000],
    ]);
  });
});

const med = (o: Partial<MedRow>): MedRow => ({
  productId: "p",
  name: "Amoxicillin capsules",
  unit: "caps",
  controlled: false,
  opening: 0,
  received: 0,
  consumed: 0,
  lost: 0,
  closing: 0,
  amc: 0,
  daysOut: 0,
  noWitness: 0,
  ...o,
});
const figures = (o: Partial<ReportFigures>): ReportFigures => ({
  meds: [],
  cases: [],
  epi: { inUse: false, antigens: [], waste: [] },
  losses: [],
  ...o,
});

describe("reports (Scenario 12)", () => {
  it("HMIS 105 needs a remark for each medicine with stock-out days before it can be checked", () => {
    const f = figures({
      meds: [med({ productId: "amox", daysOut: 4 }), med({ productId: "pcm" })],
    });
    const issues = reportIssues("hmis_meds", f, RULES.epiWastageRemarkPct);
    expect(issues).toEqual([
      {
        sev: "warn",
        key: "rm-amox",
        what: { k: "outOfStock", med: "Amoxicillin capsules", days: 4 },
      },
    ]);
    expect(reportGate(issues, {}, "draft", false)).toMatchObject({
      remarksLeft: 1,
      canCheck: false,
    });
    expect(reportGate(issues, { "rm-amox": "Delivered late" }, "draft", false)).toMatchObject({
      canCheck: true,
    });
    expect(reportGate(issues, { "rm-amox": "Delivered late" }, "checked", false).canSubmit).toBe(
      false,
    );
    expect(reportGate(issues, { "rm-amox": "Delivered late" }, "checked", true).canSubmit).toBe(
      true,
    );
  });

  it("the CD return is blocked while a controlled case is open, named in the report", () => {
    const cases = openCases([
      {
        src: "pharmacy_cases",
        j: { id: "c1", qty: -2 },
        who: null,
        productId: "mo",
        product: "Morphine",
        controlled: true,
        unitPrice: 4000,
      },
      {
        src: "pharmacy_cases",
        j: { id: "c2", qty: -1, signed_off_at: "2026-10-29T10:00:00Z" },
        who: null,
        productId: "mo",
        product: "Morphine",
        controlled: true,
        unitPrice: 4000,
      },
      {
        src: "pharmacy_cases",
        j: { id: "c3", source_type: "cd_check" },
        who: null,
        productId: null,
        product: null,
        controlled: false,
        unitPrice: 0,
      },
      {
        src: "pharmacy_cases",
        j: { id: "c4", qty: 0 },
        who: null,
        productId: "pcm",
        product: "Paracetamol",
        controlled: false,
        unitPrice: 20,
      },
    ]);
    expect(cases.map((c) => [c.id, c.controlled, c.qty])).toEqual([
      ["c1", true, -2],
      ["c3", true, null],
      ["c4", false, 0],
    ]);
    const f = figures({
      meds: [med({ productId: "mo", name: "Morphine", controlled: true })],
      cases,
    });
    const issues = reportIssues("cd_return", f, RULES.epiWastageRemarkPct);
    expect(issues.filter((i) => i.sev === "stop").map((i) => i.what)).toEqual([
      { k: "openCase", med: "Morphine", n: 1 },
      { k: "openCase", med: "", n: 1 },
    ]);
    expect(reportGate(issues, {}, "checked", true)).toMatchObject({ blocked: 2, canSubmit: false });
    expect(reportIssues("losses", f, 20)).toEqual([
      { sev: "info", key: null, what: { k: "casesOpen", n: 3 } },
    ]);
  });

  it("opened-vial wastage over the line needs a remark; no immunisation records says so", () => {
    expect(reportIssues("hmis_epi", figures({}), 20)).toEqual([
      { sev: "info", key: null, what: { k: "epiMissing" } },
    ]);
    const f = figures({
      epi: {
        inUse: true,
        antigens: [],
        waste: [
          { vaccine: "BCG", given: 96, wasted: 59 },
          { vaccine: "Td", given: 130, wasted: 1 },
        ],
      },
    });
    expect(reportIssues("hmis_epi", f, 20)).toEqual([
      { sev: "warn", key: "rm-BCG", what: { k: "epiWaste", vaccine: "BCG", pct: 38 } },
    ]);
  });
});

const mv = (o: Partial<AuditMovement>): AuditMovement => ({
  id: "m1",
  kind: "supplied",
  quantity: -15,
  effectiveAt: "2026-10-30T08:00:00Z",
  recordedAt: "2026-10-30T08:00:00Z",
  late: false,
  downtime: false,
  paperWitness: null,
  reasonCode: null,
  reasonNote: null,
  reversesId: null,
  correctionOfId: null,
  actorId: "me",
  who: "S. Nantongo",
  witness: null,
  batchId: "b",
  batchNumber: "AX1",
  productId: "p",
  product: "Amoxicillin capsules",
  unit: "caps",
  controlled: false,
  placeId: null,
  place: "Window",
  batchBalance: 85,
  correctedAt: null,
  correctedBy: null,
  correctedWhy: null,
  ...o,
});

describe("audit trail (Scenario 8)", () => {
  it("Correct is offered on own correctable entries, to the in-charge on anyone's, once", () => {
    const me = { userId: "me", inCharge: false };
    expect(canCorrect(mv({}), me)).toBe(true);
    expect(canCorrect(mv({ actorId: "other" }), me)).toBe(false);
    expect(canCorrect(mv({ actorId: "other" }), { userId: "me", inCharge: true })).toBe(true);
    expect(canCorrect(mv({ correctedAt: "2026-10-30T09:00:00Z" }), me)).toBe(false);
    expect(canCorrect(mv({ kind: "issued" }), me)).toBe(false);
    expect(canCorrect(mv({ kind: "reversed", reversesId: "m0" }), me)).toBe(false);
    // Stock that came in can be reversed only while it is still there.
    expect(canCorrect(mv({ kind: "received", quantity: 100, batchBalance: 40 }), me)).toBe(false);
  });

  it("a controlled line out without a witness is flagged; a corrected line says so", () => {
    expect(movementEvent(mv({ controlled: true })).tags).toEqual(["no_witness"]);
    expect(movementEvent(mv({ controlled: true, witness: "J. Ayo" })).tags).toEqual([]);
    const e = movementEvent(mv({ correctedAt: "2026-10-30T09:00:00Z", late: true }));
    expect(e.tags).toEqual(["late", "corrected"]);
    expect(movementEvent(mv({ reversesId: "m0", kind: "adjusted" })).cat).toBe("corr");
  });
});

describe("team", () => {
  it("per hour is per hour on the roster; night and on call count their own hours", () => {
    const hours = rosterHours(
      [
        { userId: "a", shift: "day", dateFrom: "2026-10-20", dateTo: "2026-10-26" },
        { userId: "b", shift: "call", dateFrom: "2026-10-25", dateTo: "2026-11-30" },
      ],
      "2026-10-23",
      "2026-10-30",
      RULES.shiftHours,
    );
    expect(hours.get("a|day")).toBe(4 * 9);
    expect(hours.get("b|day")).toBe(6 * 9);
    expect(hours.get("b|night")).toBe(6 * 15);
    expect(shiftOf("2026-10-30T06:00:00Z", 8, 17)).toBe("day");
    expect(shiftOf("2026-10-30T15:00:00Z", 8, 17)).toBe("night");
    const rows = teamRows(
      [
        {
          userId: "a",
          who: "A",
          at: "2026-10-30T06:00:00Z",
          type: "rx",
          late: false,
          noWitness: false,
          matched: null,
        },
        {
          userId: "a",
          who: "A",
          at: "2026-10-30T07:00:00Z",
          type: "rx",
          late: false,
          noWitness: false,
          matched: null,
        },
        {
          userId: "a",
          who: "A",
          at: "2026-10-30T07:30:00Z",
          type: "count",
          late: false,
          noWitness: false,
          matched: true,
        },
      ],
      hours,
      null,
      { dayStarts: 8, nightStarts: 17 },
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      rx: 2,
      hours: 36,
      perHour: 0.1,
      countsMatched: 1,
      countLines: 1,
      handovers: null,
    });
  });
});
