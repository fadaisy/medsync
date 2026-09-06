import type { NcdCatalog, SiteProfile } from "@/lib/ncd/catalog/schema";
import type { CaptureMap } from "@/lib/ncd/engine/evaluate";
import { describe, expect, it } from "vitest";

import { DIABETES_CATALOG, DISTRICT_SITE, REFERRAL_SITE } from "@/lib/ncd/catalog/diabetes";
import { recorded } from "@/lib/ncd/catalog/schema";
import { errorsOf, validateCatalog } from "@/lib/ncd/catalog/validate";
import { ncdContext, therapyConcerns } from "@/lib/ncd/engine/assess";

/**
 * Therapy flags are the first construct in this catalog that reads a
 * PRESCRIPTION and says something about it, so the boundary matters more here
 * than anywhere else: they may quote a contraindication, and they may not carry
 * a dose.
 */

const fired = (values: CaptureMap, site: SiteProfile = REFERRAL_SITE) =>
  therapyConcerns(DIABETES_CATALOG, ncdContext(DIABETES_CATALOG, values, site))
    .filter((t) => t.state === "met")
    .map((t) => t.id);

describe("therapy flags fire on the relation, not on the drug", () => {
  it("says nothing about an ordinary prescription", () => {
    expect(fired({ glucose_lowering_therapy: recorded(["metformin"]) })).toEqual([]);
    expect(
      fired({
        glucose_lowering_therapy: recorded(["sulfonylurea"]),
        sulfonylurea_agent: recorded("gliclazide"),
      }),
    ).toEqual([]);
  });

  /**
   * The most consequential rule in the set, because the GLUCOSE CAN BE NORMAL.
   * A flag that waited for a number would never fire on euglycaemic
   * ketoacidosis, which is the whole reason ADA writes the warning.
   */
  it("raises an SGLT2 inhibitor in an acute illness, and not in a well patient", () => {
    const on = { glucose_lowering_therapy: recorded(["sglt2"]) };
    expect(fired(on)).toEqual([]);
    expect(fired({ ...on, intercurrent_illness: recorded(true) })).toContain(
      "sglt2_during_acute_illness",
    );
    expect(fired({ ...on, vomiting: recorded(true) })).toContain("sglt2_during_acute_illness");
    // Recorded as absent is a real negative, and must not fire it.
    expect(fired({ ...on, intercurrent_illness: recorded(false) })).toEqual([]);
  });

  it("raises metformin below an eGFR of 30, and not above it", () => {
    const on = { glucose_lowering_therapy: recorded(["metformin"]) };
    expect(fired({ ...on, egfr: recorded(22) })).toContain("metformin_low_egfr");
    expect(fired({ ...on, egfr: recorded(30) })).toEqual([]);
    expect(fired({ ...on, egfr: recorded(70) })).toEqual([]);
    // Not yet measured is not a clean result — it simply does not fire.
    expect(fired(on)).toEqual([]);
  });

  /**
   * A check the site cannot run must not read as a clean result. This is the
   * same collapse the four-state evaluator exists to refuse, one level up.
   */
  it("reports a check it could not run, rather than staying silent", () => {
    const noLab: SiteProfile = {
      ...DISTRICT_SITE,
      id: "nolab",
      available: DISTRICT_SITE.available.filter((c) => c !== "lab.creatinine"),
    };
    const all = therapyConcerns(
      DIABETES_CATALOG,
      ncdContext(DIABETES_CATALOG, { glucose_lowering_therapy: recorded(["metformin"]) }, noLab),
    );
    const blocked = all.find((t) => t.id === "metformin_low_egfr")!;
    expect(blocked.state).toBe("unavailable");
    expect(blocked.blocked).toContain("egfr");
    // And it is not counted as fired.
    expect(fired({ glucose_lowering_therapy: recorded(["metformin"]) }, noLab)).toEqual([]);
  });

  /**
   * The reason `sulfonylurea_agent` exists. The therapy list is by class, and
   * the class cannot express the commonest correctable prescribing problem in
   * the setting this module is built for.
   */
  it("distinguishes glibenclamide from the rest of its class", () => {
    const on = { glucose_lowering_therapy: recorded(["sulfonylurea"]) };
    expect(fired({ ...on, sulfonylurea_agent: recorded("glibenclamide") })).toContain(
      "glibenclamide_in_use",
    );
    for (const agent of ["gliclazide", "glimepiride", "glipizide"]) {
      expect(fired({ ...on, sulfonylurea_agent: recorded(agent) }), agent).not.toContain(
        "glibenclamide_in_use",
      );
    }
    // The class alone says nothing — the agent has to be asked.
    expect(fired(on)).toEqual([]);
  });

  it("raises a sulfonylurea taken alongside insulin", () => {
    expect(fired({ glucose_lowering_therapy: recorded(["sulfonylurea", "insulin"]) })).toContain(
      "sulfonylurea_with_insulin",
    );
    expect(fired({ glucose_lowering_therapy: recorded(["insulin"]) })).toEqual([]);
  });

  it("raises a sulfonylurea in someone who no longer feels a low", () => {
    expect(
      fired({
        glucose_lowering_therapy: recorded(["sulfonylurea"]),
        impaired_hypo_awareness: recorded(true),
      }),
    ).toContain("sulfonylurea_without_warning");
  });

  /**
   * Separate from `treatment_omission` on purpose: stopping metformin worsens
   * control, and stopping insulin causes ketoacidosis.
   */
  it("raises insulin that has been stopped, from the change record", () => {
    expect(
      fired({
        new_or_changed_drug: recorded(true),
        drug_change_kind: recorded("stopped"),
        drug_change_from: recorded(["insulin"]),
      }),
    ).toContain("insulin_stopped");
    // A dose change is not a stop.
    expect(
      fired({
        new_or_changed_drug: recorded(true),
        drug_change_kind: recorded("dose_changed"),
        drug_change_from: recorded(["insulin"]),
      }),
    ).toEqual([]);
  });
});

describe("the boundary: decision support, never a prescription", () => {
  /**
   * The validator rejects a flag whose action contains a dose. It also has to
   * ALLOW a rate, because "below an eGFR of 30 mL/min/1.73 m²" is the threshold
   * the guideline states — the guard caught that sentence on its first run,
   * which is how the distinction got written.
   */
  const withAction = (action: string): NcdCatalog => ({
    ...DIABETES_CATALOG,
    therapyFlags: [
      {
        id: "probe",
        display: "Probe",
        severity: "amber",
        action,
        when: DIABETES_CATALOG.therapyFlags![0]!.when,
        citation: DIABETES_CATALOG.therapyFlags![0]!.citation,
      },
    ],
  });
  const doses = (action: string) =>
    errorsOf(validateCatalog(withAction(action))).some((e) =>
      e.message.includes("contains a dose"),
    );

  it("rejects an action carrying a dose", () => {
    for (const a of ["Reduce to 500 mg twice daily.", "Give 10 units now.", "Start 1 g daily."]) {
      expect(doses(a), a).toBe(true);
    }
  });

  it("allows a threshold stated as a rate", () => {
    for (const a of [
      "Stop metformin — contraindicated below an eGFR of 30 mL/min/1.73 m².",
      "Discontinue during critical illness, and 3–4 days before surgery.",
      "Consider switching to gliclazide.",
    ]) {
      expect(doses(a), a).toBe(false);
    }
  });

  it("every shipped flag names an action and a source", () => {
    for (const t of DIABETES_CATALOG.therapyFlags ?? []) {
      expect(t.action.trim().length, t.id).toBeGreaterThan(20);
      expect(t.citation.standard, t.id).toBeTruthy();
      expect(t.citation.url ?? t.citation.needsCsoInput, t.id).toBeTruthy();
    }
  });

  /**
   * Not expressible, and recorded as a gap rather than approximated. There is no
   * captured diabetes TYPE — classification is derived from criteria and a
   * predicate cannot reference it — so the most severe rule of all, insulin
   * omission in type 1, has no home here yet.
   */
  it("has no flag pretending to know the diabetes type", () => {
    const codes = DIABETES_CATALOG.features.map((f) => f.code);
    expect(codes).not.toContain("dm_type");
    for (const t of DIABETES_CATALOG.therapyFlags ?? []) {
      const refs = [...(t.when.all ?? []), ...(t.when.any ?? [])].map((pr) => pr.feature);
      expect(refs, t.id).not.toContain("dm_type");
    }
  });
});
