import type { CaseRow } from "@/lib/pharmacy/cases/derive";
import type { CdCheck, CdMove } from "@/lib/pharmacy/cd/derive";
import type { Handover } from "@/lib/pharmacy/handover/derive";
import { describe, expect, it } from "vitest";

import { CONTROLS_COPY } from "@/content/pharmacy-rework-controls";
import { caseFlags, caseList, findingsReady } from "@/lib/pharmacy/cases/derive";
import { cdFlags, cdUnit, doseUnits, missingWindow } from "@/lib/pharmacy/cd/derive";
import { hoFlags, hoMine, slotNow, slotsBetween } from "@/lib/pharmacy/handover/derive";

/** Controls, pure (rework TECH-SPEC §3): dose maths, the CD flags and window, handover slots, case order. */
const H = 3_600_000;
const T0 = Date.UTC(2026, 9, 30, 9, 0); // 12:00 Kampala
const at = (h: number) => new Date(T0 + h * H);

const move = (p: Partial<CdMove>): CdMove => ({
  id: "m1",
  at: at(0),
  recordedAt: at(0),
  kind: "ward_used",
  qty: -1,
  medicineId: "morphine",
  medicineName: "Morphine injection 10 mg/mL",
  placeId: "ward",
  by: "Nurse",
  witness: "Second nurse",
  paperWitness: null,
  late: false,
  reversed: false,
  note: null,
  dose: null,
  events: [],
  ...p,
});
const check = (p: Partial<CdCheck>): CdCheck => ({
  id: "c1",
  at: at(0),
  placeId: "ward",
  by: "Pharmacist",
  witness: "Tech",
  handover: false,
  lines: [{ medicineId: "morphine", expected: 5, counted: 5, resolution: null }],
  ...p,
});

describe("controlled-drug dose maths", () => {
  it("rounds ampoules up and shows the residue", () => {
    const u = cdUnit("Pethidine injection 100 mg/2 mL")!;
    expect(doseUnits(75, u)).toEqual({ units: 1, residueMg: 25, residueMl: 0.5 });
    expect(doseUnits(10, cdUnit("Morphine injection 10 mg/mL")!).residueMg).toBe(0);
    expect(cdUnit("Paracetamol")).toBeNull();
  });
});

describe("cdFlags", () => {
  it("orders a count mismatch first and flags a missing witness, residue, early dose and due check", () => {
    const dose = {
      id: "d",
      patient: "A",
      bed: null,
      prescriber: "Dr",
      givenBy: null,
      doseMg: 5,
      route: "IV",
      residueMg: 5,
      residueDisposed: false,
      lateEntry: false,
    };
    const flags = cdFlags({
      moves: [
        move({ id: "in", qty: 10, kind: "received_from_issue", at: at(-48) }),
        move({ id: "a", at: at(-2), dose: { ...dose, id: "d1" }, witness: null }),
        move({ id: "b", at: at(-1), dose: { ...dose, id: "d2", residueDisposed: true } }),
      ],
      checks: [
        check({
          at: at(-30),
          lines: [{ medicineId: "morphine", expected: 5, counted: 4, resolution: null }],
        }),
      ],
      places: [{ id: "ward", name: "Paediatrics", kind: "ward" }],
      now: at(0),
    });
    expect(flags.map((f) => f.k)).toEqual(["disc", "wit", "res", "gap", "due"]);
  });

  it("the missing window runs from the last matching count", () => {
    const ok = check({ id: "ok", at: at(-24) });
    const bad = check({
      id: "bad",
      lines: [{ medicineId: "morphine", expected: 5, counted: 4, resolution: null }],
    });
    const w = missingWindow({ check: bad, medicineId: "morphine", checks: [ok, bad], moves: [] });
    expect(w).toEqual({ from: at(-24), to: at(0), fromMatch: true });
  });
});

describe("handover slots", () => {
  it("lists 08:00 and 17:00 Kampala and flags a missed slot only for the in-charge or that station", () => {
    expect(
      slotsBetween(at(-12).getTime(), at(12).getTime()).map((s) => new Date(s).toISOString()),
    ).toEqual(["2026-10-30T05:00:00.000Z", "2026-10-30T14:00:00.000Z"]);
    const places = [
      { id: "opd", name: "OPD", kind: "store" },
      { id: "ward", name: "Ward", kind: "ward" },
    ];
    const h: Handover = {
      id: "h",
      placeId: "opd",
      slotAt: new Date(Date.UTC(2026, 9, 30, 5)),
      at: at(-4),
      acceptedAt: at(-4),
      from: "a",
      to: "b",
      toUserId: "b",
      keys: true,
      seal: null,
      sealNew: false,
      items: 0,
      lines: [],
    };
    const flags = hoFlags({ places, handovers: [h], misses: [], now: at(0).getTime() });
    const missedToday = flags.filter((f) => f.k === "miss" && f.slot === h.slotAt!.getTime());
    expect(missedToday.map((f) => f.placeId)).toEqual(["ward"]);
    expect(hoMine(flags, false, "opd").some((f) => f.placeId === "ward")).toBe(false);
    expect(hoMine(flags, true, "opd").some((f) => f.placeId === "ward")).toBe(true);
    expect(slotNow([], "opd", Date.UTC(2026, 9, 30, 14, 30))).toBe(Date.UTC(2026, 9, 30, 14));
    // A place that has never handed over has nothing missed yet; one that started counts only from its start.
    const fresh = hoFlags({
      places: places.map((p) => ({ ...p, startedAt: null })),
      handovers: [],
      misses: [],
      now: at(0).getTime(),
    });
    expect(fresh.filter((f) => f.k === "miss")).toEqual([]);
    const late = hoFlags({
      places: [{ ...places[0]!, startedAt: at(0).getTime() - 3_600_000 }],
      handovers: [],
      misses: [],
      now: at(0).getTime(),
    });
    expect(late.filter((f) => f.k === "miss")).toEqual([]);
  });
});

describe("cases", () => {
  const c = (p: Partial<CaseRow>): CaseRow => ({
    id: "1",
    sourceType: "cd_check",
    sourceId: "s",
    medicineId: "m",
    medicineName: "Morphine",
    placeId: "p",
    placeName: "Peds",
    qty: -1,
    what: null,
    severity: "high",
    dueAt: at(24),
    ownerUserId: null,
    owner: null,
    fixedAt: null,
    fixedHow: null,
    findings: null,
    submittedAt: null,
    signedOffAt: null,
    selfSigned: false,
    createdAt: at(0),
    foundBy: "x",
    fromHandover: false,
    escalated: false,
    ...p,
  });
  it("lists new first and asks the in-charge to assign and sign off", () => {
    const list = caseList(
      [
        c({ id: "mine", ownerUserId: "me" }),
        c({ id: "new" }),
        c({ id: "so", ownerUserId: "x", submittedAt: at(0) }),
      ],
      at(0),
    );
    expect(list.map((x) => x.id)).toEqual(["new", "mine", "so"]);
    expect(caseFlags(list, "me", true, at(0)).map((f) => f.why)).toEqual([
      "not_assigned",
      "yours",
      "signoff",
    ]);
    expect(caseFlags(list, "me", false, at(0)).map((f) => f.why)).toEqual(["yours"]);
  });
  it("findings need the number fixed first", () => {
    const f = { cause: "Miscounted", actions: ["Late entry made"], prevent: ["Extra daily count"] };
    expect(findingsReady(c({}), f)).toBe(false);
    expect(findingsReady(c({ fixedAt: at(0) }), f)).toBe(true);
  });
  it("the copy stays draft until signed", () => expect(CONTROLS_COPY.status).toBe("draft"));
});
