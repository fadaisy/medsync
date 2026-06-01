import type { TriageInput } from "@/lib/triage/types";
import { describe, expect, it } from "vitest";

import { runTriage } from "@/lib/triage/engine";
import { recommend } from "@/lib/triage/recommend";

/**
 * Triage recommendations — SUGGESTIONS, NOT ORDERS (GATE B).
 * Pure mapping from a triage finding → general suggested next actions.
 * Tests pin: the suggestions-not-orders contract (no dosing), key
 * scenarios (sepsis / DKA / stroke / obstetric / paeds / hypoxia /
 * hypoglycaemia), recompute-on-override, the down-disposition gate, and
 * determinism.
 */

function input(o: Partial<TriageInput> = {}): TriageInput {
  return {
    context: {
      ageYears: 40,
      pregnancy: "not_pregnant",
      reproductiveAgeFemale: false,
      spo2Scale2Enabled: false,
    },
    vitals: {
      respiratoryRate: 16,
      spo2: 98,
      oxygen: "air",
      systolicBp: 120,
      diastolicBp: 80,
      pulse: 70,
      consciousness: "A",
      temperature: 37,
      bloodGlucose: 6,
    },
    ...o,
  };
}

const rec = (i: TriageInput, assigned?: 1 | 2 | 3 | 4 | 5) => recommend(runTriage(i), assigned);
const codes = (i: TriageInput, assigned?: 1 | 2 | 3 | 4 | 5) => rec(i, assigned).map((r) => r.code);

/* ─── The suggestions-not-orders contract (the load-bearing rule) ── */

describe("recommend — category-level only, NO dosing/treatment specifics", () => {
  // A broad set of findings so we exercise many suggestion strings.
  const scenarios: TriageInput[] = [
    input(),
    input({ vitals: { ...input().vitals, respiratoryRate: 28, spo2: 90, pulse: 130 } }),
    input({ vitals: { ...input().vitals, bloodGlucose: 2.0 } }),
    input({ vitals: { ...input().vitals, bloodGlucose: 22 } }),
    input({
      presentDiscriminators: ["sepsis_suspicion"],
      vitals: { ...input().vitals, respiratoryRate: 24, systolicBp: 95 },
    }),
    input({ presentDiscriminators: ["focal_neuro_deficit"] }),
    input({ presentDiscriminators: ["cardiac_chest_pain"] }),
    input({
      context: {
        ageYears: 28,
        pregnancy: "pregnant",
        reproductiveAgeFemale: true,
        spo2Scale2Enabled: false,
      },
      presentDiscriminators: ["obstetric_severe_htn"],
    }),
    input({ lifeThreatFlags: { cardiacArrestNoPulse: true } }),
  ];
  // Tokens that would indicate a dose / volume / specific agent (over-reach).
  const FORBIDDEN =
    /\b(\d+\s?(mg|mcg|µg|g|ml|mmol|units?|j|joules?)|mg\/kg|ml\/kg|30\s?ml|1\s?mg|glucagon|labetalol|nifedipine|magnesium sul(f|ph)ate|adrenaline|amiodarone|tranexamic|1:1:1)\b/i;

  it("no suggestion string contains a dose, volume, or named drug", () => {
    for (const s of scenarios) {
      for (const r of recommend(runTriage(s))) {
        expect(r.suggestion, `${r.code}: "${r.suggestion}"`).not.toMatch(FORBIDDEN);
      }
    }
  });

  it("every recommendation carries a non-empty source citation", () => {
    for (const s of scenarios) {
      for (const r of recommend(runTriage(s))) {
        expect(r.source.length, r.code).toBeGreaterThan(8);
      }
    }
  });

  it("every seam is live or pending_intent (nothing auto-executes implicitly)", () => {
    for (const s of scenarios) {
      for (const r of recommend(runTriage(s))) {
        expect(["live", "pending_intent"]).toContain(r.seam);
      }
    }
  });
});

/* ─── Disposition mapping + the down-disposition gate ─────────────── */

describe("recommend — disposition", () => {
  it("a life threat → resus disposition (live seam)", () => {
    const r = rec(input({ lifeThreatFlags: { cardiacArrestNoPulse: true } }));
    const d = r.find((x) => x.category === "disposition")!;
    expect(d.code).toBe("disp_l1");
    expect(d.seam).toBe("live");
  });

  it("a well, fully-assessed adult → a fast-track/standard down-stream is allowed", () => {
    const d = rec(input()).find((x) => x.category === "disposition")!;
    expect(d.code).toBe("disp_l4");
  });

  it("DOWN-GATE: an L4/L5 finding with a missing required vital is held at standard, never down-streamed", () => {
    // Omit SpO2 → incompleteVitals true, engine floors to L3 anyway; force assigned L4 to test the gate.
    const r = runTriage(input({ vitals: { ...input().vitals, spo2: null } }));
    const d = recommend(r, 4).find((x) => x.category === "disposition")!;
    expect(d.suggestion.toLowerCase()).toContain("hold at the standard");
  });
});

/* ─── Pathway flags ──────────────────────────────────────────────── */

describe("recommend — pathway flags (flag-only, pending-intent)", () => {
  it("infection + qSOFA≥2 → sepsis pathway flag", () => {
    const r = input({
      presentDiscriminators: ["sepsis_suspicion"],
      vitals: { ...input().vitals, respiratoryRate: 24, systolicBp: 95, consciousness: "V" },
    });
    expect(codes(r)).toContain("pathway_sepsis");
    expect(rec(r).find((x) => x.code === "pathway_sepsis")!.seam).toBe("pending_intent");
  });

  it("glucose > 15 → DKA SCREEN prompt (not a confirmed pathway)", () => {
    const r = rec(input({ vitals: { ...input().vitals, bloodGlucose: 22 } }));
    const dka = r.find((x) => x.code === "screen_dka")!;
    expect(dka.suggestion.toLowerCase()).toContain("check ketones");
  });

  it("focal neuro deficit → stroke pathway with onset-time + glucose prompt", () => {
    const r = rec(input({ presentDiscriminators: ["focal_neuro_deficit"] }));
    expect(r.find((x) => x.code === "pathway_stroke")).toBeTruthy();
    // and the glucose-mimic investigation prompt fires too
    expect(r.find((x) => x.code === "invx_glucose")).toBeTruthy();
  });
});

/* ─── Immediate measures (category-level) ────────────────────────── */

describe("recommend — immediate measures", () => {
  it("hypoxia (SpO₂ danger-zone) → oxygen-titration measure", () => {
    expect(codes(input({ vitals: { ...input().vitals, spo2: 90 } }))).toContain("measure_oxygen");
  });

  it("hypoglycaemia → swallow-gated glucose-correction prompt, no dose", () => {
    const g = rec(input({ vitals: { ...input().vitals, bloodGlucose: 2.0 } })).find(
      (x) => x.code === "measure_glucose_correction",
    )!;
    expect(g.suggestion.toLowerCase()).toContain("oral glucose if alert");
    expect(g.suggestion).not.toMatch(/\d+\s?(g|ml|mg)/i);
  });

  it("incomplete vitals → 'obtain missing vitals' measure naming the gaps", () => {
    const r = rec(input({ vitals: { ...input().vitals, spo2: null } }));
    const m = r.find((x) => x.code === "measure_complete_vitals")!;
    expect(m.suggestion.toLowerCase()).toContain("spo");
  });
});

/* ─── Recompute on override ──────────────────────────────────────── */

describe("recommend — recompute on acuity override", () => {
  it("suggestions follow the clinician's assigned level, not the computed one", () => {
    const r = runTriage(input()); // computed L4 (well adult)
    const asComputed = recommend(r).find((x) => x.category === "disposition")!;
    const asOverridden = recommend(r, 2).find((x) => x.category === "disposition")!;
    expect(asComputed.code).toBe("disp_l4");
    expect(asOverridden.code).toBe("disp_l2");
    expect(asOverridden.seam).toBe("live"); // L2 disposition is a live seam
  });

  it("escalation recomputes: overriding up to L1 yields the resus-team call", () => {
    expect(codes(input(), 1)).toContain("escalate_resus_team");
  });
});

/* ─── Monitoring cadence (NEWS2-banded) ──────────────────────────── */

describe("recommend — monitoring", () => {
  it("always emits exactly one monitoring suggestion", () => {
    expect(rec(input()).filter((x) => x.category === "monitoring")).toHaveLength(1);
  });

  it("high NEWS2 → continuous monitoring", () => {
    const m = rec(
      input({ vitals: { ...input().vitals, respiratoryRate: 30, spo2: 90, pulse: 130 } }),
    ).find((x) => x.category === "monitoring")!;
    expect(m.suggestion.toLowerCase()).toContain("continuous");
  });

  it("well adult (NEWS2 0) → routine 12-hourly", () => {
    const m = rec(input()).find((x) => x.category === "monitoring")!;
    expect(m.suggestion).toContain("12");
  });
});

/* ─── Provisional populations marked, not fabricated ─────────────── */

describe("recommend — paeds / obstetric provisional", () => {
  it("obstetric → routes to obstetric area, marked needs_cso_input", () => {
    const r = rec(
      input({
        context: {
          ageYears: 30,
          pregnancy: "pregnant",
          reproductiveAgeFemale: true,
          spo2Scale2Enabled: false,
        },
      }),
    );
    const route = r.find((x) => x.code === "route_obstetric")!;
    expect(route.confidence).toBe("needs_cso_input");
  });

  it("paediatric → routes to paeds area + manual PEWS, marked needs_cso_input", () => {
    const r = rec(
      input({
        context: {
          ageYears: 4,
          pregnancy: "not_pregnant",
          reproductiveAgeFemale: false,
          spo2Scale2Enabled: false,
        },
      }),
    );
    const route = r.find((x) => x.code === "route_paediatric")!;
    expect(route.suggestion.toLowerCase()).toContain("manual pews");
    expect(route.confidence).toBe("needs_cso_input");
  });
});

/* ─── Determinism ────────────────────────────────────────────────── */

describe("recommend — deterministic", () => {
  it("identical finding → identical recommendations", () => {
    const r = runTriage(input({ vitals: { ...input().vitals, respiratoryRate: 24, spo2: 92 } }));
    expect(recommend(r)).toEqual(recommend(r));
  });
});
