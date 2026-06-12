import type { EvfExam } from "@/lib/clerkship/exam/endo-vascular-foot";
import { describe, expect, it } from "vitest";

import {
  evfReasoningTokens,
  interpretAbpi,
  matchEvfPatterns,
  renderEvfProse,
  suggestFootRisk,
} from "@/lib/clerkship/exam/endo-vascular-foot";

describe("interpretAbpi — verified thresholds (NICE CG147 / Wounds UK)", () => {
  it("bands map per the cited thresholds", () => {
    expect(interpretAbpi(1.0)).toBe("normal");
    expect(interpretAbpi(0.8)).toBe("pad");
    expect(interpretAbpi(0.4)).toBe("critical");
    expect(interpretAbpi(1.5)).toBe("calcified");
    expect(interpretAbpi(undefined)).toBe(null);
  });
});

describe("suggestFootRisk — IWGDF 2023 (decision-support, clinician confirms)", () => {
  it("nothing examined → no suggestion", () => {
    expect(suggestFootRisk(undefined)).toBeNull();
    expect(suggestFootRisk({})).toBeNull();
  });

  it("no LOPS, no PAD → very low (IWGDF 0, annual)", () => {
    const r = suggestFootRisk({
      right: { monofilament: { hallux: true, "1st_mth": true }, pulsesPresent: true },
    });
    expect(r?.risk.key).toBe("very_low");
    expect(r?.risk.interval).toMatch(/year/);
  });

  it("LOPS alone (a monofilament site not felt) → low (IWGDF 1)", () => {
    const r = suggestFootRisk({ right: { monofilament: { hallux: false }, pulsesPresent: true } });
    expect(r?.risk.key).toBe("low");
  });

  it("LOPS + PAD → moderate (IWGDF 2)", () => {
    const r = suggestFootRisk({ right: { monofilament: { hallux: false }, pulsesPresent: false } });
    expect(r?.risk.key).toBe("moderate");
  });

  it("LOPS + prior ulcer → high (IWGDF 3)", () => {
    const r = suggestFootRisk({
      right: { monofilament: { hallux: false }, pulsesPresent: true },
      priorUlcerOrAmputation: true,
    });
    expect(r?.risk.key).toBe("high");
  });

  it("active ulcer / infection → active (urgent, not routine screening)", () => {
    const r = suggestFootRisk({ right: { infection: ["purulent discharge"] } });
    expect(r?.risk.key).toBe("active");
    expect(r?.risk.urgent).toBe(true);
  });

  it("end-stage renal disease + PAD → high", () => {
    const r = suggestFootRisk({ left: { pulsesPresent: false }, endStageRenal: true });
    expect(r?.risk.key).toBe("high");
  });
});

describe("matchEvfPatterns — clusters (decision-support, never auto-diagnoses)", () => {
  it("nothing → no pattern", () => {
    expect(matchEvfPatterns({})).toEqual([]);
  });

  it("hyperthyroid signs → hyperthyroidism", () => {
    const c: EvfExam = {
      findings: [
        {
          code: "thyroid_pulse_reflex",
          group: "thyroid_peripheral",
          display: "Pulse / reflexes",
          state: "present",
          values: ["tachycardia / AF"],
        },
      ],
    };
    expect(matchEvfPatterns(c).map((p) => p.key)).toContain("hyperthyroid");
  });

  it("fixed hard nodule + cervical nodes → thyroid malignancy (must-not-miss)", () => {
    const out = matchEvfPatterns({ thyroid: { gland: ["fixed / hard", "cervical nodes"] } });
    expect(out.find((p) => p.key === "malignant_thyroid")?.mustNotMiss).toBe(true);
  });

  it("≥2 of the 6 P's → acute limb ischaemia (emergency, ranked first)", () => {
    const out = matchEvfPatterns({
      vascular: { acuteIschaemia: ["Pain", "Pulselessness", "Pallor"] },
    });
    expect(out[0]?.key).toBe("acute_limb_ischaemia");
    expect(out[0]?.emergency).toBe(true);
  });

  it("ABPI <0.5 → critical ischaemia surfaced", () => {
    const out = matchEvfPatterns({ vascular: { abpi: { right: 0.4 } } });
    expect(out.map((p) => p.key)).toContain("critical_ischaemia");
  });

  it("foot infection + systemic sepsis → diabetic-foot sepsis (emergency)", () => {
    const out = matchEvfPatterns({
      foot: { right: { infection: ["purulent discharge"] }, systemicSepsis: true },
    });
    expect(out.find((p) => p.key === "diabetic_foot_sepsis")?.emergency).toBe(true);
  });

  it("warm swollen foot → acute Charcot (must-not-miss; mistaken for infection)", () => {
    const out = matchEvfPatterns({ foot: { left: { warmCharcot: true } } });
    expect(out.find((p) => p.key === "acute_charcot")?.mustNotMiss).toBe(true);
  });

  it("probe-to-bone → osteomyelitis", () => {
    const out = matchEvfPatterns({
      foot: { right: { infection: ["probe-to-bone (osteomyelitis)"] } },
    });
    expect(out.map((p) => p.key)).toContain("osteomyelitis");
  });

  it("LOPS + callus + pulses present → neuropathic foot pattern", () => {
    const out = matchEvfPatterns({
      foot: { right: { monofilament: { hallux: false }, pulsesPresent: true, skin: ["callus"] } },
    });
    expect(out.map((p) => p.key)).toContain("neuropathic_foot");
  });
});

describe("renderEvfProse + reasoning tokens", () => {
  it("renders ABPI interpretation + foot risk suggestion (confirm)", () => {
    const c: EvfExam = {
      vascular: { abpi: { right: 0.7 } },
      foot: { right: { monofilament: { hallux: false }, pulsesPresent: true } },
    };
    const s = renderEvfProse(c);
    expect(s).toContain("On examination of the thyroid, peripheral vasculature and feet,");
    expect(s).toContain("the right ABPI is 0.7, peripheral arterial disease");
    expect(s).toContain("the suggested diabetic-foot risk (to confirm) is IWGDF 1");
  });

  it("a confirmed risk reads as confirmed, not suggested", () => {
    const s = renderEvfProse({ foot: { confirmedRisk: "high", right: { pulsesPresent: false } } });
    expect(s).toContain("the confirmed diabetic-foot risk is IWGDF 3");
    expect(s).not.toContain("suggested");
  });

  it("empty → empty string", () => {
    expect(renderEvfProse({})).toBe("");
  });

  it("acute ischaemia feeds the differential", () => {
    const t = evfReasoningTokens({ vascular: { acuteIschaemia: ["Pain", "Pallor"] } });
    expect(t.positives.join(" ")).toMatch(/acute limb ischaemia/i);
  });
});
