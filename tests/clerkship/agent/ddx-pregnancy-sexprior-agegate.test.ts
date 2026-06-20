import type { AgentInput, Demographics, FeatureIndex } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { loadAgentPacks } from "@/lib/clerkship/agent/packs";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";

// Pregnancy-exclusive must-not-miss dx (ectopic, pre-eclampsia) carry a fixed
// female sexPrior to surface them for women — but the engine applies sexPrior to
// the SCORE unconditionally (pinWhen gates only the red pin). An age-penalty
// agePrior cancels that boost post-menopause so they are NOT mis-ranked for older
// women, while staying elevated for reproductive-age women. (Discovered via the
// oedema adversarial-verification pass; the engine has no age×sex prior.)

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
const idx = (complaint: string, present: string[]): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set([complaint]),
  provenance: new Map(),
});
const run = (complaint: string, present: string[], demographics?: Demographics) =>
  suggestDiagnoses(EMPTY, idx(complaint, present), maps(), { ranked: true, demographics });
const byDx = (out: ReturnType<typeof run>, dx: string) => out.find((i) => i.suggests?.dx === dx);

const young: Demographics = { ageYears: 30, sex: "female" };
const older: Demographics = { ageYears: 60, sex: "female" };

describe("pregnancy-exclusive dx — age-gated female sexPrior", () => {
  it("ectopic (abdominal pain): elevated for a young woman, de-ranked for a post-menopausal woman", () => {
    const dx = "Ectopic pregnancy";
    const y = byDx(run("abdominal_pain", ["syncope"], young), dx)?.tier;
    const o = byDx(run("abdominal_pain", ["syncope"], older), dx)?.tier;
    expect(y).toBe("leading"); // base1 + female3 + syncope2 = 6
    expect(o).toBe("consider"); // base1 + female3 - age3 + syncope2 = 3
  });

  it("pre-eclampsia (headache): elevated for a young woman, de-ranked for a post-menopausal woman", () => {
    const dx = "Pre-eclampsia / eclampsia";
    const y = byDx(run("headache", ["visual disturbance"], young), dx)?.tier;
    const o = byDx(run("headache", ["visual disturbance"], older), dx)?.tier;
    expect(y).toBe("leading"); // base1 + female3 + visual3 = 7
    expect(o).toBe("consider"); // base1 + female3 - age3 + visual3 = 4
  });
});
