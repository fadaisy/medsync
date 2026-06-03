import type { PrescribePatient } from "@/lib/prescribing/engine";
import { describe, expect, it } from "vitest";

import {
  prescriptionRequiresOverride,
  resolvePrescriptionOptions,
  runSafetyChecks,
} from "@/lib/prescribing/engine";
import { getEmergencyDrug } from "@/lib/prescribing/reference/emergency-drug-catalog";

/**
 * Smart-prescribing engine (GATE B) — PURE + deterministic safety checks.
 * Decision-support: it surfaces allergy / concentration / weight-age /
 * max-cumulative / contraindication / controlled-drug flags; the clinician
 * confirms (override-with-reason is recorded). It never auto-administers.
 */

const adult: PrescribePatient = { ageYears: 40, weightKg: 70, allergies: [], conditions: [] };
const child: PrescribePatient = { ageYears: 5, weightKg: null, allergies: [], conditions: [] };

function flagCodes(drugId: string, patient: PrescribePatient, priors = []) {
  const drug = getEmergencyDrug(drugId)!;
  return runSafetyChecks({ drug, patient, priorAdministrations: priors }).map((f) => f.code);
}

describe("allergy check", () => {
  it("flags (block) when a patient allergy matches the drug", () => {
    const drug = getEmergencyDrug("adrenaline_anaphylaxis_im")!;
    const flags = runSafetyChecks({
      drug,
      patient: { ...adult, allergies: ["adrenaline"] },
      priorAdministrations: [],
    });
    const allergy = flags.find((f) => f.code === "allergy");
    expect(allergy).toBeTruthy();
    expect(allergy!.severity).toBe("block");
  });
  it("does not flag an allergy that doesn't match", () => {
    expect(flagCodes("salbutamol_neb", { ...adult, allergies: ["penicillin"] })).not.toContain(
      "allergy",
    );
  });
});

describe("concentration / adrenaline look-alike guard", () => {
  it("surfaces the look-alike guard for a drug with concentration variants (adrenaline)", () => {
    const flags = flagCodes("adrenaline_anaphylaxis_im", adult);
    expect(flags).toContain("concentration");
  });
  it("the arrest adrenaline also surfaces the guard (1:10 000 vs 1:1000)", () => {
    expect(flagCodes("adrenaline_arrest_iv", adult)).toContain("concentration");
  });
  it("a drug with a single presentation does not raise a concentration guard", () => {
    expect(flagCodes("salbutamol_neb", adult)).not.toContain("concentration");
  });
});

describe("paediatric weight/age routing", () => {
  it("blocks a weight-based paediatric dose when weight is missing (never an adult flat dose)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("adrenaline_arrest_iv")!,
      patient: child,
      priorAdministrations: [],
    });
    const wm = flags.find((f) => f.code === "weight_missing");
    expect(wm).toBeTruthy();
    expect(wm!.severity).toBe("block");
  });
  it("with a weight, surfaces paediatric routing (warn) instead of blocking", () => {
    const flags = flagCodes("adrenaline_arrest_iv", { ...child, weightKg: 18 });
    expect(flags).toContain("paediatric_routing");
    expect(flags).not.toContain("weight_missing");
  });
  it("an adult patient raises no paediatric flags", () => {
    const flags = flagCodes("adrenaline_arrest_iv", adult);
    expect(flags).not.toContain("paediatric_routing");
    expect(flags).not.toContain("weight_missing");
  });
});

describe("max / cumulative dose", () => {
  it("blocks when cumulative exceeds the cap (atropine 3 mg)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("atropine_bradycardia_iv")!,
      patient: adult,
      priorAdministrations: [{ drugKey: "atropine", amountMg: 3 }],
    });
    const m = flags.find((f) => f.code === "max_cumulative");
    expect(m).toBeTruthy();
    expect(m!.severity).toBe("block");
  });
  it("does not block below the cap", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("atropine_bradycardia_iv")!,
      patient: adult,
      priorAdministrations: [{ drugKey: "atropine", amountMg: 1 }],
    });
    expect(flags.find((f) => f.code === "max_cumulative")?.severity).not.toBe("block");
  });
});

describe("max / cumulative — dose-count cap (benzodiazepines, NICE NG217 2-dose limit)", () => {
  it("blocks a 3rd benzodiazepine dose across agents (shared drugKey)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("midazolam_seizure_buccal")!,
      patient: adult,
      priorAdministrations: [
        { drugKey: "benzodiazepine_seizure", amountMg: 4 },
        { drugKey: "benzodiazepine_seizure", amountMg: 4 },
      ],
    });
    expect(flags.find((f) => f.code === "max_cumulative")?.severity).toBe("block");
  });
  it("the 2nd benzodiazepine dose is the ceiling (warn, not block)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("lorazepam_seizure_iv")!,
      patient: adult,
      priorAdministrations: [{ drugKey: "benzodiazepine_seizure", amountMg: 4 }],
    });
    expect(flags.find((f) => f.code === "max_cumulative")?.severity).not.toBe("block");
  });
});

describe("allergy check — brand names", () => {
  it("matches a brand-name allergy against the generic (Ventolin → salbutamol)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("salbutamol_neb")!,
      patient: { ...adult, allergies: ["Ventolin"] },
      priorAdministrations: [],
    });
    expect(flags.some((f) => f.code === "allergy")).toBe(true);
  });
});

describe("contraindication check", () => {
  it("flags adenosine in a patient with asthma", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("adenosine_svt_iv")!,
      patient: { ...adult, conditions: ["asthma"] },
      priorAdministrations: [],
    });
    expect(flags.some((f) => f.code === "contraindication")).toBe(true);
  });
  it("no contraindication flag without a matching condition", () => {
    expect(flagCodes("adenosine_svt_iv", adult)).not.toContain("contraindication");
  });
  it("'severe asthma' blocks adenosine but NOT lidocaine (no spurious first-token match)", () => {
    const aden = runSafetyChecks({
      drug: getEmergencyDrug("adenosine_svt_iv")!,
      patient: { ...adult, conditions: ["severe asthma"] },
      priorAdministrations: [],
    });
    expect(aden.some((f) => f.code === "contraindication")).toBe(true);
    const lido = runSafetyChecks({
      drug: getEmergencyDrug("lidocaine_arrest_iv")!,
      patient: { ...adult, conditions: ["severe asthma"] },
      priorAdministrations: [],
    });
    expect(lido.some((f) => f.code === "contraindication")).toBe(false);
  });
  it("'complete heart block' blocks adenosine (catches the AV-block contraindication)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("adenosine_svt_iv")!,
      patient: { ...adult, conditions: ["complete heart block"] },
      priorAdministrations: [],
    });
    expect(flags.some((f) => f.code === "contraindication")).toBe(true);
  });
});

describe("controlled-drug capture", () => {
  it("flags a controlled drug for stricter (witnessed) capture", () => {
    expect(flagCodes("lorazepam_seizure_iv", adult)).toContain("controlled");
  });
  it("a non-controlled drug raises no controlled flag", () => {
    expect(flagCodes("salbutamol_neb", adult)).not.toContain("controlled");
  });
});

describe("prescriptionRequiresOverride", () => {
  it("is true when any block flag is present", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("adrenaline_anaphylaxis_im")!,
      patient: { ...adult, allergies: ["adrenaline"] },
      priorAdministrations: [],
    });
    expect(prescriptionRequiresOverride(flags)).toBe(true);
  });
  it("is false when only warn/info flags are present", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("salbutamol_neb")!,
      patient: adult,
      priorAdministrations: [],
    });
    expect(prescriptionRequiresOverride(flags)).toBe(false);
  });
});

describe("resolvePrescriptionOptions — the smart link", () => {
  it("a steroid recommendation resolves to BOTH options (hydrocortisone IV / prednisolone PO)", () => {
    const opts = resolvePrescriptionOptions("b_asthma_steroid", adult);
    const ids = opts.map((o) => o.drug.id);
    expect(ids).toContain("hydrocortisone_iv");
    expect(ids).toContain("prednisolone_po");
  });
  it("each resolved option carries its own pre-computed safety flags", () => {
    const opts = resolvePrescriptionOptions("b_anaphylaxis_adrenaline", {
      ...adult,
      allergies: ["adrenaline"],
    });
    expect(opts).toHaveLength(1);
    expect(opts[0]!.flags.some((f) => f.code === "allergy")).toBe(true);
  });
  it("an unmapped recommendation resolves to no options", () => {
    expect(resolvePrescriptionOptions("nonexistent_code", adult)).toEqual([]);
  });
});

/* ─── ADDENDUM: editable parameters — safety re-runs on every edit ─────── */

describe("editable dose — out-of-range guard (editing is NOT a bypass)", () => {
  it("a legitimate adjustment (hydrocortisone 100 → 50 mg, renal) raises NO dose_range flag", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("hydrocortisone_iv")!,
      patient: adult,
      priorAdministrations: [],
      edit: { doseMg: 50 },
    });
    expect(flags.some((f) => f.code === "dose_range")).toBe(false);
  });
  it("a clearly out-of-range edit (hydrocortisone 100 → 400 mg) → block (override-with-reason)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("hydrocortisone_iv")!,
      patient: adult,
      priorAdministrations: [],
      edit: { doseMg: 400 },
    });
    const f = flags.find((x) => x.code === "dose_range");
    expect(f?.severity).toBe("block");
  });
  it("an egregious edit (atropine 0.5 → 10 mg) → block + egregious (typed confirm)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("atropine_bradycardia_iv")!,
      patient: adult,
      priorAdministrations: [],
      edit: { doseMg: 10 },
    });
    const f = flags.find((x) => x.code === "dose_range");
    expect(f?.severity).toBe("block");
    expect(f?.egregious).toBe(true);
    expect(prescriptionRequiresOverride(flags)).toBe(true);
  });
});

describe("editable dose — the edited value (not the default) drives the cumulative check", () => {
  it("atropine prior 2.5 mg + an EDITED 1 mg dose → cumulative block (3.5 > 3 mg)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("atropine_bradycardia_iv")!,
      patient: adult,
      priorAdministrations: [{ drugKey: "atropine", amountMg: 2.5 }],
      edit: { doseMg: 1 },
    });
    expect(flags.find((f) => f.code === "max_cumulative")?.severity).toBe("block");
  });
});

describe("editable route — concentration/route correctness re-validated on edit", () => {
  it("editing to a route not listed for the presentation raises a concentration check", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("salbutamol_neb")!, // route: ["nebulised"]
      patient: adult,
      priorAdministrations: [],
      edit: { route: "iv" },
    });
    expect(flags.some((f) => f.code === "concentration")).toBe(true);
  });
});

/* ─── editable-params review fixes (NaN / low-egregious / free-text gap) ── */

describe("editable dose — review fixes", () => {
  it("a non-finite (NaN) edited dose is BLOCKED, not silently skipped (must-fix #1)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("hydrocortisone_iv")!,
      patient: adult,
      priorAdministrations: [],
      edit: { doseMg: Number("abc") }, // NaN
    });
    const f = flags.find((x) => x.code === "dose_range");
    expect(f?.severity).toBe("block");
  });
  it("a far-LOW edited dose is egregious too (atropine 0.5 → 0.05 mg)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("atropine_bradycardia_iv")!,
      patient: adult,
      priorAdministrations: [],
      edit: { doseMg: 0.05 },
    });
    expect(flags.find((x) => x.code === "dose_range")?.egregious).toBe(true);
  });
  it("a numerically edited dose nudges a concentration re-check (should-fix #4)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("hydrocortisone_iv")!,
      patient: adult,
      priorAdministrations: [],
      edit: { doseMg: 100 }, // == default, but dose field was touched
    });
    expect(flags.some((f) => f.code === "concentration")).toBe(true);
  });
  it("a free-text-dose drug (no unitDoseMg) has no numeric range guard — documented gap (#3)", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("salbutamol_neb")!, // no unitDoseMg
      patient: adult,
      priorAdministrations: [],
      edit: { doseMg: 99 },
    });
    expect(flags.some((f) => f.code === "dose_range")).toBe(false);
  });
  it("editing to a LISTED route raises no route/concentration mismatch", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("salbutamol_neb")!,
      patient: adult,
      priorAdministrations: [],
      edit: { route: "nebulised" },
    });
    expect(flags.some((f) => f.code === "concentration")).toBe(false);
  });
  it("the benzodiazepine 2-dose count cap is dose-independent under an edit", () => {
    const flags = runSafetyChecks({
      drug: getEmergencyDrug("lorazepam_seizure_iv")!,
      patient: adult,
      priorAdministrations: [
        { drugKey: "benzodiazepine_seizure", amountMg: 4 },
        { drugKey: "benzodiazepine_seizure", amountMg: 4 },
      ],
      edit: { doseMg: 8 },
    });
    expect(flags.find((f) => f.code === "max_cumulative")?.severity).toBe("block");
  });
});
