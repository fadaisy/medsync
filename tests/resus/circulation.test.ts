import type { CirculationFindingSet } from "@/lib/resus/circulation";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import { RECOMMENDATION_DRUG_MAP } from "@/lib/prescribing/reference/emergency-drug-catalog";
import {
  buildCirculationActions,
  circulationProceedGuard,
  classifyCirculation,
  escalationFor,
  identifyShockType,
  isCirculationArrest,
  latestCirculationAssessment,
  triggeredActions,
} from "@/lib/resus/circulation";
import { CIRCULATION_ACTIONS } from "@/lib/resus/reference/circulation-catalog";

/**
 * Circulation step — finding capture + circulatory-state classification +
 * SHOCK-TYPE identification (GATE B). Pure + deterministic, mirroring the
 * airway/breathing engines: worst-finding-wins over the five-level
 * circulatory-state vocabulary, the shock-type axis that drives the strategy,
 * and reconstruction from the immutable timeline.
 */

function fs(over: Partial<CirculationFindingSet> = {}): CirculationFindingSet {
  return { state: null, present: [], context: {}, ...over };
}

describe("classifyCirculation — worst finding wins; normal BP never downgrades", () => {
  it("returns null when nothing has been assessed", () => {
    expect(classifyCirculation(fs())).toBeNull();
  });

  it("no pulse → arrest", () => {
    expect(classifyCirculation(fs({ context: { noPulse: true } }))).toBe("arrest");
  });

  it("barely-palpable / absent peripheral pulses → peri_arrest", () => {
    expect(classifyCirculation(fs({ present: ["absent_peripheral_pulses"] }))).toBe("peri_arrest");
  });

  it("hypotension → decompensated_shock", () => {
    expect(classifyCirculation(fs({ present: ["hypotension"] }))).toBe("decompensated_shock");
  });

  it("tachycardia alone → compensated_shock", () => {
    expect(classifyCirculation(fs({ present: ["tachycardia"] }))).toBe("compensated_shock");
  });

  it("TRAP: compensated shock (tachy + narrow PP + poor cap refill) with NO hypotension → compensated_shock, not downgraded by a normal BP", () => {
    expect(
      classifyCirculation(
        fs({
          state: "well_perfused",
          present: ["tachycardia", "narrow_pulse_pressure", "cap_refill_poor"],
        }),
      ),
    ).toBe("compensated_shock");
  });

  it("TRAP: shock index > 0.9 (occult shock) → compensated_shock even with a normal BP", () => {
    expect(classifyCirculation(fs({ present: ["shock_index_high"] }))).toBe("compensated_shock");
  });

  it("hypotension overrides compensated findings → decompensated", () => {
    expect(classifyCirculation(fs({ present: ["tachycardia", "hypotension"] }))).toBe(
      "decompensated_shock",
    );
  });

  it("explicit well-perfused read, no shock findings → well_perfused", () => {
    expect(classifyCirculation(fs({ state: "well_perfused" }))).toBe("well_perfused");
  });
});

describe("identifyShockType — combination + context reasoning (drives the strategy)", () => {
  it("no shock → null", () => {
    expect(identifyShockType(fs({ state: "well_perfused" }))).toBeNull();
  });

  it("urticaria/angioedema (or allergen trigger) → anaphylactic", () => {
    expect(identifyShockType(fs({ present: ["hypotension", "urticaria_angioedema"] }))).toBe(
      "distributive_anaphylactic",
    );
    expect(
      identifyShockType(fs({ present: ["hypotension"], context: { allergenTrigger: true } })),
    ).toBe("distributive_anaphylactic");
  });

  it("hypotension + raised JVP + muffled heart sounds → tamponade (obstructive)", () => {
    expect(
      identifyShockType(fs({ present: ["hypotension", "raised_jvp", "muffled_heart_sounds"] })),
    ).toBe("obstructive_tamponade");
  });

  it("RV strain / ECG PE signs → massive PE (obstructive)", () => {
    expect(identifyShockType(fs({ present: ["hypotension", "raised_jvp", "us_rv_strain"] }))).toBe(
      "obstructive_pe",
    );
  });

  it("trauma / bleeding signs → haemorrhagic", () => {
    expect(identifyShockType(fs({ present: ["tachycardia", "external_haemorrhage"] }))).toBe(
      "hypovolaemic_haemorrhagic",
    );
    expect(identifyShockType(fs({ present: ["hypotension"], context: { trauma: true } }))).toBe(
      "hypovolaemic_haemorrhagic",
    );
  });

  it("fever + warm peripheries + raised lactate → septic (distributive)", () => {
    expect(
      identifyShockType(
        fs({ present: ["tachycardia", "warm_peripheries", "fever_rash", "lactate_raised"] }),
      ),
    ).toBe("distributive_septic");
  });

  it("ECG ischaemia → cardiogenic", () => {
    expect(identifyShockType(fs({ present: ["hypotension", "ecg_ischaemia"] }))).toBe(
      "cardiogenic",
    );
  });

  it("hypotension + bradycardia + warm peripheries + spinal injury → neurogenic", () => {
    expect(
      identifyShockType(
        fs({
          present: ["hypotension", "bradycardia", "warm_peripheries"],
          context: { spinalInjury: true },
        }),
      ),
    ).toBe("distributive_neurogenic");
  });

  it("shock with flat JVP / cold peripheries, no other type → hypovolaemic non-haemorrhagic", () => {
    expect(
      identifyShockType(fs({ present: ["tachycardia", "flat_jvp", "cold_peripheries"] })),
    ).toBe("hypovolaemic_nonhaemorrhagic");
  });

  it("shock present but no discriminating features → undifferentiated", () => {
    expect(identifyShockType(fs({ present: ["tachycardia"] }))).toBe("undifferentiated");
  });
});

describe("latestCirculationAssessment — reconstruct from the timeline", () => {
  function cEvent(id: string, at: string, circulation: CirculationFindingSet): TimelineEvent {
    return {
      id,
      episodeId: "epi-1",
      kind: "assessment",
      step: "C",
      recordedByUserId: "u-1",
      recordedAt: at,
      createdAt: at,
      payload: { circulation, label: "Circulation findings" },
      supersedesEventId: null,
    };
  }

  it("returns null when there is no circulation assessment", () => {
    expect(latestCirculationAssessment([])).toBeNull();
  });

  it("returns the most recent circulation finding-set", () => {
    const a = cEvent("a", "2026-06-03T10:00:00Z", fs({ present: ["tachycardia"] }));
    const b = cEvent("b", "2026-06-03T10:05:00Z", fs({ present: ["hypotension"] }));
    expect(latestCirculationAssessment([a, b])?.present).toEqual(["hypotension"]);
  });

  it("ignores other steps", () => {
    const breathing: TimelineEvent = {
      id: "x",
      episodeId: "epi-1",
      kind: "assessment",
      step: "B",
      recordedByUserId: "u",
      recordedAt: "2026-06-03T10:10:00Z",
      createdAt: "2026-06-03T10:10:00Z",
      payload: { breathing: {} },
      supersedesEventId: null,
    };
    const c = cEvent("a", "2026-06-03T10:00:00Z", fs({ present: ["tachycardia"] }));
    expect(latestCirculationAssessment([breathing, c])?.present).toEqual(["tachycardia"]);
  });
});

/* ─── GATE C: findings → action engine (shock-type-driven) + traps ───── */

function codes(set: CirculationFindingSet): string[] {
  return triggeredActions(set).map((t) => t.code);
}

describe("triggeredActions — baseline + arrest routing", () => {
  it("any shock → Tier-1 baseline (IV access + bloods)", () => {
    const c = codes(fs({ present: ["tachycardia"] }));
    expect(c).toContain("c_iv_access");
    expect(c).toContain("c_bloods");
  });
  it("no pulse → arrest (empty list, route to CPR)", () => {
    const f = fs({ context: { noPulse: true } });
    expect(triggeredActions(f)).toEqual([]);
    expect(isCirculationArrest(f)).toBe(true);
  });
  it("well-perfused → no shock actions beyond nothing/baseline-not-triggered", () => {
    expect(triggeredActions(fs({ state: "well_perfused" }))).toEqual([]);
  });
});

describe("triggeredActions — shock-type-driven strategy", () => {
  it("HAEMORRHAGIC → stop bleeding + blood/MHP + TXA, and NO crystalloid flood (the trap)", () => {
    const c = codes(
      fs({ present: ["tachycardia", "external_haemorrhage"], context: { trauma: true } }),
    );
    expect(c).toContain("c_stop_bleeding");
    expect(c).toContain("c_blood_mhp");
    expect(c).toContain("c_txa");
    expect(c).toContain("c_haemorrhage_control");
    expect(c).not.toContain("c_crystalloid_bolus");
  });
  it("SEPTIC → antibiotics + crystalloid + noradrenaline", () => {
    const c = codes(
      fs({ present: ["hypotension", "warm_peripheries", "fever_rash", "lactate_raised"] }),
    );
    expect(c).toContain("c_sepsis_antibiotics");
    expect(c).toContain("c_crystalloid_bolus");
    expect(c).toContain("c_noradrenaline");
  });
  it("ANAPHYLAXIS → IM adrenaline FIRST (p0)", () => {
    const t = triggeredActions(fs({ present: ["hypotension", "urticaria_angioedema"] }));
    const adr = t.find((x) => x.code === "c_anaphylaxis_adrenaline")!;
    expect(adr.priority).toBe(0);
  });
  it("TAMPONADE (obstructive) → pericardiocentesis, NO crystalloid flood", () => {
    const c = codes(fs({ present: ["hypotension", "raised_jvp", "muffled_heart_sounds"] }));
    expect(c).toContain("c_pericardiocentesis");
    expect(c).not.toContain("c_crystalloid_bolus");
  });
  it("TENSION (obstructive) → decompression, NO crystalloid", () => {
    const f = fs({ present: ["hypotension", "raised_jvp", "tracheal_deviation"] });
    expect(identifyShockType(f)).toBe("obstructive_tension");
    const c = codes(f);
    expect(c).toContain("c_decompress");
    expect(c).not.toContain("c_crystalloid_bolus");
  });
  it("CARDIOGENIC → inotrope/PCI, NO crystalloid flood (the trap)", () => {
    const c = codes(fs({ present: ["hypotension", "ecg_ischaemia"] }));
    expect(c.some((x) => x === "c_inotrope" || x === "c_pci_activate")).toBe(true);
    expect(c).not.toContain("c_crystalloid_bolus");
  });
  it("HYPOVOLAEMIC non-haemorrhagic → crystalloid bolus", () => {
    expect(codes(fs({ present: ["tachycardia", "flat_jvp", "cold_peripheries"] }))).toContain(
      "c_crystalloid_bolus",
    );
  });
});

describe("triggeredActions — the FEAST trap (Uganda-critical)", () => {
  it("febrile child + septic picture → crystalloid carries a FEAST caution, not adult flooding", () => {
    const t = triggeredActions(
      fs({
        present: ["tachycardia", "warm_peripheries", "fever_rash", "lactate_raised"],
        context: { febrileChild: true },
      }),
    );
    const bolus = t.find((x) => x.code === "c_crystalloid_bolus");
    expect(bolus).toBeTruthy();
    expect(bolus!.rationale.toUpperCase()).toContain("FEAST");
  });
});

describe("triggeredActions — β-hCG / ectopic", () => {
  it("reproductive-age woman + shock → β-hCG / ectopic surfaced via escalation", () => {
    const t = triggeredActions(
      fs({
        present: ["tachycardia", "abdominal_distension"],
        context: { pregnancyPossible: true },
      }),
    );
    expect(
      t.some(
        (x) =>
          x.rationale.toLowerCase().includes("ectopic") ||
          x.rationale.toLowerCase().includes("β-hcg") ||
          x.rationale.toLowerCase().includes("hcg"),
      ),
    ).toBe(true);
  });
});

describe("triggeredActions — integrity + prescribing link", () => {
  it("every triggered code exists in the catalog + states a why", () => {
    const samples: CirculationFindingSet[] = [
      fs({ present: ["tachycardia", "external_haemorrhage"], context: { trauma: true } }),
      fs({ present: ["hypotension", "fever_rash", "warm_peripheries", "lactate_raised"] }),
      fs({ present: ["hypotension", "urticaria_angioedema"] }),
      fs({ present: ["hypotension", "raised_jvp", "muffled_heart_sounds"] }),
      fs({ present: ["hypotension", "ecg_ischaemia"] }),
      fs({ present: ["tachycardia", "flat_jvp", "cold_peripheries"] }),
    ];
    for (const s of samples) {
      for (const t of triggeredActions(s)) {
        expect(CIRCULATION_ACTIONS, `${t.code} must be a catalog action`).toHaveProperty(t.code);
        expect(t.rationale, `${t.code} must state why`).toBeTruthy();
      }
    }
  });
  it("the prescribable circulation actions are keys in the prescribing recommendation map", () => {
    for (const code of [
      "c_txa",
      "c_noradrenaline",
      "c_anaphylaxis_adrenaline",
      "c_crystalloid_bolus",
      "c_blood_mhp",
    ]) {
      expect(RECOMMENDATION_DRUG_MAP, code).toHaveProperty(code);
    }
  });
});

describe("escalationFor — failed action → next step", () => {
  it("noradrenaline failed → vasopressin", () => {
    expect(escalationFor("c_noradrenaline")).toBe("c_vasopressin");
  });
  it("IV access failed → central/arterial access", () => {
    expect(escalationFor("c_iv_access")).toBe("c_central_arterial_access");
  });
  it("call-skilled-help has no further escalation", () => {
    expect(escalationFor("c_call_skilled_help")).toBeNull();
  });
});

describe("buildCirculationActions — fold by actionId (step C)", () => {
  function actEvent(
    id: string,
    at: string,
    actionId: string,
    actionCode: string,
    state: string,
  ): TimelineEvent {
    return {
      id,
      episodeId: "epi-1",
      kind: "action",
      step: "C",
      recordedByUserId: "u-1",
      recordedAt: at,
      createdAt: at,
      payload: { actionId, actionCode, tier: 2, state, label: actionCode },
      supersedesEventId: null,
    };
  }
  it("folds state history; latest is current", () => {
    const out = buildCirculationActions([
      actEvent("1", "2026-06-03T10:00:00Z", "i1", "c_crystalloid_bolus", "in_progress"),
      actEvent("2", "2026-06-03T10:05:00Z", "i1", "c_crystalloid_bolus", "performed"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("performed");
  });
  it("ignores other steps", () => {
    const b: TimelineEvent = {
      id: "x",
      episodeId: "epi-1",
      kind: "action",
      step: "B",
      recordedByUserId: "u",
      recordedAt: "2026-06-03T10:00:00Z",
      createdAt: "2026-06-03T10:00:00Z",
      payload: { actionId: "z", actionCode: "b_salbutamol_neb", state: "performed" },
      supersedesEventId: null,
    };
    expect(buildCirculationActions([b])).toHaveLength(0);
  });
});

describe("circulationProceedGuard — treat-before-proceeding to D", () => {
  it("blocks while shock is open (arrest/peri-arrest/decompensated/compensated)", () => {
    expect(circulationProceedGuard("arrest").ok).toBe(false);
    expect(circulationProceedGuard("peri_arrest").ok).toBe(false);
    expect(circulationProceedGuard("decompensated_shock").ok).toBe(false);
    expect(circulationProceedGuard("compensated_shock").ok).toBe(false);
  });
  it("allows once well-perfused", () => {
    expect(circulationProceedGuard("well_perfused").ok).toBe(true);
  });
  it("an unassessed circulation is NOT declared safe", () => {
    expect(circulationProceedGuard(null).ok).toBe(false);
  });
});

/* ─── GATE E: adversarial-review must-fix regressions ─────────────────── */

describe("raised JVP is the fluids-will-harm gate (must-fix #1/#3)", () => {
  it("raised JVP + cold peripheries + hypotension → cardiogenic, NOT a crystalloid flood", () => {
    const f = fs({ present: ["hypotension", "raised_jvp", "cold_peripheries"] });
    expect(identifyShockType(f)).toBe("cardiogenic");
    const c = codes(f);
    expect(c).not.toContain("c_crystalloid_bolus");
    expect(c.some((x) => x === "c_inotrope" || x === "c_call_skilled_help")).toBe(true);
  });
  it("raised JVP + tachycardia (early PE/obstructive, ECG not yet done) → NO crystalloid", () => {
    expect(codes(fs({ present: ["hypotension", "raised_jvp", "tachycardia"] }))).not.toContain(
      "c_crystalloid_bolus",
    );
  });
});

describe("warm/brady distributive shock is caught with a NORMAL BP (must-fix #4)", () => {
  it("bradycardia + warm peripheries (no hypotension) → compensated_shock, not 'not assessed'", () => {
    expect(classifyCirculation(fs({ present: ["bradycardia", "warm_peripheries"] }))).toBe(
      "compensated_shock",
    );
  });
  it("warm + bounding + wide pulse pressure (normal BP) → compensated_shock", () => {
    expect(
      classifyCirculation(
        fs({ present: ["warm_peripheries", "bounding_pulse", "wide_pulse_pressure"] }),
      ),
    ).toBe("compensated_shock");
  });
});

describe("a stale trauma flag does not override a clear septic picture (must-fix #5)", () => {
  it("septic findings + trauma:true → septic (antibiotics surfaced), not haemorrhagic", () => {
    const f = fs({
      present: ["hypotension", "warm_peripheries", "fever_rash", "lactate_raised"],
      context: { trauma: true },
    });
    expect(identifyShockType(f)).toBe("distributive_septic");
    expect(codes(f)).toContain("c_sepsis_antibiotics");
  });
  it("a bare trauma flag (no distributive picture) still → haemorrhagic", () => {
    expect(
      identifyShockType(fs({ present: ["hypotension", "tachycardia"], context: { trauma: true } })),
    ).toBe("hypovolaemic_haemorrhagic");
  });
});

describe("a recorded positive β-hCG drives the ectopic caution (must-fix #6)", () => {
  it("hypotension + bhcg_positive → ectopic surfaced", () => {
    const t = triggeredActions(fs({ present: ["hypotension", "bhcg_positive"] }));
    expect(t.some((x) => x.rationale.toLowerCase().includes("ectopic"))).toBe(true);
  });
});

describe("tension finding identifies + decompresses (must-fix #2)", () => {
  it("unilateral absent breath sounds + raised JVP → tension, decompress, no crystalloid", () => {
    const f = fs({ present: ["hypotension", "raised_jvp", "unilateral_absent_breath_sounds"] });
    expect(identifyShockType(f)).toBe("obstructive_tension");
    expect(codes(f)).toContain("c_decompress");
    expect(codes(f)).not.toContain("c_crystalloid_bolus");
  });
});

describe("TBI permissive-hypotension exception is explicit (should-fix #10)", () => {
  it("headInjury → c_stop_bleeding leads with MAP ≥ 80 / no permissive hypotension", () => {
    const t = triggeredActions(
      fs({
        present: ["hypotension", "external_haemorrhage"],
        context: { trauma: true, headInjury: true },
      }),
    );
    const sb = t.find((x) => x.code === "c_stop_bleeding")!;
    expect(sb.rationale).toContain("MAP ≥ 80");
  });
});

describe("anaphylaxis co-presenting with bleeding still surfaces haemorrhage control (should-fix #9)", () => {
  it("anaphylaxis + external haemorrhage → adrenaline AND stop-bleeding/blood", () => {
    const c = codes(
      fs({ present: ["hypotension", "urticaria_angioedema", "external_haemorrhage"] }),
    );
    expect(c).toContain("c_anaphylaxis_adrenaline");
    expect(c).toContain("c_stop_bleeding");
    expect(c).toContain("c_blood_mhp");
  });
});

describe("re-review residuals (NEW-1 / NEW-2)", () => {
  it("NEW-1: anaphylaxis-by-context + active bleeding → adrenaline + blood, NO crystalloid", () => {
    const c = codes(
      fs({ present: ["hypotension", "external_haemorrhage"], context: { allergenTrigger: true } }),
    );
    expect(c).toContain("c_anaphylaxis_adrenaline");
    expect(c).toContain("c_blood_mhp");
    expect(c).not.toContain("c_crystalloid_bolus");
  });
  it("NEW-2: a tamponade sign with NO severity finding is still classified as shock (not null)", () => {
    const f = fs({ present: ["raised_jvp", "muffled_heart_sounds"] });
    expect(classifyCirculation(f)).not.toBeNull();
    expect(identifyShockType(f)).toBe("obstructive_tamponade");
    expect(codes(f)).toContain("c_pericardiocentesis");
  });
  it("NEW-2: an isolated RV-strain sign classifies as shock + PE", () => {
    const f = fs({ present: ["us_rv_strain"] });
    expect(classifyCirculation(f)).not.toBeNull();
    expect(identifyShockType(f)).toBe("obstructive_pe");
  });
});
