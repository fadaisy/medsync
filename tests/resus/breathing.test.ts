import type { BreathingFindingSet } from "@/lib/resus/breathing";
import type { BreathingAction } from "@/lib/resus/reference/breathing-catalog";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import {
  breathingProceedGuard,
  buildBreathingActions,
  classifyBreathing,
  escalationFor,
  isBreathingArrest,
  latestBreathingAssessment,
  triggeredActions,
} from "@/lib/resus/breathing";
import { BREATHING_ACTIONS } from "@/lib/resus/reference/breathing-catalog";

/**
 * Breathing step — finding capture + state classification (GATE B). Pure +
 * deterministic, mirroring the airway engine: worst-finding-wins over the
 * five-level breathing-state vocabulary, and reconstruction of the latest
 * finding-set from the immutable timeline. Reassessment is a new event; the
 * latest is current.
 */

function fs(over: Partial<BreathingFindingSet> = {}): BreathingFindingSet {
  return { state: null, present: [], context: {}, ...over };
}

describe("classifyBreathing — worst finding wins", () => {
  it("returns null when nothing has been assessed", () => {
    expect(classifyBreathing(fs())).toBeNull();
  });

  it("apnoeic headline → apnoeic", () => {
    expect(classifyBreathing(fs({ state: "apnoeic" }))).toBe("apnoeic");
  });

  it("agonal / not-breathing finding → apnoeic", () => {
    expect(classifyBreathing(fs({ present: ["apnoea_agonal"] }))).toBe("apnoeic");
  });

  it("silent chest → peri_arrest (a pre-arrest trap, not 'quiet = better')", () => {
    expect(classifyBreathing(fs({ present: ["silent_chest"] }))).toBe("peri_arrest");
  });

  it("falling RR / exhaustion → peri_arrest (tiring, not improving)", () => {
    expect(classifyBreathing(fs({ present: ["rr_low_falling"] }))).toBe("peri_arrest");
    expect(classifyBreathing(fs({ present: ["exhaustion_drowsy"] }))).toBe("peri_arrest");
  });

  it("normalising/rising PaCO₂ in acute asthma → peri_arrest (THE trap)", () => {
    expect(classifyBreathing(fs({ present: ["paco2_rising_normalising"] }))).toBe("peri_arrest");
  });

  it("SpO₂ < 92% → failure_decompensating", () => {
    expect(classifyBreathing(fs({ present: ["spo2_lt92"] }))).toBe("failure_decompensating");
  });

  it("central cyanosis (late) → failure_decompensating", () => {
    expect(classifyBreathing(fs({ present: ["central_cyanosis"] }))).toBe("failure_decompensating");
  });

  it("reduced breath sounds + hyper-resonance → failure_decompensating", () => {
    expect(classifyBreathing(fs({ present: ["reduced_breath_sounds", "hyper_resonant"] }))).toBe(
      "failure_decompensating",
    );
  });

  it("wheeze / raised RR → distress_compensating", () => {
    expect(classifyBreathing(fs({ present: ["wheeze"] }))).toBe("distress_compensating");
    expect(classifyBreathing(fs({ present: ["rr_raised"] }))).toBe("distress_compensating");
  });

  it("full sentences, nothing worse → adequate", () => {
    expect(classifyBreathing(fs({ present: ["full_sentences"] }))).toBe("adequate");
    expect(classifyBreathing(fs({ state: "adequate" }))).toBe("adequate");
  });

  it("a worse FINDING overrides an optimistic headline (adequate read but silent chest → peri_arrest)", () => {
    expect(classifyBreathing(fs({ state: "adequate", present: ["silent_chest"] }))).toBe(
      "peri_arrest",
    );
  });

  it("normal SpO₂ headline but high RR + accessory muscles → distress (compensating, will fail)", () => {
    expect(
      classifyBreathing(fs({ state: "adequate", present: ["rr_very_high", "accessory_muscles"] })),
    ).toBe("distress_compensating");
  });

  it("no signs of life (pulseless) → apnoeic (routes to arrest)", () => {
    expect(classifyBreathing(fs({ present: ["wheeze"], context: { noSignsOfLife: true } }))).toBe(
      "apnoeic",
    );
  });
});

describe("latestBreathingAssessment — reconstruct from the timeline", () => {
  function bEvent(id: string, recordedAt: string, breathing: BreathingFindingSet): TimelineEvent {
    return {
      id,
      episodeId: "epi-1",
      kind: "assessment",
      step: "B",
      recordedByUserId: "u-1",
      recordedAt,
      createdAt: recordedAt,
      payload: { breathing, label: "Breathing findings" },
      supersedesEventId: null,
    };
  }

  it("returns null when there is no breathing assessment", () => {
    expect(latestBreathingAssessment([])).toBeNull();
  });

  it("returns the most recent breathing finding-set (reassessment wins)", () => {
    const first = bEvent("a", "2026-06-02T10:00:00.000Z", fs({ present: ["wheeze"] }));
    const second = bEvent("b", "2026-06-02T10:05:00.000Z", fs({ present: ["silent_chest"] }));
    expect(latestBreathingAssessment([first, second])?.present).toEqual(["silent_chest"]);
  });

  it("ignores airway (step A) assessments", () => {
    const airway: TimelineEvent = {
      id: "x",
      episodeId: "epi-1",
      kind: "assessment",
      step: "A",
      recordedByUserId: "u-1",
      recordedAt: "2026-06-02T10:10:00.000Z",
      createdAt: "2026-06-02T10:10:00.000Z",
      payload: { airway: {}, label: "airway" },
      supersedesEventId: null,
    };
    const breathing = bEvent("a", "2026-06-02T10:00:00.000Z", fs({ present: ["wheeze"] }));
    expect(latestBreathingAssessment([airway, breathing])?.present).toEqual(["wheeze"]);
  });
});

/* ─── GATE C: findings → action engine + action-state lifecycle ──────── */

function codes(set: BreathingFindingSet): string[] {
  return triggeredActions(set).map((t) => t.code);
}

describe("triggeredActions — supportive baseline + apnoea routing", () => {
  it("any breathing problem → supportive high-flow O₂ + monitoring (non-COPD)", () => {
    const c = codes(fs({ present: ["wheeze"] }));
    expect(c).toContain("b_high_flow_o2");
    expect(c).toContain("b_continuous_monitoring");
  });
  it("COPD risk → controlled O₂ (88–92%), NOT generic high-flow", () => {
    const c = codes(fs({ present: ["wheeze"], context: { copdRisk: true } }));
    expect(c).toContain("b_copd_controlled_o2");
    expect(c).not.toContain("b_high_flow_o2");
  });
  it("apnoea WITH a pulse → BVM ventilation (not an empty CPR list)", () => {
    const c = codes(fs({ present: ["apnoea_agonal"] }));
    expect(c).toContain("b_bag_mask_ventilation");
    expect(c.length).toBeGreaterThan(0);
    expect(isBreathingArrest(fs({ present: ["apnoea_agonal"] }))).toBe(false);
  });
  it("apnoea + no signs of life → arrest (empty breathing list, route to CPR)", () => {
    const f = fs({ present: ["apnoea_agonal"], context: { noSignsOfLife: true } });
    expect(triggeredActions(f)).toEqual([]);
    expect(isBreathingArrest(f)).toBe(true);
  });
});

describe("triggeredActions — life-threat clusters", () => {
  it("tension pneumothorax (absent breath sounds + hyper-resonance) → decompression as top emergency, before imaging/PPV", () => {
    const t = triggeredActions(fs({ present: ["reduced_breath_sounds", "hyper_resonant"] }));
    const decomp = t.find((x) => x.code === "b_tension_decompression")!;
    expect(decomp).toBeTruthy();
    expect(decomp.emergency).toBe(true);
    expect(decomp.priority).toBe(0);
    expect(decomp.rationale.toLowerCase()).toContain("imaging");
  });
  it("massive haemothorax (absent breath sounds + stony dull) → chest drain + major haemorrhage", () => {
    expect(codes(fs({ present: ["reduced_breath_sounds", "stony_dull"] }))).toContain(
      "b_haemothorax_drain",
    );
  });
  it("open chest wound → vented chest seal", () => {
    expect(codes(fs({ present: ["open_chest_wound"] }))).toContain("b_chest_seal");
  });
  it("pulmonary oedema (crackles + raised JVP) → oedema pathway", () => {
    expect(codes(fs({ present: ["crackles", "raised_jvp"] }))).toContain("b_pulmonary_oedema");
  });
  it("consolidation (bronchial breathing) → sepsis bundle", () => {
    expect(codes(fs({ present: ["bronchial_breathing"] }))).toContain("b_sepsis_bundle");
  });
  it("suspected PE → PE support pathway", () => {
    expect(codes(fs({ context: { peSuspected: true } }))).toContain("b_pe_support");
  });
});

describe("triggeredActions — asthma / COPD / anaphylaxis", () => {
  it("plain wheeze → nebulised salbutamol + early steroid (not magnesium)", () => {
    const c = codes(fs({ present: ["wheeze"] }));
    expect(c).toContain("b_salbutamol_neb");
    expect(c).toContain("b_asthma_steroid");
    expect(c).not.toContain("b_magnesium_iv");
  });
  it("life-threatening asthma (wheeze + silent chest) → ipratropium + IV magnesium + senior help", () => {
    const c = codes(fs({ present: ["wheeze", "silent_chest"] }));
    expect(c).toContain("b_ipratropium_neb");
    expect(c).toContain("b_magnesium_iv");
    expect(c).toContain("b_call_skilled_help");
  });
  it("anaphylaxis (wheeze + allergen trigger) → IM adrenaline FIRST (p0), before salbutamol", () => {
    const t = triggeredActions(fs({ present: ["wheeze"], context: { allergenTrigger: true } }));
    const adr = t.find((x) => x.code === "b_anaphylaxis_adrenaline")!;
    const sal = t.find((x) => x.code === "b_salbutamol_neb")!;
    expect(adr.priority).toBe(0);
    expect(adr.priority).toBeLessThan(sal.priority);
  });
  it("COPD with acidosis → NIV (BiPAP)", () => {
    expect(
      codes(fs({ present: ["wheeze", "resp_acidosis"], context: { copdRisk: true } })),
    ).toContain("b_niv");
  });
});

describe("triggeredActions — pre-arrest traps surface as critical, never reassuring", () => {
  it("silent chest → call skilled help (emergency) + ventilation, do NOT mistake for improvement", () => {
    const t = triggeredActions(fs({ present: ["silent_chest"] }));
    const help = t.find((x) => x.code === "b_call_skilled_help")!;
    expect(help.emergency).toBe(true);
    expect(help.priority).toBe(0);
    expect(t.map((x) => x.code)).toContain("b_bag_mask_ventilation");
  });
  it("rising/normalising PaCO₂ → peri-arrest escalation (the killer trap)", () => {
    expect(codes(fs({ present: ["paco2_rising_normalising"] }))).toContain("b_call_skilled_help");
  });
  it("falling RR / exhaustion → peri-arrest escalation", () => {
    expect(codes(fs({ present: ["rr_low_falling"] }))).toContain("b_call_skilled_help");
    expect(codes(fs({ present: ["exhaustion_drowsy"] }))).toContain("b_call_skilled_help");
  });
  it("normal-sats-but-working (high RR + accessory muscles) does NOT, by itself, summon the airway/ICU operator (distress, not failure)", () => {
    expect(codes(fs({ present: ["rr_very_high", "accessory_muscles"] }))).not.toContain(
      "b_magnesium_iv",
    );
  });
});

describe("triggeredActions — integrity + ordering (clinical-safety)", () => {
  it("every triggered action code exists in the catalog + states a why", () => {
    const samples: BreathingFindingSet[] = [
      fs({ present: ["full_sentences"] }),
      fs({ present: ["wheeze"], context: { knownAsthma: true } }),
      fs({ present: ["wheeze", "silent_chest"] }),
      fs({ present: ["wheeze"], context: { allergenTrigger: true } }),
      fs({ present: ["wheeze", "resp_acidosis"], context: { copdRisk: true } }),
      fs({ present: ["reduced_breath_sounds", "hyper_resonant"] }),
      fs({ present: ["reduced_breath_sounds", "stony_dull"] }),
      fs({ present: ["crackles", "raised_jvp"] }),
      fs({ present: ["bronchial_breathing"] }),
      fs({ present: ["apnoea_agonal"] }),
    ];
    for (const s of samples) {
      for (const t of triggeredActions(s)) {
        expect(BREATHING_ACTIONS, `${t.code} must be a catalog action`).toHaveProperty(t.code);
        expect(t.rationale, `${t.code} must state why`).toBeTruthy();
      }
    }
  });
  it("the most-urgent action sorts before the supportive O₂", () => {
    const t = triggeredActions(fs({ present: ["reduced_breath_sounds", "hyper_resonant"] }));
    const decomp = t.findIndex((x) => x.code === "b_tension_decompression");
    const o2 = t.findIndex((x) => x.code === "b_high_flow_o2");
    expect(decomp).toBeLessThan(o2);
  });
});

describe("escalationFor — failed action → next step", () => {
  it("nebulised salbutamol failed → IV magnesium", () => {
    expect(escalationFor("b_salbutamol_neb")).toBe("b_magnesium_iv");
  });
  it("tension decompression failed → chest drain", () => {
    expect(escalationFor("b_tension_decompression")).toBe("b_chest_drain");
  });
  it("capnography confirmation has no further escalation", () => {
    expect(escalationFor("b_capnography_confirm")).toBeNull();
  });
  it("unknown action → null", () => {
    expect(escalationFor("nope")).toBeNull();
  });
});

describe("buildBreathingActions — fold state changes by actionId", () => {
  function actEvent(
    id: string,
    recordedAt: string,
    actionId: string,
    actionCode: string,
    state: string,
  ): TimelineEvent {
    return {
      id,
      episodeId: "epi-1",
      kind: "drug",
      step: "B",
      recordedByUserId: "u-1",
      recordedAt,
      createdAt: recordedAt,
      payload: { actionId, actionCode, tier: 2, state, label: actionCode },
      supersedesEventId: null,
    };
  }
  it("folds an action's state history; latest state is current", () => {
    const out = buildBreathingActions([
      actEvent("1", "2026-06-02T10:00:00.000Z", "inst-1", "b_salbutamol_neb", "in_progress"),
      actEvent("2", "2026-06-02T10:05:00.000Z", "inst-1", "b_salbutamol_neb", "performed"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("performed");
    expect(out[0]!.history).toHaveLength(2);
  });
  it("ignores airway (step A) action events", () => {
    const airwayAct: TimelineEvent = {
      id: "x",
      episodeId: "epi-1",
      kind: "action",
      step: "A",
      recordedByUserId: "u-1",
      recordedAt: "2026-06-02T10:00:00.000Z",
      createdAt: "2026-06-02T10:00:00.000Z",
      payload: { actionId: "inst-9", actionCode: "a_suction", tier: 1, state: "performed" },
      supersedesEventId: null,
    };
    expect(buildBreathingActions([airwayAct])).toHaveLength(0);
  });
});

describe("breathingProceedGuard — treat-before-proceeding to C", () => {
  it("blocks while breathing failure / peri-arrest / apnoea is present", () => {
    expect(breathingProceedGuard("apnoeic").ok).toBe(false);
    expect(breathingProceedGuard("peri_arrest").ok).toBe(false);
    expect(breathingProceedGuard("failure_decompensating").ok).toBe(false);
  });
  it("flags distress (compensating, will fail) before C", () => {
    expect(breathingProceedGuard("distress_compensating").ok).toBe(false);
  });
  it("allows proceeding once adequate", () => {
    expect(breathingProceedGuard("adequate").ok).toBe(true);
  });
  it("an unassessed breathing is NOT declared safe to proceed to C", () => {
    expect(breathingProceedGuard(null).ok).toBe(false);
  });
});

describe("catalog integrity (clinical-safety)", () => {
  it("every action's escalatesTo references a real catalog entry", () => {
    for (const a of Object.values(BREATHING_ACTIONS) as BreathingAction[]) {
      if (a.escalatesTo)
        expect(BREATHING_ACTIONS, `${a.code}.escalatesTo`).toHaveProperty(a.escalatesTo);
    }
  });
});

/* ─── GATE E: adversarial-review must-fix regressions ────────────────── */

describe("life-threatening bronchospasm escalates in EVERY cause branch (must-fix)", () => {
  it("ANAPHYLAXIS + silent chest → adrenaline FIRST, AND ipratropium + IV magnesium are not dropped", () => {
    const t = triggeredActions(
      fs({ present: ["wheeze", "silent_chest"], context: { allergenTrigger: true } }),
    );
    const c = t.map((x) => x.code);
    expect(t.find((x) => x.code === "b_anaphylaxis_adrenaline")!.priority).toBe(0);
    expect(c).toContain("b_ipratropium_neb");
    expect(c).toContain("b_magnesium_iv");
    // adrenaline still sorts before the adjunct salbutamol
    const adr = t.findIndex((x) => x.code === "b_anaphylaxis_adrenaline");
    const sal = t.findIndex((x) => x.code === "b_salbutamol_neb");
    expect(adr).toBeLessThan(sal);
  });
  it("COPD + severe hypoxia (wheeze + SpO₂<92%) → explicit senior/ICU call (not just generic supportive O₂)", () => {
    const c = codes(fs({ present: ["wheeze", "spo2_lt92"], context: { copdRisk: true } }));
    expect(c).toContain("b_call_skilled_help");
    expect(c).toContain("b_ipratropium_neb");
  });
  it("pure COPD (no asthma history) does NOT get IV magnesium auto-surfaced; asthma-overlap (knownAsthma) does", () => {
    const pureCopd = codes(fs({ present: ["wheeze", "spo2_lt92"], context: { copdRisk: true } }));
    expect(pureCopd).not.toContain("b_magnesium_iv");
    const overlap = codes(
      fs({ present: ["wheeze", "spo2_lt92"], context: { copdRisk: true, knownAsthma: true } }),
    );
    expect(overlap).toContain("b_magnesium_iv");
  });
});

describe("cant_complete_sentences is severe, not mere distress (must-fix)", () => {
  it("inability to complete a sentence → failure_decompensating (acute severe), not distress_compensating", () => {
    expect(classifyBreathing(fs({ present: ["cant_complete_sentences"] }))).toBe(
      "failure_decompensating",
    );
  });
});

describe("chest-trauma life-threats fire on partial sign-sets (should-fix)", () => {
  it("massive haemothorax via stony-dull + asymmetric expansion + trauma (no breath-sounds code) still fires", () => {
    expect(
      codes(fs({ present: ["stony_dull", "asymmetric_expansion"], context: { trauma: true } })),
    ).toContain("b_haemothorax_drain");
  });
  it("flail segment → skilled help / ventilatory support (a named B life-threat)", () => {
    expect(codes(fs({ present: ["flail_segment"], context: { trauma: true } }))).toContain(
      "b_call_skilled_help",
    );
  });
});
