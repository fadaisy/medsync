/**
 * Prescribing from the Plan (ADRs 0186, 0188): regimen resolution by band and weight, blank weight,
 * the checks, the answer requirement (override versus check), and edits against the regimen.
 */
import type { PlanCheckContext } from "@/lib/prescribing/plan-checks";
import type { PlanRx } from "@/lib/prescribing/plan-rx";
import { describe, expect, it } from "vitest";

import { drugById, patientBand, resolveRegimens } from "@/lib/prescribing/formulary";
import { needingAnswer, planChecks, verifyAnswers } from "@/lib/prescribing/plan-checks";
import { fluidRate, regimenEdits, willRead } from "@/lib/prescribing/plan-rx";

const W = (kg: number) => ({ kg, at: "2026-09-28T20:10:00Z", source: "triage" });

const baseCtx: PlanCheckContext = {
  ageYears: 40,
  weight: W(58),
  allergies: [],
  allergyStatus: "none_known",
  conditions: [],
  creatinine: null,
  kidneyTestPlanned: false,
  glucose: null,
  sepsisTypeProblem: false,
  bloodCulture: "none",
  others: [],
  cosign: "allowed",
  pharmacy: { status: "not_linked" },
};

const rx = (over: Partial<PlanRx>): PlanRx => ({
  clientKey: "plan-rx-0001",
  kind: "drug",
  drugId: "ceftriaxone",
  conditionId: "00000000-0000-4000-8000-000000000001",
  regimenId: null,
  doseNum: 2,
  unit: "g",
  strength: null,
  route: "iv",
  method: "Intermittent infusion",
  infusionOver: "30 min",
  diluent: "Sodium chloride 0.9%",
  frequency: "daily",
  prn: false,
  course: "5d",
  start: "now",
  note: null,
  fluid: null,
  answers: [],
  witness: null,
  weightAt: null,
  typedDose: null,
  ...over,
});

describe("regimen resolution", () => {
  const glucose = drugById("glucose_10")!;
  const glucagon = drugById("glucagon")!;

  it("bands: child under 16, older adult from 65", () => {
    expect([
      patientBand(null),
      patientBand(15),
      patientBand(16),
      patientBand(64),
      patientBand(65),
    ]).toEqual([null, "child", "adult", "adult", "olderAdult"]);
  });

  it("child glucose is 2 mL/kg of 10% from the vitals weight: 20 kg → 40 mL", () => {
    const r = resolveRegimens(glucose, { ageYears: 6, weight: W(20) });
    expect(r.band).toBe("child");
    expect(r.regimens).toHaveLength(1);
    expect(r.regimens[0]!.dose).toEqual({ num: 40, unit: "mL" });
    expect(r.regimens[0]!.working).toBe("2 mL/kg × 20 kg = 40 mL of 10%");
  });

  it("blank weight means no arithmetic: the dose stays empty and says why", () => {
    const r = resolveRegimens(glucose, { ageYears: 6, weight: null });
    expect(r.regimens[0]!.dose.num).toBeNull();
    expect(r.regimens[0]!.working).toBeNull();
    expect(r.regimens[0]!.unresolved).toMatch(/no weight in the vitals/);
  });

  it("adult glucose is the signed 150 mL of 10%; an older adult gets the adult row, said so", () => {
    expect(resolveRegimens(glucose, { ageYears: 40, weight: null }).regimens[0]!.dose).toEqual({
      num: 150,
      unit: "mL",
    });
    const old = resolveRegimens(glucose, { ageYears: 80, weight: null });
    expect(old.band).toBe("olderAdult");
    expect(old.regimens[0]!.regimen.band).toBe("adult");
    expect(old.note).toMatch(/no separate older-adult dose/);
  });

  it("child glucagon: <8 yr or <25 kg → 500 µg; otherwise 1 mg", () => {
    const pick = (ageYears: number | null, kg: number | null) =>
      resolveRegimens(glucagon, { ageYears, weight: kg == null ? null : W(kg) })
        .regimens.filter((r) => r.applies)
        .map((r) => `${r.dose.num} ${r.dose.unit}`);
    expect(pick(5, 18)).toEqual(["500 µg"]);
    expect(pick(10, 30)).toEqual(["1 mg"]);
    expect(pick(10, 22)).toEqual(["500 µg"]); // older but under 25 kg
    expect(pick(6, 27)).toEqual(["500 µg"]); // over 25 kg but under 8
    expect(pick(10, null)).toEqual(["1 mg"]);
  });

  it("a drug with no signed regimen says so", () => {
    const r = resolveRegimens(drugById("ceftriaxone")!, { ageYears: 40, weight: W(58) });
    expect(r.regimens).toEqual([]);
    expect(r.note).toBe("No verified regimen yet: type the dose.");
  });

  it("the crystalloid bolus is a range, per kg in a child: 10–20 mL/kg × 20 kg = 200–400 mL", () => {
    const rl = drugById("ringers_lactate")!;
    expect(resolveRegimens(rl, { ageYears: 40, weight: null }).regimens[0]!.dose).toEqual({
      num: null,
      low: 250,
      high: 500,
      unit: "mL",
    });
    const child = resolveRegimens(rl, { ageYears: 6, weight: W(20) }).regimens[0]!;
    expect(child.dose).toEqual({ num: null, low: 200, high: 400, unit: "mL" });
    expect(child.working).toBe("10–20 mL/kg × 20 kg = 200–400 mL");
  });
});

describe("edits against the regimen", () => {
  const glucose = drugById("glucose_10")!;
  const adult = resolveRegimens(glucose, { ageYears: 40, weight: null }).regimens[0]!;
  const fromRegimen = rx({
    drugId: "glucose_10",
    regimenId: adult.regimen.id,
    doseNum: 150,
    unit: "mL",
    strength: "10%",
    method: null,
    infusionOver: null,
    diluent: null,
    frequency: "stat",
    course: null,
  });

  it("an unchanged regimen records no edit", () => {
    expect(regimenEdits(fromRegimen, adult)).toEqual([]);
  });

  it("a changed dose is recorded from → to", () => {
    expect(regimenEdits({ ...fromRegimen, doseNum: 200 }, adult)).toEqual([
      { field: "dose", from: "150 mL", to: "200 mL" },
    ]);
  });

  it("a bolus inside the signed range is a choice; outside it is an edit", () => {
    const rl = drugById("ringers_lactate")!;
    const bolus = resolveRegimens(rl, { ageYears: 40, weight: null }).regimens[0]!;
    const f = (volumeMl: number) =>
      rx({
        kind: "fluid",
        drugId: "ringers_lactate",
        regimenId: bolus.regimen.id,
        doseNum: volumeMl,
        unit: "mL",
        method: null,
        infusionOver: null,
        diluent: null,
        frequency: "stat",
        course: null,
        fluid: {
          purpose: "bolus",
          volumeMl,
          overMinutes: 15,
          delivery: "pump",
          dropsPerMl: null,
          warmed: false,
        },
      });
    expect(regimenEdits(f(500), bolus)).toEqual([]);
    expect(regimenEdits(f(1000), bolus)).toEqual([
      { field: "dose", from: "250–500 mL", to: "1000 mL" },
    ]);
  });
});

describe("the checks", () => {
  const ceftriaxone = drugById("ceftriaxone")!;

  it("allergy: a recorded group matches by class or group, never by the notes", () => {
    const stop = planChecks(ceftriaxone, rx({}), {
      ...baseCtx,
      allergyStatus: "has_allergies",
      allergies: [{ substance: "Cephalosporins" }],
    });
    expect(stop[0]).toMatchObject({
      code: "allergy",
      outcome: "stop",
      overrideable: true,
      proposed: true,
    });
    const clear = planChecks(ceftriaxone, rx({}), {
      ...baseCtx,
      allergyStatus: "has_allergies",
      allergies: [{ substance: "Sulfonamide" }],
    });
    const a = clear.find((c) => c.code === "allergy")!;
    expect(a.outcome).toBe("passed");
    expect(a.message).toMatch(/Cross-reactivity between beta-lactams is not checked/);
  });

  it("kidney function: no creatinine says whether a U&E is in the plan", () => {
    const ceftazidime = drugById("ceftazidime")!;
    const k = (planned: boolean) =>
      planChecks(ceftazidime, rx({ drugId: "ceftazidime" }), {
        ...baseCtx,
        kidneyTestPlanned: planned,
      }).find((c) => c.code === "kidney")!;
    expect(ceftazidime.flags.renal).toBe(true);
    expect(planChecks(ceftriaxone, rx({}), baseCtx).find((c) => c.code === "kidney")!.outcome).toBe(
      "not_applicable",
    );
    expect(k(false)).toMatchObject({
      outcome: "check",
      message: "No creatinine on the record and no U&E in the plan.",
    });
    expect(k(true).message).toBe("No creatinine resulted yet: U&E is in the plan, not resulted.");
  });

  it("cultures before antibiotics: none, ordered, collected", () => {
    const c = (bloodCulture: PlanCheckContext["bloodCulture"]) =>
      planChecks(ceftriaxone, rx({}), { ...baseCtx, sepsisTypeProblem: true, bloodCulture }).find(
        (x) => x.code === "cultures",
      )!;
    expect(c("none").outcome).toBe("check");
    expect(c("ordered").message).toBe("Blood culture ordered, not yet collected.");
    expect(c("collected").outcome).toBe("passed");
    const noSepsis = planChecks(ceftriaxone, rx({}), baseCtx).find((x) => x.code === "cultures")!;
    expect(noSepsis.outcome).toBe("not_applicable");
  });

  it("co-sign: a note when required; blocked refuses", () => {
    const cs = planChecks(ceftriaxone, rx({}), { ...baseCtx, cosign: "cosign_required" }).find(
      (c) => c.code === "cosign",
    )!;
    expect(cs).toMatchObject({
      outcome: "note",
      message: "A senior co-signs this before it is given.",
    });
    const blocked = planChecks(ceftriaxone, rx({}), { ...baseCtx, cosign: "blocked" });
    expect(verifyAnswers(blocked, rx({})).ok).toBe(false);
  });

  it("stock: not linked is not checked; out of stock is a check", () => {
    const s = (status: "not_linked" | "out") =>
      planChecks(ceftriaxone, rx({}), { ...baseCtx, pharmacy: { status } }).find(
        (c) => c.code === "stock",
      )!;
    expect(s("not_linked")).toMatchObject({
      outcome: "not_checked",
      message: "Pharmacy not linked yet.",
    });
    expect(s("out").outcome).toBe("check");
  });

  it("interactions are always not checked, and say why", () => {
    const i = planChecks(ceftriaxone, rx({}), baseCtx).find((c) => c.code === "interactions")!;
    expect(i.outcome).toBe("not_checked");
  });

  it("IV glucose when the latest glucose is above 4.0 asks for an answer", () => {
    const g = planChecks(
      drugById("glucose_10")!,
      rx({ drugId: "glucose_10", unit: "mL", doseNum: 150 }),
      {
        ...baseCtx,
        glucose: { value: 6.2, at: "2026-09-28T20:00:00Z" },
      },
    ).find((c) => c.code === "indication")!;
    expect(g.outcome).toBe("check");
  });

  it("a child with no weight: the signed engine's weight rule refuses (never the adult dose)", () => {
    const checks = planChecks(
      drugById("glucagon")!,
      rx({ drugId: "glucagon", unit: "mg", doseNum: 1, route: "im" }),
      {
        ...baseCtx,
        ageYears: 6,
        weight: null,
      },
    );
    expect(checks.find((c) => c.code === "child")).toMatchObject({
      outcome: "stop",
      overrideable: false,
    });
  });

  it("a stop needs an override reason; a check needs an answer; Other needs words", () => {
    const checks = planChecks(drugById("ceftazidime")!, rx({ drugId: "ceftazidime" }), {
      ...baseCtx,
      allergyStatus: "has_allergies",
      allergies: [{ substance: "ceftazidime" }],
    });
    const needed = needingAnswer(checks).map((c) => c.code);
    expect(needed).toContain("allergy");
    expect(needed).toContain("kidney");
    expect(verifyAnswers(checks, rx({})).ok).toBe(false);
    const other = rx({
      answers: [
        { code: "allergy", answer: "other" },
        { code: "kidney", answer: "result_awaited" },
      ],
    });
    expect(verifyAnswers(checks, other).reason).toMatch(/Write your reason/);
    const ok = verifyAnswers(
      checks,
      rx({
        answers: [
          { code: "allergy", answer: "not_allergic" },
          { code: "kidney", answer: "result_awaited" },
        ],
      }),
    );
    expect(ok.ok).toBe(true);
    expect(ok.reasonText).toBe(
      "Override allergy: Previous reaction was not allergic; Check kidney function: Result awaited; will review",
    );
  });

  it("a controlled drug needs a witness", () => {
    const morphine = drugById("morphine")!;
    expect(morphine.flags.controlled).toBe(true);
    const r = rx({ drugId: "morphine", unit: "mg", doseNum: 5, route: morphine.routes[0]! });
    const checks = planChecks(morphine, r, baseCtx);
    const answers = needingAnswer(checks).map((c) => ({
      code: c.code,
      answer: "aware_monitor" as const,
    }));
    expect(verifyAnswers(checks, { ...r, answers }).reason).toBe(
      "Record a witness for the controlled drug.",
    );
    expect(verifyAnswers(checks, { ...r, answers, witness: "Nurse A. K." }).ok).toBe(true);
  });
});

describe("the will-read line and fluid rate", () => {
  it("a drug", () => {
    expect(willRead(rx({}), drugById("ceftriaxone")!)).toBe(
      "Ceftriaxone 2 g IV, intermittent infusion over 30 min in Sodium chloride 0.9%, Once daily, 5 days, give now",
    );
  });

  it("a maintenance fluid on a 20-drop gravity set: 1000 mL over 8 h = 125 mL/h, 42 drops/min", () => {
    const f = {
      purpose: "maintenance" as const,
      volumeMl: 1000,
      overMinutes: 480,
      delivery: "gravity" as const,
      dropsPerMl: 20 as const,
      warmed: false,
    };
    expect(fluidRate(f)).toEqual({ mlPerHour: 125, dropsPerMinute: 42 });
    expect(
      willRead(
        rx({ kind: "fluid", drugId: "ringers_lactate", fluid: f }),
        drugById("ringers_lactate")!,
      ),
    ).toBe(
      "Ringer's lactate (compound sodium lactate) 1000 mL IV over 8 h (125 mL/h), maintenance, gravity drip, 20-drop set (42 drops/min)",
    );
  });
});
