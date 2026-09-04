import type { RosCandidate } from "@/lib/clerkship/agent/ros-priority";
import type { FeatureIndex, MapDifferential, ReasoningMap } from "@/lib/clerkship/agent/types";
import { describe, expect, it } from "vitest";

import { loadAgentPacks } from "@/lib/clerkship/agent/packs";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";
import { rankRosQuestions, ROS_PRIORITY, rosLanes } from "@/lib/clerkship/agent/ros-priority";

const idx = (present: string[], complaints: string[] = []): FeatureIndex => ({
  presentDisplays: new Set(present.map((p) => p.toLowerCase())),
  deniedDisplays: new Set(),
  complaintCodes: new Set(complaints),
  provenance: new Map(),
});

const cand = (display: string, system = "general", mustNotMiss = false): RosCandidate => ({
  code: display.toLowerCase().replace(/\W+/g, "_"),
  display,
  system,
  mustNotMiss,
});

/** A synthetic differential — precise control, independent of clinical content. */
const dx = (dxName: string, p: Partial<MapDifferential> = {}): MapDifferential => ({
  dx: dxName,
  likelihood: "likely",
  ruleIn: [],
  ruleOut: [],
  supportingSymptoms: [],
  refutingSymptoms: [],
  riskFactors: [],
  ...p,
});

const map = (differential: MapDifferential[]): ReasoningMap[] => [
  {
    code: "probe",
    display: "Probe",
    triggerCodes: ["probe"],
    associated: [],
    redFlags: [],
    examTargets: [],
    differential,
  },
];

const gainOf = (qs: { display: string; gain: number }[], display: string) =>
  qs.find((q) => q.display === display)?.gain ?? -1;

/* ── the engine stays silent unless it has something to reason with ───────── */

describe("rankRosQuestions — silence is the default", () => {
  it("says nothing when no reasoning map matches the complaint", () => {
    const out = rankRosQuestions({
      index: idx(["cough"], []),
      maps: loadAgentPacks().rankedMaps,
      candidates: [cand("Fever"), cand("Night sweats")],
    });
    expect(out.active).toBe(false);
    expect(out.questions).toEqual([]);
  });

  // Discrimination needs something to discriminate BETWEEN. With one hypothesis
  // every question can only confirm it — exactly the anchoring the ADR forbids.
  it("says nothing when there is only ONE live hypothesis", () => {
    const out = rankRosQuestions({
      index: idx([], ["probe"]),
      maps: map([dx("Only one", { basePrior: 5, featureWeights: { "token a": 4 } })]),
      candidates: [cand("Token a")],
    });
    expect(out.active).toBe(false);
  });

  it("never invents a reason: a screen no weight references scores zero", () => {
    const out = rankRosQuestions({
      index: idx([], ["probe"]),
      maps: map([
        dx("Alpha", { basePrior: 5, featureWeights: { "token a": 4 } }),
        dx("Beta", { basePrior: 4, featureWeights: { "token b": 4 } }),
      ]),
      candidates: [cand("Token a"), cand("Nothing references this")],
    });
    const q = out.questions.find((x) => x.display === "Nothing references this");
    expect(q?.gain).toBe(0);
    expect(q?.why).toBe("");
    expect(q?.raises).toEqual([]);
  });
});

/* ── the design test: discrimination, NOT confirmation (ADR 0065) ─────────── */

describe("rankRosQuestions — anti-anchoring", () => {
  const anchorMaps = map([
    // Alpha leads. "Token confirm" ONLY lifts Alpha — the anchoring move.
    dx("Alpha", { basePrior: 6, featureWeights: { "token confirm": 8 } }),
    // "Token split" lifts Beta past Alpha — the discriminating move.
    dx("Beta", { basePrior: 4, featureWeights: { "token split": 4 } }),
    dx("Gamma", { basePrior: 3 }),
  ]);

  it("damps a question that only entrenches the leading hypothesis", () => {
    const { questions } = rankRosQuestions({
      index: idx([], ["probe"]),
      maps: anchorMaps,
      candidates: [cand("Token confirm"), cand("Token split")],
    });
    const confirm = questions.find((q) => q.display === "Token confirm")!;
    expect(confirm.anchored).toBe(true);
    // Twice the raw lift, yet it must still rank BELOW the separating question.
    expect(confirm.gain).toBeLessThan(gainOf(questions, "Token split"));
    expect(confirm.gain).toBeCloseTo(8 * ROS_PRIORITY.ANCHOR_DAMP, 5);
  });

  it("rewards a question that changes the leading hypothesis", () => {
    const { questions } = rankRosQuestions({
      index: idx([], ["probe"]),
      maps: anchorMaps,
      candidates: [cand("Token split")],
    });
    const split = questions[0]!;
    expect(split.flipsLeader).toBe(true);
    expect(split.anchored).toBe(false);
    expect(split.why).toBe("Separates Beta from Alpha");
  });

  // The whole premise: gain measures SEPARATION, not magnitude.
  it("scores a uniform lift at zero, however large", () => {
    const { questions } = rankRosQuestions({
      index: idx([], ["probe"]),
      maps: map([
        dx("Alpha", { basePrior: 6, featureWeights: { "lifts everything": 9 } }),
        dx("Beta", { basePrior: 4, featureWeights: { "lifts everything": 9 } }),
        dx("Gamma", { basePrior: 3, featureWeights: { "lifts everything": 9 } }),
      ]),
      candidates: [cand("Lifts everything")],
    });
    expect(questions[0]!.gain).toBe(0);
  });

  it("a refuting feature discriminates too — it argues a hypothesis down", () => {
    const { questions } = rankRosQuestions({
      index: idx([], ["probe"]),
      maps: map([
        dx("Alpha", { basePrior: 6, featureWeights: { "argues against alpha": -4 } }),
        dx("Beta", { basePrior: 5 }),
        dx("Gamma", { basePrior: 3 }),
      ]),
      candidates: [cand("Argues against alpha")],
    });
    const q = questions[0]!;
    expect(q.gain).toBeGreaterThan(0);
    expect(q.lowers).toEqual(["Alpha"]);
    expect(q.flipsLeader).toBe(true);
  });
});

/* ── safety is never ranked out, never damped, never windowed ─────────────── */

describe("rankRosQuestions — must-not-miss safety", () => {
  // basePrior -1 forces Delta OUT of the contender window, proving the pin scan
  // runs over the WHOLE differential rather than only the ranked candidates.
  const pinMaps = map([
    dx("Alpha", { basePrior: 6, featureWeights: { "token a": 3 } }),
    dx("Beta", { basePrior: 4 }),
    dx("Delta", {
      likelihood: "must_not_miss",
      basePrior: -1,
      pinWhen: { featureAny: ["token gate"] },
    }),
  ]);

  it("scores a question that would satisfy an unpinned must-not-miss gate", () => {
    const { questions } = rankRosQuestions({
      index: idx([], ["probe"]),
      maps: pinMaps,
      candidates: [cand("Token gate")],
    });
    const q = questions[0]!;
    expect(q.opensPin).toEqual(["Delta"]);
    expect(q.gain).toBeGreaterThanOrEqual(ROS_PRIORITY.OPENS_PIN);
    expect(q.why).toBe("Would raise Delta — a must-not-miss");
  });

  it("the pin bonus survives the anti-anchoring damp", () => {
    const { questions } = rankRosQuestions({
      index: idx([], ["probe"]),
      maps: map([
        // "Token gate" both entrenches the leader AND opens a must-not-miss gate.
        dx("Alpha", { basePrior: 6, featureWeights: { "token gate": 4 } }),
        dx("Beta", { basePrior: 4 }),
        dx("Delta", {
          likelihood: "must_not_miss",
          basePrior: -1,
          pinWhen: { featureAny: ["token gate"] },
        }),
      ]),
      candidates: [cand("Token gate")],
    });
    const q = questions[0]!;
    expect(q.anchored).toBe(true);
    // damped separation (4 × 0.35) PLUS the undamped safety bonus.
    expect(q.gain).toBeCloseTo(4 * ROS_PRIORITY.ANCHOR_DAMP + ROS_PRIORITY.OPENS_PIN, 5);
  });

  it("does not re-open a gate that is already satisfied", () => {
    const { questions } = rankRosQuestions({
      index: idx(["token gate"], ["probe"]),
      maps: pinMaps,
      candidates: [cand("Token gate")],
    });
    expect(questions[0]!.opensPin).toEqual([]);
  });
});

/* ── the alias bridge is the only vocabulary this may use ─────────────────── */

describe("rankRosQuestions — vocabulary", () => {
  // The catalog says "Breathlessness"; the maps say "Dyspnoea". The curated
  // alias table is the ONLY bridge — no fuzzy matching is introduced here.
  it("matches a catalog display to a map token through FEATURE_ALIASES", () => {
    const { questions } = rankRosQuestions({
      index: idx([], ["probe"]),
      maps: map([
        dx("Alpha", { basePrior: 6 }),
        dx("Beta", { basePrior: 4, featureWeights: { Dyspnoea: 5 } }),
        dx("Gamma", { basePrior: 3 }),
      ]),
      candidates: [cand("Breathlessness")],
    });
    expect(questions[0]!.gain).toBeGreaterThan(0);
    expect(questions[0]!.raises).toEqual(["Beta"]);
  });

  it("ignores a screen whose answer is already recorded", () => {
    const { questions } = rankRosQuestions({
      index: idx(["token a"], ["probe"]),
      maps: map([
        dx("Alpha", { basePrior: 6, featureWeights: { "token a": 4 } }),
        dx("Beta", { basePrior: 4 }),
      ]),
      candidates: [cand("Token a")],
    });
    expect(questions[0]!.gain).toBe(0);
  });
});

/* ── against the real, CSO-approved packs ─────────────────────────────────── */

const REAL: RosCandidate[] = [
  cand("Fever"),
  cand("Night sweats"),
  cand("Wheeze", "respiratory"),
  cand("Breathlessness", "respiratory"),
  cand("Haemoptysis", "respiratory", true),
  cand("Orthopnoea", "cardiovascular"),
  cand("Chest pain", "cardiovascular", true),
  cand("Ankle swelling", "cardiovascular"),
  cand("Headache", "neurological", true),
  cand("Rash", "skin", true),
  cand("Low mood", "psychiatric"),
  cand("Diarrhoea", "gastrointestinal"),
];

describe("rankRosQuestions — real packs, chronic cough", () => {
  const maps = loadAgentPacks().rankedMaps;
  const coughIdx = idx(["cough", "chronic (>8 weeks)"], ["cough"]);
  const run = () => rankRosQuestions({ index: coughIdx, maps, candidates: REAL });

  it("surfaces the TB-discriminating questions ahead of the irrelevant ones", () => {
    const { active, questions } = run();
    expect(active).toBe(true);
    const ranked = questions.filter((q) => q.gain > 0).sort((a, b) => b.gain - a.gain);
    expect(ranked.slice(0, 3).map((q) => q.display)).toContain("Night sweats");
    expect(ranked.slice(0, 3).map((q) => q.display)).toContain("Haemoptysis");
    // nothing in this differential turns on a rash or a headache
    expect(gainOf(questions, "Rash")).toBe(0);
    expect(gainOf(questions, "Headache")).toBe(0);
  });

  it("every 'why' names diagnoses that are actually in the live differential", () => {
    const live = new Set(
      suggestDiagnoses({} as never, coughIdx, maps, { ranked: true }).map(
        (i) => i.suggests?.dx ?? "",
      ),
    );
    for (const q of run().questions.filter((x) => x.gain > 0)) {
      for (const name of [...q.raises, ...q.lowers, ...q.separatesFrom, ...q.opensPin]) {
        expect(live.has(name), `${q.display} → ${name}`).toBe(true);
      }
    }
  });

  // The drift guard between this module and reducers/diagnosis.ts: if the ranker
  // says an answer flips the leader, the rail must actually re-order that way.
  it("a flipsLeader prediction really does change the rail's leading diagnosis", () => {
    const leaderOf = (i: FeatureIndex) =>
      suggestDiagnoses({} as never, i, maps, { ranked: true })
        .filter((x) => x.tier === "leading")
        .map((x) => x.suggests?.dx)[0];
    const flipper = run().questions.find((q) => q.flipsLeader && !q.mustNotMiss);
    if (!flipper) return; // nothing to assert on this input
    const after = idx(
      [...coughIdx.presentDisplays, flipper.display.toLowerCase()],
      [...coughIdx.complaintCodes],
    );
    expect(leaderOf(after)).not.toBe(leaderOf(coughIdx));
  });

  it("is deterministic", () => {
    expect(run().questions).toEqual(run().questions);
  });

  it("invents no candidates — output is a permutation of the input", () => {
    const { questions } = run();
    expect(questions.map((q) => q.code).sort()).toEqual(REAL.map((c) => c.code).sort());
  });
});

/* ── lanes: an attention layer, never a filter ────────────────────────────── */

describe("rosLanes", () => {
  const maps = loadAgentPacks().rankedMaps;
  const coughIdx = idx(["cough", "chronic (>8 weeks)"], ["cough"]);

  it("keeps EVERY must-not-miss screen, including the ones the engine ignores", () => {
    const lanes = rosLanes({ index: coughIdx, maps, candidates: REAL });
    const flags = REAL.filter((c) => c.mustNotMiss).map((c) => c.code);
    expect(lanes.redFlags.map((q) => q.code).sort()).toEqual(flags.sort());
    // ordered by relevance, but the irrelevant ones are still there
    expect(lanes.redFlags[0]!.display).toBe("Haemoptysis");
    expect(lanes.redFlags.some((q) => q.gain === 0)).toBe(true);
  });

  it("never puts a red flag in the ranked lane (one row per question)", () => {
    const lanes = rosLanes({ index: coughIdx, maps, candidates: REAL });
    expect(lanes.discriminating.every((q) => !q.mustNotMiss)).toBe(true);
    expect(lanes.outOfFocus.every((q) => !q.mustNotMiss)).toBe(true);
  });

  it("caps the ranked lane but not the safety lane", () => {
    const lanes = rosLanes({ index: coughIdx, maps, candidates: REAL, limit: 2 });
    expect(lanes.discriminating).toHaveLength(2);
    expect(lanes.redFlags.length).toBeGreaterThan(2);
  });

  it("respects the clinician's focus for ranked questions, and reports what it held back", () => {
    const lanes = rosLanes({
      index: coughIdx,
      maps,
      candidates: REAL,
      inScope: (s) => s === "general",
    });
    expect(lanes.discriminating.every((q) => q.system === "general")).toBe(true);
    expect(lanes.outOfFocus.length).toBeGreaterThan(0);
    // …but a focused sweep must never hide a red flag
    expect(lanes.redFlags.some((q) => q.system !== "general")).toBe(true);
  });

  // Graceful degradation: ranking gated off (or nothing captured yet) still gives
  // a working safety lane, and the sweep behind it is completely untouched.
  it("degrades to a complete safety lane when the agent has nothing to say", () => {
    const lanes = rosLanes({ index: idx([]), maps: [], candidates: REAL });
    expect(lanes.active).toBe(false);
    expect(lanes.discriminating).toEqual([]);
    expect(lanes.redFlags).toHaveLength(REAL.filter((c) => c.mustNotMiss).length);
    expect(lanes.redFlags.every((q) => q.gain === 0 && q.why === "")).toBe(true);
  });
});
