import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { TimelineDrugEvent } from "@/lib/pharmacy/emergency-doses";
import type { ViewLineInput } from "@/lib/pharmacy/prescription-view";
import { describe, expect, it } from "vitest";

import { anythingNotDone, pharmacyChecksState } from "@/lib/pharmacy/check-state";
import { answeredChecks, CHECK_TITLE } from "@/lib/pharmacy/checks";
import { computeDoses, NO_CART, toDoseRow } from "@/lib/pharmacy/emergency-doses";
import { PHARMACY_NAV, pharmacyNavFor } from "@/lib/pharmacy/nav";
import { buildPrescriptionView } from "@/lib/pharmacy/prescription-view";
import { DRUGS, offersRegimens } from "@/lib/prescribing/formulary";

/** Pharmacy Phase 0 — the read model, check state, emergency doses and navigation (RV, CS, ED, NV-P). */
const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const T0 = new Date("2026-10-10T06:52:07.413Z");
const viewLine = (o: Partial<ViewLineInput> = {}): ViewLineInput => ({
  id: "l1",
  placementLine: null,
  kind: "drug",
  drugName: "Fixture medicine A",
  concentration: null,
  dose: "fixture dose",
  route: "oral",
  frequency: null,
  duration: null,
  quantity: null,
  method: null,
  infusionOver: null,
  diluent: null,
  prn: false,
  fluidPurpose: null,
  volumeMl: null,
  overMinutes: null,
  instructions: null,
  indication: "Fixture problem",
  conditionId: "c1",
  regimenId: null,
  edits: [],
  controlled: false,
  state: "active",
  cosign: null,
  checkAnswers: [],
  confirmedFlags: [],
  reasons: null,
  createdAt: T0,
  updatedAt: T0,
  ...o,
});

describe("RV: the read-only prescription", () => {
  it("RV-2: text passes through byte for byte", () => {
    const awkward = { dose: "1/2 tab ", frequency: "0,5 mg  bd", duration: "5mg/kg (max 500mg)" };
    const v = buildPrescriptionView({
      lines: [viewLine(awkward)],
      encounter: undefined,
      prescriberCadre: null,
    });
    expect(v.lines[0]!.input.dose).toBe("1/2 tab ");
    expect(v.lines[0]!.input.frequency).toBe("0,5 mg  bd");
    expect(v.lines[0]!.input.duration).toBe("5mg/kg (max 500mg)");
  });

  it("RV-4: the indication is shown as stored, restricted or not", () => {
    const v = buildPrescriptionView({
      lines: [viewLine({ indication: "Fixture restricted problem" })],
      encounter: undefined,
      prescriberCadre: null,
    });
    expect(v.lines[0]!.input.indication).toBe("Fixture restricted problem");
  });

  it("RV-5: only stored answers; the override block names the stops overridden", () => {
    const v = buildPrescriptionView({
      lines: [
        viewLine({
          checkAnswers: [
            { code: "allergy", answer: "senior_agreed", outcome: "stop" },
            { code: "cultures", answer: "aware_monitor", outcome: "check" },
          ],
          reasons:
            "Override allergy: Senior reviewed and agreed; Check cultures before antibiotics: Aware; will monitor",
        }),
        viewLine({ id: "l2" }),
      ],
      encounter: undefined,
      prescriberCadre: "Medical officer",
    });
    expect(v.lines[0]!.overriddenStops).toEqual(["Allergy"]);
    expect(v.lines[0]!.checks.map((c) => [c.title, c.level, c.answer])).toEqual([
      ["Allergy", "stop", "Senior reviewed and agreed"],
      ["Cultures before antibiotics", "check", "Aware; will monitor"],
    ]);
    expect(v.lines[1]!.checks).toEqual([]);
  });

  it("dose source: signed regimen, typed, or not said for an EMR-sheet line", () => {
    const v = buildPrescriptionView({
      lines: [
        viewLine({ id: "a", regimenId: "r1" }),
        viewLine({ id: "b", regimenId: null }),
        viewLine({ id: "c", conditionId: null }),
      ],
      encounter: undefined,
      prescriberCadre: null,
    });
    expect(v.lines.map((l) => l.doseSource)).toEqual(["regimen", "typed", null]);
  });

  it("co-sign: awaiting, signed by the senior's cadre, and who cancelled a returned line", () => {
    const at = new Date(T0.getTime() + 600_000);
    const awaiting = buildPrescriptionView({
      lines: [
        viewLine({ cosign: { state: "pending_review", reviewedAt: null, reviewerCadre: null } }),
      ],
      encounter: undefined,
      prescriberCadre: null,
    });
    expect(awaiting.cosign).toEqual({ kind: "awaiting" });
    expect(awaiting.state).toBe("awaiting_cosign");
    const returned = buildPrescriptionView({
      lines: [
        viewLine({
          state: "cancelled",
          updatedAt: at,
          cosign: { state: "returned", reviewedAt: at, reviewerCadre: "Senior consultant" },
        }),
      ],
      encounter: undefined,
      prescriberCadre: null,
    });
    expect(returned.lines[0]).toMatchObject({
      state: "cancelled",
      stateAt: at,
      stateByCadre: "Senior consultant",
    });
    const signed = buildPrescriptionView({
      lines: [
        viewLine({ cosign: { state: "approved", reviewedAt: at, reviewerCadre: "Consultant" } }),
      ],
      encounter: undefined,
      prescriberCadre: null,
    });
    expect(signed.cosign).toEqual({ kind: "signed", cadre: "Consultant", at });
  });

  it("every Plan check code has a title in the prescriber's words", () => {
    const src = read("lib/prescribing/plan-checks.ts");
    const union = src.slice(
      src.indexOf("export type PlanCheckCode"),
      src.indexOf(";", src.indexOf("export type PlanCheckCode")),
    );
    const codes = [...union.matchAll(/"([a-z_]+)"/g)].map((m) => m[1]!);
    expect(codes.length).toBeGreaterThan(10);
    for (const c of codes) expect(CHECK_TITLE[c], c).toBeTruthy();
    expect(
      answeredChecks({ checkAnswers: [{ code: "unknown_code" }], confirmedFlags: [] })[0]!.title,
    ).toBe("unknown_code");
  });
});

describe("CS: what the pharmacy is not doing", () => {
  it("CS-1, CS-2: dispensing and interactions are not done; the function says so", () => {
    const s = pharmacyChecksState("h1");
    expect(s.dispensingRecorded).toBe(false);
    expect(s.interactionsChecked).toBe(false);
    expect(anythingNotDone(s)).toBe(true);
  });

  it("CS-3: the counts come from the shipped list at run time, never typed", () => {
    const s = pharmacyChecksState("h1");
    expect(s.doseReferences).toEqual({
      signed: DRUGS.filter((d) => offersRegimens(d.dose)).length,
      total: DRUGS.length,
    });
    expect(s.doseReferences!.signed).toBeGreaterThan(0);
    expect(s.doseReferences!.signed).toBeLessThan(s.doseReferences!.total);
    // No count is written into the source.
    expect(read("lib/pharmacy/check-state.ts")).not.toMatch(/(signed|total):\s*\d/);
  });

  it("CS-4: the notice would show if any one part were not done", () => {
    expect(
      anythingNotDone({
        dispensingRecorded: true,
        interactionsChecked: true,
        doseReferences: { signed: 3, total: 4 },
      }),
    ).toBe(true);
    expect(
      anythingNotDone({
        dispensingRecorded: true,
        interactionsChecked: true,
        doseReferences: { signed: 4, total: 4 },
      }),
    ).toBe(false);
  });
});

describe("ED: emergency doses from the resus timeline", () => {
  const T = (min: number) => new Date(T0.getTime() + min * 60_000);
  const ev = (o: Partial<TimelineDrugEvent> = {}): TimelineDrugEvent => ({
    id: "ev1",
    episodeId: "ep1",
    recordedAt: T0,
    recordedByUserId: "u-giver",
    payload: {
      prescribing: {
        drugName: "Fixture medicine C",
        dose: "fixture amount ",
        route: "IV",
        cart: "Fixture cart 1",
        giverUserId: "u-giver",
        controlled: false,
      },
    },
    supersedesEventId: null,
    ...o,
  });
  const patientOf = new Map([
    ["ep1", "p1"],
    ["ep2", null],
  ]);

  it("ED-2: the amount and the cart are the stored text; no cart is 'No cart'", () => {
    const r = toDoseRow(ev(), patientOf)!;
    expect(r).toMatchObject({
      medicine: "Fixture medicine C",
      dose: "fixture amount ",
      cart: "Fixture cart 1",
    });
    const noCart = toDoseRow(
      ev({ payload: { prescribing: { drugName: "X", dose: "y" } } }),
      patientOf,
    )!;
    expect(noCart.cart).toBeNull();
  });

  it("ED-3: an unidentified patient", () => {
    expect(toDoseRow(ev({ episodeId: "ep2" }), patientOf)!.patientUserId).toBeNull();
  });

  it("a controlled dose names its witness by user, or says a name was typed; never the name", () => {
    const user = toDoseRow(
      ev({ payload: { prescribing: { drugName: "X", controlled: true, witnessUserId: "u-w" } } }),
      patientOf,
    )!;
    expect(user.witness).toEqual({ userId: "u-w" });
    const typed = toDoseRow(
      ev({
        payload: { prescribing: { drugName: "X", controlled: true, witnessName: "Fixture Name" } },
      }),
      patientOf,
    )!;
    expect(typed.witness).toBe("typed");
    expect(JSON.stringify(typed)).not.toContain("Fixture Name");
  });

  it("a protocol dose counts once performed", () => {
    expect(
      toDoseRow(ev({ payload: { label: "Fixture protocol dose", state: "performed" } }), patientOf)!
        .medicine,
    ).toBe("Fixture protocol dose");
    expect(
      toDoseRow(ev({ payload: { label: "Fixture protocol dose", state: "indicated" } }), patientOf),
    ).toBeNull();
  });

  it("ED-1: newest first; a corrected event is replaced by its correction", () => {
    const r = computeDoses({
      events: [
        ev({ id: "a", recordedAt: T(1) }),
        ev({ id: "b", recordedAt: T(5) }),
        ev({ id: "c", recordedAt: T(6), supersedesEventId: "a" }),
      ],
      patientOf,
      cart: "all",
    });
    expect(r.rows.map((x) => x.id)).toEqual(["c", "b"]);
  });

  it("ED-4: property — cart counts sum to the total, and each cart tab holds its count", () => {
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31;
    for (let i = 0; i < 300; i++) {
      const events = Array.from({ length: Math.floor(rnd() * 30) }, (_, k) =>
        ev({
          id: `e${k}`,
          recordedAt: T(Math.floor(rnd() * 900)),
          payload:
            rnd() < 0.2
              ? { label: "P", state: rnd() < 0.5 ? "performed" : "indicated" }
              : {
                  prescribing: {
                    drugName: "X",
                    cart: [null, "Cart 1", "Cart 2"][Math.floor(rnd() * 3)],
                  },
                },
        }),
      );
      const all = computeDoses({ events, patientOf, cart: "all" });
      expect([...all.cartCounts.values()].reduce((a, b) => a + b, 0)).toBe(all.total);
      for (const [cart, count] of all.cartCounts)
        expect(computeDoses({ events, patientOf, cart }).rows).toHaveLength(count);
      expect(all.cartCounts.has("")).toBe(false);
      void NO_CART;
    }
  });

  it("ED-5: no stock figure is read", () => {
    const src = read("lib/pharmacy/emergency-doses.ts") + read("lib/pharmacy/read.ts");
    expect(src).not.toMatch(/on_hand|onHand|par_level|parLevel|crashCartStock|crash_cart_stock/);
  });
});

describe("NV-P1: navigation", () => {
  it("with the Phase 1 flags off: two items, nothing else, both behind pharmacy.view", () => {
    expect(pharmacyNavFor(new Set(["pharmacy.view"])).map((i) => i.label)).toEqual([
      "Queue",
      "Emergency doses",
    ]);
    expect(pharmacyNavFor(new Set())).toHaveLength(0);
  });

  it("Phase 1 (5.1): the full order, each item behind its flag", () => {
    expect(PHARMACY_NAV.map((i) => i.label)).toEqual([
      "Queue",
      "Open lines",
      "Supplied today",
      "Stock",
      "Controlled drugs",
      "Downtime entry",
      "Emergency doses",
    ]);
    const view = new Set(["pharmacy.view"] as const);
    expect(pharmacyNavFor(view, { dispensing: true, downtime: false })).toHaveLength(6);
    // Downtime entry needs pharmacy.dispense as well as its flag.
    expect(pharmacyNavFor(view, { dispensing: false, downtime: true })).toHaveLength(2);
    expect(
      pharmacyNavFor(new Set(["pharmacy.view", "pharmacy.dispense"] as const), {
        dispensing: false,
        downtime: true,
      }),
    ).toHaveLength(3);
  });
});

describe("Law 2: no clinical write from the pharmacy's code", () => {
  // Phase 0 asserted the view log was the only write. Phase 1 records its own events (ADR 0260), so
  // the invariant is now the law itself: the pharmacy writes only its own tables and the audit log,
  // never a prescription or any other clinical record.
  it("lib/pharmacy writes only pharmacy tables, downtime and paper records, and the audit log", () => {
    const files = (
      readdirSync(resolve(process.cwd(), "lib/pharmacy"), { recursive: true }) as string[]
    ).filter((f) => f.endsWith(".ts"));
    const writes: string[] = [];
    for (const f of files) {
      const src = read(`lib/pharmacy/${f}`);
      for (const m of src.matchAll(/\.(insert|update|delete)\(([a-zA-Z]+)\)/g))
        writes.push(`${f}: ${m[1]} ${m[2]}`);
    }
    const foreign = writes.filter(
      (w) => !/ (pharmacy[A-Z]\w*|paper\w*|downtime\w*|auditLog)$/.test(w),
    );
    expect(foreign).toEqual([]);
    expect(writes.some((w) => / (prescriptions|prescriptionCancellations)$/.test(w))).toBe(false);
  });
});
