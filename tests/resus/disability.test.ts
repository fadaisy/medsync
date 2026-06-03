import type { DisabilityFindingSet } from "@/lib/resus/disability";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { RECOMMENDATION_DRUG_MAP } from "@/lib/prescribing/reference/emergency-drug-catalog";
import {
  buildDisabilityActions,
  classifyDisability,
  disabilityProceedGuard,
  escalationFor,
  gcsTotal,
  identifyNeuroSyndrome,
  isDisabilityArrest,
  isGcsFalling,
  latestDisabilityAssessment,
  mandatoryGlucoseMissing,
  triggeredActions,
} from "@/lib/resus/disability";
import { DISABILITY_ACTIONS } from "@/lib/resus/reference/disability-catalog";

/**
 * Disability (D) step — finding capture + neuro-state classification + GCS
 * (components + serial trend) + NEURO-SYNDROME identification + the traps.
 * Pure + deterministic, mirroring the airway/breathing/circulation engines.
 */

function fs(over: Partial<DisabilityFindingSet> = {}): DisabilityFindingSet {
  return {
    state: null,
    gcs: null,
    avpu: null,
    glucoseMmol: null,
    present: [],
    context: {},
    ...over,
  };
}

/* ─── GCS computation ─────────────────────────────────────────────────── */
describe("gcsTotal — computed from components", () => {
  it("sums eye + verbal + motor", () => {
    expect(gcsTotal({ eye: 4, verbal: 5, motor: 6 })).toBe(15);
    expect(gcsTotal({ eye: 1, verbal: 1, motor: 4 })).toBe(6);
  });
  it("an intubated patient scores verbal as 1 (T) — total still computed", () => {
    expect(gcsTotal({ eye: 2, verbal: 1, motor: 4, intubated: true })).toBe(7);
  });
  it("returns null when components are incomplete", () => {
    expect(gcsTotal(null)).toBeNull();
    expect(gcsTotal({ eye: 4, verbal: 5 } as never)).toBeNull();
  });
});

/* ─── neuro-state classification (worst wins; normal GCS never downgrades) ── */
describe("classifyDisability — worst finding wins", () => {
  it("returns null when nothing has been assessed", () => {
    expect(classifyDisability(fs())).toBeNull();
  });
  it("GCS 15 / AVPU A → alert", () => {
    expect(classifyDisability(fs({ gcs: { eye: 4, verbal: 5, motor: 6 } }))).toBe("alert");
    expect(classifyDisability(fs({ avpu: "A" }))).toBe("alert");
  });
  it("GCS 12 / AVPU V → mild_moderate_impairment", () => {
    expect(classifyDisability(fs({ gcs: { eye: 3, verbal: 4, motor: 5 } }))).toBe(
      "mild_moderate_impairment",
    );
    expect(classifyDisability(fs({ avpu: "V" }))).toBe("mild_moderate_impairment");
  });
  it("GCS ≤8 / AVPU P or U → severe_impairment_coma", () => {
    expect(classifyDisability(fs({ gcs: { eye: 1, verbal: 2, motor: 4 } }))).toBe(
      "severe_impairment_coma",
    );
    expect(classifyDisability(fs({ avpu: "P" }))).toBe("severe_impairment_coma");
    expect(classifyDisability(fs({ avpu: "U" }))).toBe("severe_impairment_coma");
  });
  it("an active seizure → active_seizure_status (even when GCS is low)", () => {
    expect(
      classifyDisability(fs({ present: ["active_seizure"], gcs: { eye: 1, verbal: 1, motor: 3 } })),
    ).toBe("active_seizure_status");
  });
  it("herniation signs → raised_icp_herniation (the most ominous state)", () => {
    expect(classifyDisability(fs({ present: ["cushings_triad"] }))).toBe("raised_icp_herniation");
    expect(classifyDisability(fs({ present: ["decerebrate"] }))).toBe("raised_icp_herniation");
  });
  it("TRAP: a fixed dilated pupil with GCS 15 is STILL raised_icp_herniation (normal GCS never downgrades)", () => {
    expect(
      classifyDisability(
        fs({ gcs: { eye: 4, verbal: 5, motor: 6 }, present: ["fixed_dilated_pupil"] }),
      ),
    ).toBe("raised_icp_herniation");
  });
  it("raised ICP outranks an active seizure outranks coma", () => {
    expect(classifyDisability(fs({ present: ["active_seizure", "fixed_dilated_pupil"] }))).toBe(
      "raised_icp_herniation",
    );
  });
});

describe("isDisabilityArrest", () => {
  it("no pulse routes to the arrest seam", () => {
    expect(isDisabilityArrest(fs({ context: { noPulse: true } }))).toBe(true);
    expect(isDisabilityArrest(fs({ avpu: "U" }))).toBe(false);
  });
});

/* ─── the mandatory-glucose trap ──────────────────────────────────────── */
describe("mandatoryGlucoseMissing — Don't Ever Forget Glucose", () => {
  it("flags a reduced-consciousness patient with no glucose recorded", () => {
    expect(mandatoryGlucoseMissing(fs({ avpu: "P" }))).toBe(true);
    expect(mandatoryGlucoseMissing(fs({ present: ["active_seizure"] }))).toBe(true);
  });
  it("does not flag once a glucose value is recorded", () => {
    expect(mandatoryGlucoseMissing(fs({ avpu: "P", glucoseMmol: 5.5 }))).toBe(false);
  });
  it("does not flag a fully alert patient", () => {
    expect(mandatoryGlucoseMissing(fs({ gcs: { eye: 4, verbal: 5, motor: 6 } }))).toBe(false);
  });
});

/* ─── serial GCS trend (the D-distinctive monitoring) ─────────────────── */
describe("isGcsFalling — the serial trend is a return-to-A trigger", () => {
  const ev = (at: string, eye: number, verbal: number, motor: number): TimelineEvent => ({
    id: at,
    episodeId: "e",
    kind: "assessment",
    step: "D",
    recordedByUserId: null,
    recordedAt: at,
    createdAt: at,
    supersedesEventId: null,
    payload: { disability: { gcs: { eye, verbal, motor }, present: [], context: {} } },
  });
  it("detects a falling GCS across serial assessments", () => {
    const events = [ev("2026-06-03T10:00:00Z", 4, 5, 6), ev("2026-06-03T10:10:00Z", 3, 3, 5)];
    expect(isGcsFalling(events)).toBe(true);
  });
  it("a stable / improving GCS is not falling", () => {
    const events = [ev("2026-06-03T10:00:00Z", 3, 3, 5), ev("2026-06-03T10:10:00Z", 4, 5, 6)];
    expect(isGcsFalling(events)).toBe(false);
  });
});

/* ─── neuro-syndrome identification (the cause axis) ──────────────────── */
describe("identifyNeuroSyndrome — reversible-first, glucose always considered first", () => {
  it("returns null when nothing relevant is present", () => {
    expect(identifyNeuroSyndrome(fs({ avpu: "A" }))).toBeNull();
  });
  it("low glucose → hypoglycaemia (checked FIRST, beats everything)", () => {
    expect(identifyNeuroSyndrome(fs({ avpu: "P", glucoseMmol: 2.1 }))).toBe("hypoglycaemia");
    expect(identifyNeuroSyndrome(fs({ present: ["active_seizure"], glucoseMmol: 2.0 }))).toBe(
      "hypoglycaemia",
    );
  });
  it("pinpoint pupils + reduced consciousness → opioid_toxicity", () => {
    expect(
      identifyNeuroSyndrome(fs({ avpu: "P", glucoseMmol: 5, present: ["pinpoint_pupils"] })),
    ).toBe("opioid_toxicity");
  });
  it("TRAP: seizure in pregnancy → eclampsia (NOT status — magnesium, not benzo-first)", () => {
    expect(
      identifyNeuroSyndrome(
        fs({ present: ["active_seizure"], glucoseMmol: 5, context: { pregnancyPostpartum: true } }),
      ),
    ).toBe("eclampsia");
  });
  it("active seizure (not pregnant, glucose normal) → status_epilepticus", () => {
    expect(identifyNeuroSyndrome(fs({ present: ["active_seizure"], glucoseMmol: 5 }))).toBe(
      "status_epilepticus",
    );
  });
  it("Cushing's / herniation signs → raised_icp_herniation", () => {
    expect(identifyNeuroSyndrome(fs({ present: ["cushings_triad"], glucoseMmol: 5 }))).toBe(
      "raised_icp_herniation",
    );
  });
  it("focal deficit → stroke", () => {
    expect(identifyNeuroSyndrome(fs({ present: ["focal_deficit"], glucoseMmol: 5 }))).toBe(
      "stroke",
    );
  });
  it("reduced GCS with an abnormal A/B/C → secondary_to_abc", () => {
    expect(
      identifyNeuroSyndrome(fs({ avpu: "P", glucoseMmol: 5, context: { abcAbnormal: true } })),
    ).toBe("secondary_to_abc");
  });
});

/* ─── findings → actions + the traps ──────────────────────────────────── */
describe("triggeredActions — the traps are enforced", () => {
  const codes = (over: Partial<DisabilityFindingSet>) =>
    triggeredActions(fs(over)).map((a) => a.code);

  it("an alert patient with nothing abnormal triggers no actions", () => {
    expect(triggeredActions(fs({ avpu: "A" }))).toEqual([]);
  });
  it("TRAP glucose-always: any reduced consciousness surfaces check-glucose, pinned at the very top", () => {
    const actions = triggeredActions(fs({ avpu: "P" }));
    expect(actions[0]!.code).toBe("d_check_glucose");
  });
  it("TRAP GCS≤8: surfaces back-to-A → definitive airway", () => {
    expect(codes({ gcs: { eye: 1, verbal: 1, motor: 3 } })).toContain("d_back_to_a_airway");
  });
  it("hypoglycaemia → the glucose treatment action", () => {
    expect(codes({ avpu: "P", glucoseMmol: 2.0 })).toContain("d_glucose");
  });
  it("opioid → naloxone", () => {
    expect(codes({ avpu: "P", glucoseMmol: 5, present: ["pinpoint_pupils"] })).toContain(
      "d_naloxone",
    );
  });
  it("TRAP status: full-dose benzodiazepine; TRAP eclampsia: magnesium, NOT benzo", () => {
    expect(codes({ present: ["active_seizure"], glucoseMmol: 5 })).toContain("d_benzodiazepine");
    const ecl = codes({
      present: ["active_seizure"],
      glucoseMmol: 5,
      context: { pregnancyPostpartum: true },
    });
    expect(ecl).toContain("d_eclampsia_magnesium");
    expect(ecl).not.toContain("d_benzodiazepine");
  });
  it("TRAP Cushing's: raised-ICP → neurosurgery+CT (do not treat the BP)", () => {
    const acts = triggeredActions(fs({ present: ["cushings_triad"], glucoseMmol: 5 }));
    const ni = acts.find((a) => a.code === "d_neurosurgery_ct");
    expect(ni).toBeTruthy();
    expect(ni!.rationale.toLowerCase()).toContain("not");
  });
  it("reduced GCS + abnormal A/B/C → re-confirm A-B-C", () => {
    expect(codes({ avpu: "P", glucoseMmol: 5, context: { abcAbnormal: true } })).toContain(
      "d_reconfirm_abc",
    );
  });
});

/* ─── proceed guard + GCS≤8 return-to-A + escalation ──────────────────── */
describe("disabilityProceedGuard", () => {
  it("blocks proceeding to E when D not assessed", () => {
    expect(disabilityProceedGuard(null, null).ok).toBe(false);
  });
  it("GCS ≤8 → back to A (not E)", () => {
    const g = disabilityProceedGuard("severe_impairment_coma", 7);
    expect(g.ok).toBe(false);
    expect(g.warning!.toLowerCase()).toContain("a");
  });
  it("an alert, assessed patient may proceed", () => {
    expect(disabilityProceedGuard("alert", 15).ok).toBe(true);
  });
});

describe("escalationFor", () => {
  it("a failed benzodiazepine escalates to the second-line anticonvulsant", () => {
    expect(escalationFor("d_benzodiazepine")).toBe("d_second_line_anticonvulsant");
  });
});

/* ─── drug routing through the prescribing tool ───────────────────────── */
describe("disability drug actions route through the prescribing tool", () => {
  it("the d_* drug action codes are mapped in RECOMMENDATION_DRUG_MAP", () => {
    for (const code of ["d_glucose", "d_naloxone", "d_benzodiazepine", "d_eclampsia_magnesium"]) {
      expect(RECOMMENDATION_DRUG_MAP[code], code).toBeTruthy();
      expect(RECOMMENDATION_DRUG_MAP[code]!.length).toBeGreaterThan(0);
    }
  });
  it("status benzodiazepine resolves to the full-dose seizure benzodiazepines", () => {
    expect(RECOMMENDATION_DRUG_MAP["d_benzodiazepine"]).toContain("lorazepam_seizure_iv");
    expect(RECOMMENDATION_DRUG_MAP["d_benzodiazepine"]).toContain("midazolam_seizure_buccal");
  });
  it("eclampsia magnesium resolves to the dedicated eclampsia entry (not the arrest/asthma dose)", () => {
    expect(RECOMMENDATION_DRUG_MAP["d_eclampsia_magnesium"]).toContain("magnesium_eclampsia_iv");
  });
});

/* ─── timeline reconstruction ─────────────────────────────────────────── */
describe("latestDisabilityAssessment + buildDisabilityActions", () => {
  it("reads the most recent step-D assessment payload", () => {
    const events: TimelineEvent[] = [
      {
        id: "1",
        episodeId: "e",
        kind: "assessment",
        step: "D",
        recordedByUserId: null,
        recordedAt: "2026-06-03T10:00:00Z",
        createdAt: "2026-06-03T10:00:00Z",
        supersedesEventId: null,
        payload: { disability: { avpu: "P", present: ["pinpoint_pupils"], context: {} } },
      },
    ];
    const fsv = latestDisabilityAssessment(events);
    expect(fsv?.avpu).toBe("P");
    expect(fsv?.present).toContain("pinpoint_pupils");
  });
  it("folds action events by actionId into their latest state", () => {
    const mk = (state: string, at: string): TimelineEvent => ({
      id: at,
      episodeId: "e",
      kind: "action",
      step: "D",
      recordedByUserId: null,
      recordedAt: at,
      createdAt: at,
      supersedesEventId: null,
      payload: { actionId: "x", actionCode: "d_check_glucose", state },
    });
    const acts = buildDisabilityActions([
      mk("indicated", "2026-06-03T10:00:00Z"),
      mk("performed", "2026-06-03T10:05:00Z"),
    ]);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.state).toBe("performed");
  });
});

/* ─── catalog integrity ───────────────────────────────────────────────── */
describe("DISABILITY_ACTIONS catalog", () => {
  it("every triggered action code exists in the action catalog", () => {
    const scenarios: Partial<DisabilityFindingSet>[] = [
      { avpu: "P", glucoseMmol: 2.0 },
      { avpu: "P", glucoseMmol: 5, present: ["pinpoint_pupils"] },
      { present: ["active_seizure"], glucoseMmol: 5 },
      { present: ["active_seizure"], glucoseMmol: 5, context: { pregnancyPostpartum: true } },
      { present: ["cushings_triad"], glucoseMmol: 5 },
      { present: ["focal_deficit"], glucoseMmol: 5 },
      { gcs: { eye: 1, verbal: 1, motor: 3 } },
    ];
    for (const s of scenarios) {
      for (const a of triggeredActions(fs(s))) {
        expect(DISABILITY_ACTIONS[a.code as keyof typeof DISABILITY_ACTIONS], a.code).toBeTruthy();
      }
    }
  });
});

/* ─── review must-fixes: co-morbid critical actions are NOT masked by the
 *     single-winner syndrome (raised-ICP + a reversible cause; eclampsia +
 *     hypoglycaemia / postictal) ──────────────────────────────────────────── */
describe("triggeredActions — co-morbid critical actions are not masked", () => {
  const codes = (over: Partial<DisabilityFindingSet>) =>
    triggeredActions(fs(over)).map((a) => a.code);

  it("MUST-FIX: raised-ICP neurosurgery+CT surfaces alongside a co-existing seizure (Cushing's + active seizure)", () => {
    const c = codes({ present: ["cushings_triad", "active_seizure"], glucoseMmol: 5 });
    expect(c).toContain("d_benzodiazepine");
    expect(c).toContain("d_neurosurgery_ct");
  });
  it("MUST-FIX: a blown pupil surfaces neurosurgery+CT even with an opioid picture", () => {
    const c = codes({
      present: ["fixed_dilated_pupil", "pinpoint_pupils"],
      avpu: "P",
      glucoseMmol: 5,
    });
    expect(c).toContain("d_neurosurgery_ct");
  });
  it("MUST-FIX: eclampsia magnesium surfaces even when the seizing pregnant patient is ALSO hypoglycaemic", () => {
    const c = codes({
      present: ["active_seizure"],
      glucoseMmol: 2.0,
      context: { pregnancyPostpartum: true },
    });
    expect(c).toContain("d_glucose");
    expect(c).toContain("d_eclampsia_magnesium");
  });
  it("MUST-FIX: a pregnant postictal (not-waking) patient still surfaces eclampsia magnesium", () => {
    const c = codes({
      present: ["non_convulsive_suspected"],
      glucoseMmol: 5,
      context: { pregnancyPostpartum: true },
    });
    expect(c).toContain("d_eclampsia_magnesium");
  });
  it("does NOT surface eclampsia magnesium for a seizing patient who is not pregnant", () => {
    expect(codes({ present: ["active_seizure"], glucoseMmol: 5 })).not.toContain(
      "d_eclampsia_magnesium",
    );
  });
});

describe("isGcsFalling — falling-NOW, not dropped-then-recovered (review should-fix)", () => {
  const ev = (at: string, eye: number, verbal: number, motor: number): TimelineEvent => ({
    id: at,
    episodeId: "e",
    kind: "assessment",
    step: "D",
    recordedByUserId: null,
    recordedAt: at,
    createdAt: at,
    supersedesEventId: null,
    payload: { disability: { gcs: { eye, verbal, motor }, present: [], context: {} } },
  });
  it("a patient who dropped then RECOVERED (15 → 6 → 14) is not falling now", () => {
    const events = [
      ev("2026-06-03T10:00:00Z", 4, 5, 6),
      ev("2026-06-03T10:05:00Z", 1, 1, 4),
      ev("2026-06-03T10:10:00Z", 4, 4, 6),
    ];
    expect(isGcsFalling(events)).toBe(false);
  });
});
