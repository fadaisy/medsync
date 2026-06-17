import type { AgentInput } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { normalizeFeature } from "@/lib/clerkship/agent/normalize";
import { loadAgentPacks } from "@/lib/clerkship/agent/packs";

/**
 * Guard against the silent-no-fire class: a sign-pack `when.match` token that the
 * structured-exam indexer (or a finding value chip) never actually emits would
 * sit in the pack looking active but never fire. We build a MAXIMAL-abnormal
 * exam (every structured sign + the relevant general findings) and assert every
 * sign-pack match token resolves against that index.
 */
const MAX: AgentInput = {
  hpcItems: [],
  ros: [],
  pmhItems: [],
  pmhScreen: {},
  examVitals: {},
  bpStandard: "who_esc",
  examGeneralFindings: [
    { code: "nails", group: "hands", display: "Nails", state: "present", values: ["clubbing"] },
    {
      code: "eyes",
      group: "head",
      display: "Eyes",
      state: "present",
      values: ["conjunctival pallor", "scleral icterus"],
    },
    {
      code: "obvious_abnormalities",
      group: "general",
      display: "Obvious abnormalities",
      state: "present",
      values: ["jaundice"],
    },
    {
      code: "cervical_nodes",
      group: "nodes",
      display: "Cervical nodes",
      state: "present",
      values: ["enlarged"],
    },
  ],
  examRespiratory: {
    percussion: { z1: "dull", z2: "stony_dull", z3: "hyper_resonant" },
    breathSounds: { z1: "bronchial", z2: "absent", z3: "reduced" },
    vocalResonance: { z1: "increased" },
    expansion: { right: "reduced" },
    trachea: "deviated_right",
  } as AgentInput["examRespiratory"],
  examCardiovascular: {
    pulseRhythm: "irregularly_irregular",
    jvp: "raised",
    apexLocation: "displaced",
    apexCharacter: "heaving",
    s1: "loud",
    murmurs: [{ id: "m", timing: "pansystolic" }],
  } as AgentInput["examCardiovascular"],
  examAbdominal: {
    tenderness: { rif: "tender" },
    guarding: { rif: "involuntary" },
    rigidity: "board_like",
    rebound: true,
    liver: { palpable: true },
    spleen: { palpable: true },
    shiftingDullness: true,
    bowelSounds: "absent",
    aortaExpansile: true,
  } as AgentInput["examAbdominal"],
  examNeurological: {
    tone: { r_arm: "spastic" },
    power: { r_arm: 3 },
    reflexes: { r_arm: "absent" },
    plantar: { right: "up" },
    sensoryPattern: "sensory_level",
    wasting: true,
    fasciculations: true,
    meningism: ["neck stiffness"],
    findings: [
      {
        code: "cn_vii",
        group: "neuro_cn",
        display: "VII — facial",
        state: "present",
        values: ["UMN (forehead spared)"],
      },
    ],
  } as AgentInput["examNeurological"],
  examMusculoskeletal: {},
  examEndoVascularFoot: {},
};

describe("sign-pack match-token coverage", () => {
  it("every sign-pack when.match token is emittable by a maximal exam (no silent no-fire)", () => {
    const idx = buildFeatureIndex(MAX);
    const packs = loadAgentPacks();
    const tokens = new Set(
      [...packs.dependencies, ...packs.incompatibilities].flatMap((r) => r.when.match ?? []),
    );
    expect(tokens.size).toBeGreaterThan(0);
    const missing = [...tokens].filter((t) => !idx.presentDisplays.has(normalizeFeature(t)));
    expect(missing).toEqual([]);
  });
});
