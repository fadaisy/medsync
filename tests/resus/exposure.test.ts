import type { ExposureFindingSet } from "@/lib/resus/exposure";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { RECOMMENDATION_DRUG_MAP } from "@/lib/prescribing/reference/emergency-drug-catalog";
import {
  buildExposureActions,
  classifyExposure,
  escalationFor,
  exposureCycleGuard,
  identifyExposureDiagnosis,
  isExposureArrest,
  latestExposureAssessment,
  temperatureMissing,
  tempStage,
  triggeredActions,
} from "@/lib/resus/exposure";
import { EXPOSURE_ACTIONS } from "@/lib/resus/reference/exposure-catalog";

/**
 * Exposure (E) step — the final ABCDE step. Finding capture + exposure-state +
 * temperature staging + SUSPECTED-DIAGNOSIS + the traps + the RETURN-TO-A loop.
 * Pure + deterministic, mirroring the A/B/C/D engines.
 */

function fs(over: Partial<ExposureFindingSet> = {}): ExposureFindingSet {
  return { state: null, present: [], coreTempC: null, context: {}, ...over };
}
const codes = (over: Partial<ExposureFindingSet>) => triggeredActions(fs(over)).map((a) => a.code);

/* ─── temperature staging ─────────────────────────────────────────────── */
describe("tempStage", () => {
  it("stages hypothermia (mild 32–35 / moderate 28–32 / severe <28)", () => {
    expect(tempStage(34)).toBe("mild_hypothermia");
    expect(tempStage(30)).toBe("moderate_hypothermia");
    expect(tempStage(26)).toBe("severe_hypothermia");
  });
  it("stages normal / fever / hyperthermia", () => {
    expect(tempStage(36.8)).toBe("normal");
    expect(tempStage(38.5)).toBe("fever");
    expect(tempStage(41)).toBe("hyperthermia");
  });
  it("null when not measured", () => {
    expect(tempStage(null)).toBeNull();
  });
  it("boundary temps round to the MORE-severe band (28.0 → severe, 32.0 → moderate, 35.0 → mild)", () => {
    expect(tempStage(28)).toBe("severe_hypothermia");
    expect(tempStage(32)).toBe("moderate_hypothermia");
    expect(tempStage(35)).toBe("mild_hypothermia");
  });
});

/* ─── exposure-state classification (worst wins) ──────────────────────── */
describe("classifyExposure — worst finding wins", () => {
  it("null when nothing assessed", () => {
    expect(classifyExposure(fs())).toBeNull();
  });
  it("a non-blanching rash → critical_finding", () => {
    expect(classifyExposure(fs({ present: ["non_blanching_rash"] }))).toBe("critical_finding");
  });
  it("a temperature extreme → temperature_extreme (not downgraded by a benign survey)", () => {
    expect(classifyExposure(fs({ coreTempC: 30 }))).toBe("temperature_extreme");
    expect(classifyExposure(fs({ coreTempC: 41 }))).toBe("temperature_extreme");
  });
  it("a critical finding outranks a temperature extreme", () => {
    expect(classifyExposure(fs({ present: ["non_blanching_rash"], coreTempC: 30 }))).toBe(
      "critical_finding",
    );
  });
  it("a wound alone → significant_finding", () => {
    expect(classifyExposure(fs({ present: ["wound"] }))).toBe("significant_finding");
  });
  it("a positive 'no new critical finding' read is reported", () => {
    expect(classifyExposure(fs({ state: "no_new_critical_finding" }))).toBe(
      "no_new_critical_finding",
    );
  });
});

describe("isExposureArrest", () => {
  it("no pulse routes to the arrest seam", () => {
    expect(isExposureArrest(fs({ context: { noPulse: true } }))).toBe(true);
    expect(isExposureArrest(fs({ present: ["wound"] }))).toBe(false);
  });
});

describe("temperatureMissing — E always wants a temperature", () => {
  it("flags when no temperature recorded", () => {
    expect(temperatureMissing(fs())).toBe(true);
  });
  it("does not flag once recorded", () => {
    expect(temperatureMissing(fs({ coreTempC: 36.5 }))).toBe(false);
  });
});

/* ─── suspected-diagnosis identification ──────────────────────────────── */
describe("identifyExposureDiagnosis — most-time-critical first", () => {
  it("urticaria/angioedema → anaphylaxis", () => {
    expect(identifyExposureDiagnosis(fs({ present: ["urticaria_angioedema"] }))).toBe(
      "anaphylaxis",
    );
  });
  it("non-blanching rash → meningococcal_sepsis", () => {
    expect(identifyExposureDiagnosis(fs({ present: ["non_blanching_rash"] }))).toBe(
      "meningococcal_sepsis",
    );
  });
  it("a haemorrhage finding → occult_haemorrhage", () => {
    expect(identifyExposureDiagnosis(fs({ present: ["pelvic_instability"] }))).toBe(
      "occult_haemorrhage",
    );
  });
  it("severe hypothermia → severe_hypothermia; mild → hypothermia", () => {
    expect(identifyExposureDiagnosis(fs({ coreTempC: 26 }))).toBe("severe_hypothermia");
    expect(identifyExposureDiagnosis(fs({ coreTempC: 34 }))).toBe("hypothermia");
  });
  it("hyperthermia → hyperthermia_heatstroke", () => {
    expect(identifyExposureDiagnosis(fs({ coreTempC: 41 }))).toBe("hyperthermia_heatstroke");
  });
  it("nothing critical → none", () => {
    expect(identifyExposureDiagnosis(fs({ present: ["jaundice"], coreTempC: 37 }))).toBe("none");
  });
});

/* ─── findings → actions + the traps ──────────────────────────────────── */
describe("triggeredActions — baseline checklist + the traps", () => {
  it("E always surfaces the baseline checklist (expose / temp / re-cover / AMPLE / return-to-A)", () => {
    const c = codes({ coreTempC: 36.5 });
    expect(c).toEqual(
      expect.arrayContaining([
        "e_expose_examine",
        "e_measure_temp",
        "e_recover_keep_warm",
        "e_ample_history",
        "e_return_to_a",
      ]),
    );
  });
  it("TRAP measure-temp: missing temperature is pinned at the very top", () => {
    expect(triggeredActions(fs())[0]!.code).toBe("e_measure_temp");
  });
  it("TRAP non-blanching rash → antibiotics (don't delay)", () => {
    expect(codes({ present: ["non_blanching_rash"], coreTempC: 38 })).toContain("e_antibiotics");
  });
  it("TRAP anaphylaxis → IM adrenaline", () => {
    expect(codes({ present: ["urticaria_angioedema"], coreTempC: 37 })).toContain(
      "e_anaphylaxis_adrenaline",
    );
  });
  it("TRAP occult haemorrhage → control + back to C", () => {
    expect(codes({ present: ["abdominal_distension"], coreTempC: 37 })).toContain(
      "e_haemorrhage_control",
    );
  });
  it("TRAP cold sepsis: hypothermia surfaces rewarming AND the septic-screen reconsideration", () => {
    const c = codes({ coreTempC: 30 });
    expect(c).toContain("e_active_rewarming");
    expect(c).toContain("e_septic_screen");
  });
  it("severe hypothermia → ECLS rewarming", () => {
    expect(codes({ coreTempC: 26 })).toContain("e_ecls_rewarming");
  });
  it("hyperthermia → active cooling", () => {
    expect(codes({ coreTempC: 41 })).toContain("e_active_cooling");
  });
  it("TRAP opioid patch → remove + naloxone", () => {
    const c = codes({ present: ["transdermal_opioid_patch"], coreTempC: 37 });
    expect(c).toContain("e_remove_patch");
    expect(c).toContain("e_naloxone");
  });
  it("log-roll is surfaced in trauma", () => {
    expect(codes({ coreTempC: 37, context: { trauma: true } })).toContain("e_log_roll");
    expect(codes({ coreTempC: 37 })).not.toContain("e_log_roll");
  });
  it("a recorded back finding surfaces the log-roll / back examination (even without the trauma flag)", () => {
    expect(codes({ present: ["back_finding"], coreTempC: 37 })).toContain("e_log_roll");
  });
  it("co-morbid criticals are NOT masked — rash + haemorrhage + hyperthermia all surface their actions", () => {
    const c = codes({
      present: ["non_blanching_rash", "pelvic_instability"],
      coreTempC: 41,
    });
    expect(c).toContain("e_antibiotics");
    expect(c).toContain("e_haemorrhage_control");
    expect(c).toContain("e_active_cooling");
  });
  it("no pulse → arrest (no E actions surfaced)", () => {
    expect(triggeredActions(fs({ context: { noPulse: true }, coreTempC: 26 }))).toEqual([]);
  });
});

/* ─── the return-to-A cycle guard ─────────────────────────────────────── */
describe("exposureCycleGuard — E is not a dead-end", () => {
  it("blocks the cycle until the temperature is measured", () => {
    expect(exposureCycleGuard(null, null).ok).toBe(false);
  });
  it("a critical finding must be treated before cycling", () => {
    expect(exposureCycleGuard("critical_finding", 37).ok).toBe(false);
  });
  it("survey complete + nothing critical → ready to return to A", () => {
    expect(exposureCycleGuard("no_new_critical_finding", 36.5).ok).toBe(true);
  });
});

describe("escalationFor", () => {
  it("a failed active-rewarming escalates to ECLS", () => {
    expect(escalationFor("e_active_rewarming")).toBe("e_ecls_rewarming");
  });
});

/* ─── drug routing through the prescribing tool ───────────────────────── */
describe("exposure drug actions route through the prescribing tool", () => {
  it("the e_* drug action codes are mapped to already-verified catalog drugs", () => {
    expect(RECOMMENDATION_DRUG_MAP["e_antibiotics"]).toContain("sepsis_antibiotics");
    expect(RECOMMENDATION_DRUG_MAP["e_anaphylaxis_adrenaline"]).toContain(
      "adrenaline_anaphylaxis_im",
    );
    expect(RECOMMENDATION_DRUG_MAP["e_warmed_fluids"]).toContain("crystalloid_bolus");
    expect(RECOMMENDATION_DRUG_MAP["e_naloxone"]).toContain("naloxone_iv");
  });
});

/* ─── timeline reconstruction ─────────────────────────────────────────── */
describe("latestExposureAssessment + buildExposureActions", () => {
  it("reads the most recent step-E assessment payload", () => {
    const events: TimelineEvent[] = [
      {
        id: "1",
        episodeId: "e",
        kind: "assessment",
        step: "E",
        recordedByUserId: null,
        recordedAt: "2026-06-03T10:00:00Z",
        createdAt: "2026-06-03T10:00:00Z",
        supersedesEventId: null,
        payload: { exposure: { present: ["non_blanching_rash"], coreTempC: 38.5, context: {} } },
      },
    ];
    const fsv = latestExposureAssessment(events);
    expect(fsv?.present).toContain("non_blanching_rash");
    expect(fsv?.coreTempC).toBe(38.5);
  });
  it("folds action events by actionId into their latest state", () => {
    const mk = (state: string, at: string): TimelineEvent => ({
      id: at,
      episodeId: "e",
      kind: "action",
      step: "E",
      recordedByUserId: null,
      recordedAt: at,
      createdAt: at,
      supersedesEventId: null,
      payload: { actionId: "x", actionCode: "e_measure_temp", state },
    });
    const acts = buildExposureActions([
      mk("indicated", "2026-06-03T10:00:00Z"),
      mk("performed", "2026-06-03T10:05:00Z"),
    ]);
    expect(acts).toHaveLength(1);
    expect(acts[0]!.state).toBe("performed");
  });
});

/* ─── catalog integrity ───────────────────────────────────────────────── */
describe("EXPOSURE_ACTIONS catalog", () => {
  it("every triggered action code exists in the action catalog", () => {
    const scenarios: Partial<ExposureFindingSet>[] = [
      { coreTempC: 36.5 },
      { present: ["non_blanching_rash"], coreTempC: 38 },
      { present: ["urticaria_angioedema"], coreTempC: 37 },
      { present: ["abdominal_distension"], coreTempC: 37 },
      { coreTempC: 26 },
      { coreTempC: 41 },
      { present: ["transdermal_opioid_patch"], coreTempC: 37 },
      { coreTempC: 37, context: { trauma: true } },
    ];
    for (const s of scenarios) {
      for (const a of triggeredActions(fs(s))) {
        expect(EXPOSURE_ACTIONS[a.code as keyof typeof EXPOSURE_ACTIONS], a.code).toBeTruthy();
      }
    }
  });
});
