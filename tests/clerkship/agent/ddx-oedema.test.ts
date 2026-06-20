import type { AgentInput, Demographics, FeatureIndex } from "@/lib/clerkship/agent/types";
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
  complaintCodes: new Set(["oedema"]),
  provenance: new Map(),
});
const run = (present: string[], demographics?: Demographics) =>
  suggestDiagnoses(EMPTY, idx(present), maps(), { ranked: true, demographics });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

describe("oedema — wired sourced weights", () => {
  it("loads the expanded differential incl. new dx (TB pericarditis, pre-eclampsia, HIVAN, filarial, angioedema)", () => {
    const out = run([]);
    expect(out.length).toBeGreaterThanOrEqual(13);
    expect(byDx(out, "TB pericarditis (effusive / constrictive)")).toBeTruthy();
    expect(byDx(out, "Pre-eclampsia / eclampsia")).toBeTruthy();
    expect(byDx(out, "HIV-associated nephropathy (HIVAN)")).toBeTruthy();
    expect(byDx(out, "Filarial lymphoedema (Wuchereria bancrofti)")).toBeTruthy();
    expect(byDx(out, "Angioedema (allergic / ACE-inhibitor)")).toBeTruthy();
  });

  // The oed_* catalog options are COMPOUND displays; these assert the FEATURE_ALIASES
  // bridge so the decisive laterality axis actually resolves end-to-end.
  it("resolves laterality via real compound catalog displays (alias bridge)", () => {
    // "unilateral, painful, warm calf" → DVT (Unilateral + Acute and painful)
    const dvt = run(["unilateral, painful, warm calf", "leg swelling"]);
    expect(byDx(dvt, "Deep vein thrombosis (to PE)")?.tier).toBe("leading");
    // "bilateral, pitting, dependent" + "orthopnoea / pnd" → heart failure
    const hf = run(["bilateral, pitting, dependent", "orthopnoea / pnd"]);
    expect(byDx(hf, "Heart failure")?.tier).toBe("leading");
    // "bilateral, pitting, periorbital too" + frothy urine → nephrotic
    const neph = run(["bilateral, pitting, periorbital too", "frothy urine"]);
    expect(byDx(neph, "Nephrotic syndrome")?.tier).toBe("leading");
  });

  it("DVT / cellulitis / heart failure stay UNCONDITIONAL must-not-miss", () => {
    const out = run([]);
    expect(byDx(out, "Deep vein thrombosis (to PE)")?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(out, "Cellulitis / necrotising fasciitis")?.suggests?.mustNotMiss).toBe(true);
    expect(byDx(out, "Heart failure")?.suggests?.mustNotMiss).toBe(true);
  });

  it("conditional pins: TB pericarditis (HIV/TB), pre-eclampsia (pregnancy)", () => {
    const tbp = "TB pericarditis (effusive / constrictive)";
    expect(byDx(run([]), tbp)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["hiv"]), tbp)?.suggests?.mustNotMiss).toBe(true);
    const pre = "Pre-eclampsia / eclampsia";
    expect(byDx(run([]), pre)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["oestrogen / pregnancy"]), pre)?.suggests?.mustNotMiss).toBe(true);
  });

  it("angioedema pins on acute laryngeal swelling — NOT on chronic periorbital puffiness", () => {
    const ang = "Angioedema (allergic / ACE-inhibitor)";
    expect(byDx(run([]), ang)?.suggests?.mustNotMiss).toBe(false);
    expect(byDx(run(["facial / laryngeal swelling"]), ang)?.suggests?.mustNotMiss).toBe(true);
    // a nephrotic-type chronic periorbital finding must NOT red-flag angioedema
    expect(byDx(run(["bilateral, pitting, periorbital too"]), ang)?.suggests?.mustNotMiss).toBe(
      false,
    );
  });

  it("pre-eclampsia is not pinned for a post-menopausal woman (no fixed female sexPrior)", () => {
    const pre = "Pre-eclampsia / eclampsia";
    const older: Demographics = { ageYears: 60, sex: "female" };
    // facial + bilateral oedema in a 60yo woman → must NOT be red-flagged pre-eclampsia
    expect(
      byDx(run(["bilateral, pitting, periorbital too"], older), pre)?.suggests?.mustNotMiss,
    ).toBe(false);
    // and renal cause out-ranks pre-eclampsia for that presentation
    const out = run(["bilateral, pitting, periorbital too", "frothy urine"], older);
    expect(byDx(out, "Nephrotic syndrome")?.tier).toBe("leading");
  });
});
