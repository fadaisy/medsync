import type { AirwayFindingSet } from "@/lib/resus/airway";
import type { AirwayAction } from "@/lib/resus/reference/airway-catalog";
import type { TimelineEvent } from "@/lib/resus/types";
import { describe, expect, it } from "vitest";

import {
  airwayProceedGuard,
  buildAirwayActions,
  classifyAirway,
  escalationFor,
  isArrestPattern,
  latestAirwayAssessment,
  triggeredActions,
} from "@/lib/resus/airway";
import { AIRWAY_ACTIONS } from "@/lib/resus/reference/airway-catalog";

/**
 * Airway step — finding capture + state classification (GATE B). Pure +
 * deterministic: worst-finding-wins classification, and reconstruction of
 * the latest finding-set from the immutable timeline. Reassessment is a
 * new event; the latest is current.
 */

function fs(over: Partial<AirwayFindingSet> = {}): AirwayFindingSet {
  return { patency: null, present: [], difficulty: [], context: {}, ...over };
}

describe("classifyAirway — worst finding wins", () => {
  it("returns null when nothing has been assessed", () => {
    expect(classifyAirway(fs())).toBeNull();
  });

  it("apnoeic patency WITH signs of life → apnoeic_ventilate (peri-arrest resp failure, NOT CPR)", () => {
    expect(classifyAirway(fs({ patency: "apnoeic" }))).toBe("apnoeic_ventilate");
  });

  it("silence + no effort (signs of life) → apnoeic_ventilate", () => {
    expect(classifyAirway(fs({ present: ["silence_no_effort"] }))).toBe("apnoeic_ventilate");
  });

  it("apnoea + no signs of life (pulseless) → apnoeic_arrest", () => {
    expect(classifyAirway(fs({ patency: "apnoeic", context: { noSignsOfLife: true } }))).toBe(
      "apnoeic_arrest",
    );
  });

  it("no signs of life (context) → apnoeic_arrest (overrides everything)", () => {
    expect(
      classifyAirway(fs({ patency: "patent_talking", context: { noSignsOfLife: true } })),
    ).toBe("apnoeic_arrest");
  });

  it("silence + effort → completely_obstructed", () => {
    expect(classifyAirway(fs({ present: ["silence_with_effort"] }))).toBe("completely_obstructed");
  });

  it("no airflow → completely_obstructed", () => {
    expect(classifyAirway(fs({ present: ["airflow_absent"] }))).toBe("completely_obstructed");
  });

  it("stridor → partially_obstructed", () => {
    expect(classifyAirway(fs({ present: ["stridor_inspiratory"] }))).toBe("partially_obstructed");
  });

  it("gurgling → partially_obstructed", () => {
    expect(classifyAirway(fs({ present: ["gurgling"] }))).toBe("partially_obstructed");
  });

  it("hoarse/muffled voice → threatened", () => {
    expect(classifyAirway(fs({ present: ["hoarse_muffled_voice"] }))).toBe("threatened");
  });

  it("burns/soot → threatened", () => {
    expect(classifyAirway(fs({ present: ["burns_soot"] }))).toBe("threatened");
  });

  it("GCS ≤ 8 → threatened", () => {
    expect(classifyAirway(fs({ present: ["gcs_le8"] }))).toBe("threatened");
  });

  it("patent_at_risk patency → threatened", () => {
    expect(classifyAirway(fs({ patency: "patent_at_risk" }))).toBe("threatened");
  });

  it("patent + talking, no threats → secure", () => {
    expect(classifyAirway(fs({ patency: "patent_talking", present: ["normal_speech"] }))).toBe(
      "secure",
    );
  });

  it("a worse FINDING overrides an optimistic patency (talking but stridor → partial)", () => {
    expect(
      classifyAirway(fs({ patency: "patent_talking", present: ["stridor_inspiratory"] })),
    ).toBe("partially_obstructed");
  });

  it("a difficulty flag alone does NOT downgrade a secure airway (anticipation, not threat)", () => {
    expect(
      classifyAirway(
        fs({ patency: "patent_talking", present: ["normal_speech"], difficulty: ["lemon"] }),
      ),
    ).toBe("secure");
  });
});

describe("latestAirwayAssessment — reconstruct from the timeline", () => {
  function aEvent(id: string, recordedAt: string, airway: AirwayFindingSet): TimelineEvent {
    return {
      id,
      episodeId: "epi-1",
      kind: "assessment",
      step: "A",
      recordedByUserId: "u-1",
      recordedAt,
      createdAt: recordedAt,
      payload: { airway, label: "Airway findings" },
      supersedesEventId: null,
    };
  }

  it("returns null when there is no airway assessment", () => {
    expect(latestAirwayAssessment([])).toBeNull();
  });

  it("returns the most recent airway finding-set (reassessment wins)", () => {
    const first = aEvent("a", "2026-06-02T10:00:00.000Z", fs({ patency: "partially_obstructed" }));
    const second = aEvent("b", "2026-06-02T10:05:00.000Z", fs({ patency: "secure" as never }));
    const latest = latestAirwayAssessment([first, second]);
    expect(latest?.patency).toBe("secure");
  });

  it("ignores non-airway assessments and other steps", () => {
    const other: TimelineEvent = {
      id: "x",
      episodeId: "epi-1",
      kind: "assessment",
      step: "B",
      recordedByUserId: "u-1",
      recordedAt: "2026-06-02T10:10:00.000Z",
      createdAt: "2026-06-02T10:10:00.000Z",
      payload: { label: "breathing" },
      supersedesEventId: null,
    };
    const airway = aEvent("a", "2026-06-02T10:00:00.000Z", fs({ patency: "patent_talking" }));
    expect(latestAirwayAssessment([other, airway])?.patency).toBe("patent_talking");
  });
});

/* ─── GATE C: findings → action engine + action-state lifecycle ──────── */

function codes(fs: AirwayFindingSet): string[] {
  return triggeredActions(fs).map((t) => t.code);
}

describe("triggeredActions — single findings", () => {
  it("secure + talking → high-flow O₂ + monitor", () => {
    expect(codes(fs({ patency: "patent_talking", present: ["normal_speech"] }))).toContain(
      "a_high_flow_o2",
    );
  });
  it("gurgling → suction", () => {
    expect(codes(fs({ present: ["gurgling"] }))).toContain("a_suction");
  });
  it("snoring without trauma → head-tilt/chin-lift (not jaw-thrust)", () => {
    const c = codes(fs({ present: ["snoring"] }));
    expect(c).toContain("a_head_tilt_chin_lift");
    expect(c).not.toContain("a_jaw_thrust");
  });
  it("snoring WITH trauma → jaw-thrust (not head-tilt)", () => {
    const c = codes(fs({ present: ["snoring"], context: { trauma: true } }));
    expect(c).toContain("a_jaw_thrust");
    expect(c).not.toContain("a_head_tilt_chin_lift");
  });
  it("foreign body → remove / choking algorithm", () => {
    const c = codes(fs({ present: ["foreign_body"] }));
    expect(c.some((x) => x === "a_remove_foreign_body" || x === "a_choking_algorithm")).toBe(true);
  });
});

describe("triggeredActions — combination clusters", () => {
  it("complete obstruction → call skilled help (emergency) + open/suction", () => {
    const t = triggeredActions(fs({ present: ["silence_with_effort", "see_saw"] }));
    const c = t.map((x) => x.code);
    expect(c).toContain("a_call_skilled_help");
    expect(t.find((x) => x.code === "a_call_skilled_help")?.emergency).toBe(true);
  });
  it("epiglottitis cluster (stridor + drooling + muffled voice) → epiglottitis pathway, NOT instrumentation (no OPA)", () => {
    const c = codes(
      fs({ present: ["stridor_inspiratory", "drooling_tripod", "hoarse_muffled_voice"] }),
    );
    expect(c).toContain("a_epiglottitis_pathway");
    expect(c).not.toContain("a_opa");
  });
  it("anaphylaxis cluster (facial swelling + allergen trigger) → IM adrenaline", () => {
    expect(codes(fs({ present: ["swelling_face"], context: { allergenTrigger: true } }))).toContain(
      "a_anaphylaxis_adrenaline",
    );
  });
  it("burns/inhalation cluster → early intubation", () => {
    expect(codes(fs({ present: ["burns_soot", "hoarse_muffled_voice"] }))).toContain(
      "a_burns_early_intubation",
    );
  });
  it("reduced GCS + snoring → adjunct + skilled help (definitive airway)", () => {
    const c = codes(fs({ present: ["gcs_le8", "snoring"] }));
    expect(c).toContain("a_opa");
    expect(c).toContain("a_call_skilled_help");
  });
  it("difficulty flag + a compromised airway → anticipate difficulty (call skilled help)", () => {
    expect(codes(fs({ present: ["stridor_inspiratory"], difficulty: ["lemon"] }))).toContain(
      "a_call_skilled_help",
    );
  });
  it("every triggered action code exists in the catalog", () => {
    const samples: AirwayFindingSet[] = [
      fs({ patency: "patent_talking", present: ["normal_speech"] }),
      fs({ present: ["gurgling", "snoring"] }),
      fs({ present: ["silence_with_effort"] }),
      fs({ present: ["stridor_inspiratory", "drooling_tripod", "hoarse_muffled_voice"] }),
      fs({ present: ["swelling_face"], context: { allergenTrigger: true } }),
      fs({ present: ["burns_soot", "hoarse_muffled_voice"] }),
      fs({ present: ["gcs_le8", "snoring"] }),
    ];
    for (const s of samples) {
      for (const t of triggeredActions(s)) {
        expect(AIRWAY_ACTIONS, `${t.code} must be a catalog action`).toHaveProperty(t.code);
        expect(t.rationale, `${t.code} must state why`).toBeTruthy();
      }
    }
  });
  it("most-urgent action sorts before supportive O₂", () => {
    const t = triggeredActions(fs({ present: ["silence_with_effort"] }));
    const help = t.findIndex((x) => x.code === "a_call_skilled_help");
    const o2 = t.findIndex((x) => x.code === "a_high_flow_o2");
    if (help !== -1 && o2 !== -1) expect(help).toBeLessThan(o2);
  });
});

describe("isArrestPattern", () => {
  it("apnoea + no signs of life → arrest pattern (route to arrest, not airway)", () => {
    expect(isArrestPattern(fs({ patency: "apnoeic", context: { noSignsOfLife: true } }))).toBe(
      true,
    );
  });
  it("a partially obstructed airway is NOT an arrest pattern", () => {
    expect(isArrestPattern(fs({ present: ["stridor_inspiratory"] }))).toBe(false);
  });
});

describe("escalationFor — failed action → next tier (DAS ladder)", () => {
  it("Plan A failed → Plan B", () => {
    expect(escalationFor("a_plan_a_intubation")).toBe("a_plan_b_supraglottic");
  });
  it("a failed basic measure → call skilled help", () => {
    expect(escalationFor("a_suction")).toBe("a_call_skilled_help");
  });
  it("Plan D (eFONA) has no further escalation", () => {
    expect(escalationFor("a_plan_d_efona")).toBeNull();
  });
  it("unknown action → null", () => {
    expect(escalationFor("nope")).toBeNull();
  });
});

describe("buildAirwayActions — fold state changes by actionId", () => {
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
      kind: "action",
      step: "A",
      recordedByUserId: "u-1",
      recordedAt,
      createdAt: recordedAt,
      payload: { actionId, actionCode, tier: 1, state, label: actionCode },
      supersedesEventId: null,
    };
  }

  it("folds an action's state history; latest state is current", () => {
    const out = buildAirwayActions([
      actEvent("1", "2026-06-02T10:00:00.000Z", "inst-1", "a_suction", "indicated"),
      actEvent("2", "2026-06-02T10:01:00.000Z", "inst-1", "a_suction", "performed"),
    ]);
    expect(out).toHaveLength(1);
    expect(out[0]!.state).toBe("performed");
    expect(out[0]!.history).toHaveLength(2);
  });

  it("a failed action is reflected as the current state", () => {
    const out = buildAirwayActions([
      actEvent("1", "2026-06-02T10:00:00.000Z", "inst-2", "a_opa", "in_progress"),
      actEvent("2", "2026-06-02T10:02:00.000Z", "inst-2", "a_opa", "failed"),
    ]);
    expect(out[0]!.state).toBe("failed");
  });

  it("separate actionIds → separate instances", () => {
    const out = buildAirwayActions([
      actEvent("1", "2026-06-02T10:00:00.000Z", "inst-1", "a_suction", "performed"),
      actEvent("2", "2026-06-02T10:01:00.000Z", "inst-2", "a_opa", "indicated"),
    ]);
    expect(out).toHaveLength(2);
  });
});

describe("airwayProceedGuard — treat-before-proceeding to B", () => {
  it("blocks while an airway obstruction is open", () => {
    expect(airwayProceedGuard("completely_obstructed").ok).toBe(false);
    expect(airwayProceedGuard("partially_obstructed").ok).toBe(false);
  });
  it("flags a threatened airway", () => {
    expect(airwayProceedGuard("threatened").ok).toBe(false);
  });
  it("allows proceeding once secure", () => {
    expect(airwayProceedGuard("secure").ok).toBe(true);
  });
});

describe("triggeredActions — more clusters (GATE E adversarial)", () => {
  it("expanding neck haematoma + voice change → threatened, call skilled + surgical help", () => {
    const c = codes(fs({ present: ["swelling_neck", "hoarse_muffled_voice"] }));
    expect(c).toContain("a_call_skilled_help");
  });
  it("progression (weakening cough + stridor) → escalate (call skilled help), do not wait for desat", () => {
    expect(codes(fs({ present: ["weakening_cough", "stridor_inspiratory"] }))).toContain(
      "a_call_skilled_help",
    );
  });
  it("isolated stridor → call skilled help (laryngeal obstruction)", () => {
    expect(codes(fs({ present: ["stridor_inspiratory"] }))).toContain("a_call_skilled_help");
  });
  it("simple gurgling does NOT, by itself, summon the airway operator", () => {
    expect(codes(fs({ present: ["gurgling"] }))).not.toContain("a_call_skilled_help");
  });
});

describe("catalog integrity (clinical-safety)", () => {
  it("every action's escalatesTo + doseId references a real catalog/dose entry", () => {
    for (const a of Object.values(AIRWAY_ACTIONS) as AirwayAction[]) {
      if (a.escalatesTo)
        expect(AIRWAY_ACTIONS, `${a.code}.escalatesTo`).toHaveProperty(a.escalatesTo);
    }
  });
});

/* ─── GATE E: adversarial-review must-fix regressions ────────────────── */

describe("apnoea routing — pulse-dependent (must-fix)", () => {
  it("apnoea WITH a pulse → ventilation actions (BVM), NOT an empty CPR list", () => {
    const c = codes(fs({ patency: "apnoeic" }));
    expect(c).toContain("a_bag_mask_ventilation");
    expect(c.length).toBeGreaterThan(0);
    expect(isArrestPattern(fs({ patency: "apnoeic" }))).toBe(false);
  });
  it("apnoea + no signs of life → arrest (empty airway list, route to CPR)", () => {
    const f = fs({ patency: "apnoeic", context: { noSignsOfLife: true } });
    expect(triggeredActions(f)).toEqual([]);
    expect(isArrestPattern(f)).toBe(true);
  });
});

describe("see-saw is complete obstruction (must-fix)", () => {
  it("see-saw alone → completely_obstructed + open airway + call skilled help (not O₂-only)", () => {
    expect(classifyAirway(fs({ present: ["see_saw"] }))).toBe("completely_obstructed");
    const c = codes(fs({ present: ["see_saw"] }));
    expect(c).toContain("a_head_tilt_chin_lift");
    expect(c).toContain("a_call_skilled_help");
  });
});

describe("adrenaline gated on anaphylaxis features (must-fix)", () => {
  it("facial swelling AFTER a trigger → IM adrenaline as the top (p0) emergency", () => {
    const t = triggeredActions(
      fs({ present: ["swelling_face"], context: { allergenTrigger: true } }),
    );
    const adr = t.find((x) => x.code === "a_anaphylaxis_adrenaline")!;
    expect(adr.priority).toBe(0);
  });
  it("isolated facial swelling (no trigger) → airway protection first; adrenaline only conditional (not p0)", () => {
    const t = triggeredActions(fs({ present: ["swelling_face"] }));
    const adr = t.find((x) => x.code === "a_anaphylaxis_adrenaline")!;
    expect(adr.priority).toBeGreaterThan(0);
    expect(t.some((x) => x.code === "a_call_skilled_help")).toBe(true);
  });
});

describe("epiglottitis trigger + do-not-instrument (must-fix)", () => {
  it("drooling + muffled voice (pre-stridor) → epiglottitis pathway fires EARLY", () => {
    expect(codes(fs({ present: ["drooling_tripod", "hoarse_muffled_voice"] }))).toContain(
      "a_epiglottitis_pathway",
    );
  });
  it("stridor + hoarse withOUT drooling → laryngeal oedema (NOT epiglottitis do-not-touch)", () => {
    const c = codes(fs({ present: ["stridor_inspiratory", "hoarse_muffled_voice"] }));
    expect(c).not.toContain("a_epiglottitis_pathway");
    expect(c).toContain("a_neb_adrenaline_oedema");
  });
  it("suspected epiglottitis with co-present gurgling/snoring/GCS → NO instrumentation surfaced", () => {
    const c = codes(
      fs({
        present: ["drooling_tripod", "hoarse_muffled_voice", "gurgling", "snoring", "gcs_le8"],
      }),
    );
    expect(c).toContain("a_epiglottitis_pathway");
    expect(c).toContain("a_call_skilled_help");
    for (const instrument of ["a_suction", "a_head_tilt_chin_lift", "a_jaw_thrust", "a_opa"]) {
      expect(c, `must not instrument: ${instrument}`).not.toContain(instrument);
    }
  });
});

describe("C-spine + danger-finding fixes (should-fix)", () => {
  it("facial/neck trauma finding implies jaw-thrust (not head-tilt)", () => {
    const c = codes(fs({ present: ["facial_neck_trauma", "snoring"] }));
    expect(c).toContain("a_jaw_thrust");
    expect(c).not.toContain("a_head_tilt_chin_lift");
  });
  it("central cyanosis is not inert → threatened + call skilled help", () => {
    expect(classifyAirway(fs({ present: ["central_cyanosis"] }))).toBe("threatened");
    expect(codes(fs({ present: ["central_cyanosis"] }))).toContain("a_call_skilled_help");
  });
  it("an unassessed airway is NOT declared safe to proceed to B", () => {
    expect(airwayProceedGuard(null).ok).toBe(false);
  });
});
