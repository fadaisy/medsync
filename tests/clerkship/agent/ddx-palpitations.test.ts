import type { AgentInput, FeatureIndex } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { loadAgentPacks } from "@/lib/clerkship/agent/packs";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

const EMPTY: AgentInput = {
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: {} as AgentInput["bpStandard"],
  examGeneralFindings: [],
  examRespiratory: {},
  examCardiovascular: {},
  examAbdominal: {},
  examNeurological: {},
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
};

const maps = () => loadAgentPacks().rankedMaps;
const idx = (present: string[]): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set(["palpitations"]),
  provenance: new Map(),
});
const run = (present: string[]) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics: undefined });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("palpitations — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (RHD/valvular AF, sinus tachy, PE, long-QT)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(13);
    expect(byDx(out, "Rheumatic heart disease / valvular AF")).toBeTruthy();
    expect(byDx(out, "Sinus tachycardia secondary to systemic illness")).toBeTruthy();
    expect(byDx(out, "Pulmonary embolism")).toBeTruthy();
    expect(byDx(out, "Long-QT / channelopathy")).toBeTruthy();
  });

  // The decisive rhythm/onset axis: palp_* options use variant/bundled displays;
  // these assert the FEATURE_ALIASES bridge resolves them end-to-end.
  it("resolves rhythm/onset via real catalog displays (alias bridge)", () => {
    // "Irregularly irregular" matches palp_rhythm directly → AF leading
    const af = run(["irregularly irregular"]);
    expect(byDx(af, "AF with rapid ventricular response")?.tier).toBe("leading");
    // "Sudden on / off" (palp_onset) → "Sudden onset and offset" → SVT leading
    const svt = run(["sudden on / off", "regular fast"]);
    expect(byDx(svt, "Supraventricular tachycardia")?.tier).toBe("leading");
    // "Single skips / thumps" (palp_rhythm) → "Single skipped beats" → anxiety/ectopics
    const ect = run(["single skips / thumps"]);
    expect(byDx(ect, "Anxiety / ectopics")?.tier).not.toBe("ruled_down");
  });

  it("VT and AF-with-RVR stay UNCONDITIONAL must-not-miss", () => {
    const out = run([]);
    expect(byDx(out, "Ventricular tachycardia / malignant arrhythmia")?.suggests?.mustNotMiss).toBe(
      true,
    );
    expect(byDx(out, "AF with rapid ventricular response")?.suggests?.mustNotMiss).toBe(true);
  });

  it("PE pins on cancer (a major VTE risk now wired)", () => {
    const pe = "Pulmonary embolism";
    expect(byDx(run([]), pe)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["cancer"]), pe)?.suggests?.mustNotMiss).toBe(true);
  });

  it("syncope is a red flag: it does NOT boost SVT, and VT out-ranks SVT", () => {
    const SVT = "Supraventricular tachycardia";
    const VT = "Ventricular tachycardia / malignant arrhythmia";
    const svtNoSync = byDx(run(["regular fast"]), SVT)?.score;
    const svtWithSync = byDx(run(["regular fast", "syncope"]), SVT)?.score;
    // the "With syncope": -1 cancels the "With dizziness/syncope": +1 → syncope nets 0 on SVT
    expect(svtWithSync).toBe(svtNoSync);
    const out = run(["regular fast", "syncope"]);
    expect(byDx(out, VT)?.tier).toBe("leading");
    expect((byDx(out, VT)?.score ?? 0) > (byDx(out, SVT)?.score ?? 0)).toBe(true);
  });

  it("conditional pins: RHD (rheumatic), hypoglycaemia (diabetes), long-QT (FHx sudden death)", () => {
    const rhd = "Rheumatic heart disease / valvular AF";
    expect(byDx(run([]), rhd)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["rheumatic heart disease"]), rhd)?.suggests?.mustNotMiss).toBe(true);
    const hypo = "Hypoglycaemia";
    expect(byDx(run([]), hypo)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["diabetes"]), hypo)?.suggests?.mustNotMiss).toBe(true);
    const lqt = "Long-QT / channelopathy";
    expect(byDx(run([]), lqt)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["family history sudden death"]), lqt)?.suggests?.mustNotMiss).toBe(true);
  });
});
