/**
 * ROS question prioritisation — pure, client-safe, decision-support only.
 *
 * The Review of Systems is an 81-symptom screening sweep. It has always asked the
 * SAME questions in the SAME order regardless of who the patient is, while the
 * ranking engine sitting beside it already holds a live, weighted differential.
 * This module joins the two: for every still-unanswered screen it simulates the
 * answer "present", re-scores the live hypotheses, and measures how much the
 * differential would MOVE APART.
 *
 * The safety spine (ADR 0065) is anti-anchoring — "always plural, never narrow".
 * A naive information-gain ranking does the opposite: it walks the clinician
 * straight down the leading hypothesis. So the gain here deliberately measures
 * DISCRIMINATION BETWEEN hypotheses, not confirmation of the front-runner:
 *
 *   • `separation` is the spread of the deltas. A question that lifts every live
 *     hypothesis by the same amount separates nothing and scores ZERO, however
 *     large the lift.
 *   • reordering the top of the list is what actually changes the next decision,
 *     so a changed leader and new entrants score directly.
 *   • a question whose only effect is to raise the current leader is explicitly
 *     DAMPED (`ANCHOR_DAMP`) — that is the anchoring move, and it is the design
 *     test this module must keep passing.
 *   • must-not-miss safety is never ranked, never damped and never windowed: a
 *     question that would satisfy an unpinned must-not-miss gate is scored across
 *     the WHOLE differential, and the caller shows every red-flag screen whatever
 *     its gain (`RosLanes.redFlags`).
 *
 * This is an ATTENTION layer, never a filter: it re-orders what to ask next and
 * removes nothing from the sweep. ADR 0063's coverage honesty is untouched —
 * coverage is computed from what was actually answered, never from what was
 * offered, and not-reviewed is still never auto-marked negative.
 */
import type {
  Demographics,
  DxTier,
  FeatureIndex,
  MapDifferential,
  ReasoningMap,
} from "@/lib/clerkship/agent/types";

import { FEATURE_ALIASES } from "@/lib/clerkship/agent/aliases";
import { normalizeFeature } from "@/lib/clerkship/agent/normalize";
import { matchedMaps } from "@/lib/clerkship/agent/reducers/maps";
import {
  dedupeWeights,
  deriveWeights,
  pinSatisfied,
  REINFORCE,
  scoreDifferential,
  tierOf,
} from "@/lib/clerkship/agent/weights";

/** Calibration constants — NOT clinical content. Tuned in validation. */
export const ROS_PRIORITY = {
  /** How many live hypotheses form the discrimination window. */
  CONTENDERS: 8,
  /** Ranks watched for "would this reorder the top of the list". */
  TOP: 3,
  /** A changed leading hypothesis — the strongest single signal. */
  LEADER_FLIP: 3,
  /** Each hypothesis that would climb into the top ranks. */
  ENTRANT: 1,
  /** Answering "present" would satisfy an unpinned must-not-miss gate. */
  OPENS_PIN: 4,
  /** Anti-anchoring: the factor applied to a confirm-the-leader question. */
  ANCHOR_DAMP: 0.35,
  /** Below this a question is not worth pulling out of the sweep. */
  MIN_GAIN: 0.5,
  /** Default cap on the discriminating lane (the sweep still holds everything). */
  LANE_LIMIT: 6,
} as const;

/** One still-unanswered ROS screening symptom offered to the ranker. */
export interface RosCandidate {
  code: string;
  display: string;
  system: string;
  mustNotMiss: boolean;
}

/** A prioritised ROS question + the honest reason it is being asked. */
export interface RosQuestion extends RosCandidate {
  /** Discrimination gain. 0 = the live differential is indifferent to the answer. */
  gain: number;
  /** Hypotheses that would RISE on "present" (strongest first, max 2). */
  raises: string[];
  /** Hypotheses that would FALL on "present" (strongest first, max 2). */
  lowers: string[];
  /** Live contenders the answer would leave behind — the "separates … from …". */
  separatesFrom: string[];
  /** Must-not-miss diagnoses whose pin gate this answer would satisfy. */
  opensPin: string[];
  /** Would "present" change the leading hypothesis? */
  flipsLeader: boolean;
  /** True when the gain was damped for only entrenching the current leader. */
  anchored: boolean;
  /** Short clinician-facing reason. Empty when the engine has nothing to say. */
  why: string;
}

export interface RosLanes {
  /** True when a live differential (≥2 contenders) was available to reason from. */
  active: boolean;
  /** Ranked questions worth asking next, in scope, capped. Never red flags. */
  discriminating: RosQuestion[];
  /** Discriminating questions the clinician's focus currently excludes. */
  outOfFocus: RosQuestion[];
  /** EVERY unanswered must-not-miss screen, relevance-ordered. Never capped. */
  redFlags: RosQuestion[];
}

/* ── internals ───────────────────────────────────────────────────────────── */

const dxKey = (d: MapDifferential) => d.dxCode ?? normalizeFeature(d.dx);

interface Contender {
  key: string;
  dx: string;
  d: MapDifferential;
  /** Score including the shared-complaint reinforcement (mirrors the rail). */
  score: number;
  tier: DxTier;
  pinned: boolean;
  /** The shared-complaint bonus baked into `score` — re-applied when simulating. */
  reinforce: number;
}

/** A feature index with one extra PRESENT token — the simulated "yes" answer. */
function withToken(idx: FeatureIndex, token: string): FeatureIndex {
  return {
    presentDisplays: new Set([...idx.presentDisplays, token]),
    deniedDisplays: idx.deniedDisplays,
    complaintCodes: idx.complaintCodes,
    provenance: idx.provenance,
  };
}

/**
 * The catalog tokens that could newly satisfy any of `mapTokens` — the exact
 * reverse of `featurePresent`'s direct-hit + alias lookup. Used ONLY to skip
 * candidates no rule can possibly move, so it can never change a result.
 */
function reachableTokens(mapTokens: Iterable<string>): Set<string> {
  const out = new Set<string>();
  for (const raw of mapTokens) {
    const n = normalizeFeature(raw);
    if (!n) continue;
    out.add(n);
    for (const a of FEATURE_ALIASES[n] ?? []) out.add(normalizeFeature(a));
  }
  return out;
}

/**
 * The live hypothesis window: every applicable differential, scored exactly as
 * the rail scores it (shared-dx reinforcement included, so the leader identified
 * here is the leader the clinician can see), ruled-down entries dropped unless
 * they are pinned must-not-miss, best first, capped at CONTENDERS.
 * Mirrors `suggestRanked` in reducers/diagnosis.ts — the drift is guarded by a test.
 */
function liveContenders(
  idx: FeatureIndex,
  maps: ReasoningMap[],
  demographics: Demographics | undefined,
): { contenders: Contender[]; all: MapDifferential[] } {
  const matched = matchedMaps(idx, maps);
  const idCount = new Map<string, number>();
  for (const m of matched)
    for (const d of m.differential) {
      const k = dxKey(d);
      idCount.set(k, (idCount.get(k) ?? 0) + 1);
    }

  const seen = new Set<string>();
  const all: MapDifferential[] = [];
  const scored: Contender[] = [];
  for (const m of matched) {
    for (const d of m.differential) {
      const k = dxKey(d);
      if (seen.has(k)) continue;
      seen.add(k);
      all.push(d);
      const reinforce = (idCount.get(k) ?? 0) >= 2 ? REINFORCE : 0;
      const score = scoreDifferential(d, idx, demographics).score + reinforce;
      const pinned = d.likelihood === "must_not_miss" && pinSatisfied(d.pinWhen, idx);
      scored.push({ key: k, dx: d.dx, d, score, tier: tierOf(score), pinned, reinforce });
    }
  }

  const contenders = scored
    .filter((c) => c.tier !== "ruled_down" || c.pinned)
    .map((c, i) => ({ c, i }))
    .sort((a, b) => b.c.score - a.c.score || a.i - b.i)
    .slice(0, ROS_PRIORITY.CONTENDERS)
    .map((x) => x.c);

  return { contenders, all };
}

/** Score a contender in the simulated world, keeping its reinforcement offset. */
function rescore(c: Contender, idx2: FeatureIndex, demographics: Demographics | undefined): number {
  return scoreDifferential(c.d, idx2, demographics).score + c.reinforce;
}

const inert = (c: RosCandidate): RosQuestion => ({
  ...c,
  gain: 0,
  raises: [],
  lowers: [],
  separatesFrom: [],
  opensPin: [],
  flipsLeader: false,
  anchored: false,
  why: "",
});

function phrase(q: {
  raises: string[];
  lowers: string[];
  separatesFrom: string[];
  opensPin: string[];
  flipsLeader: boolean;
  leaderYes: string | undefined;
}): string {
  const [pin] = q.opensPin;
  if (pin) return `Would raise ${pin} — a must-not-miss`;
  const [up] = q.raises;
  const [down] = q.lowers;
  const [aside] = q.separatesFrom;
  if (up && down) return `Separates ${up} from ${down}`;
  if (up && aside) return `Separates ${up} from ${aside}`;
  if (q.flipsLeader && q.leaderYes) return `Would make ${q.leaderYes} the leading diagnosis`;
  if (up) return `Raises ${up}`;
  if (down) return `Argues against ${down}`;
  return "";
}

/* ── the ranker ──────────────────────────────────────────────────────────── */

/**
 * Score every candidate by how much the answer would move the live differential
 * apart. Returns ALL candidates the engine has something to say about (gain ≥
 * MIN_GAIN), best first — must-not-miss screens included, so the caller can order
 * the red-flag lane by relevance without ever dropping one.
 */
export function rankRosQuestions(args: {
  index: FeatureIndex;
  maps: ReasoningMap[];
  candidates: readonly RosCandidate[];
  demographics?: Demographics;
}): { active: boolean; questions: RosQuestion[] } {
  const { index: idx, maps, candidates, demographics } = args;
  const { contenders, all } = liveContenders(idx, maps, demographics);

  // Discrimination needs something to discriminate BETWEEN. One hypothesis (or
  // none) means every question can only confirm — so the engine stays silent and
  // the sweep is served unchanged.
  if (contenders.length < 2) return { active: false, questions: [] };

  // Unpinned must-not-miss gates — scanned across the WHOLE differential, never
  // just the contender window: safety is not subject to the ranking cut.
  const openGates = all.filter(
    (d) => d.likelihood === "must_not_miss" && !pinSatisfied(d.pinWhen, idx),
  );

  // Performance-only prefilter (provably result-preserving): the catalog tokens
  // any contender weight or open pin gate could newly match.
  const weightTokens: string[] = [];
  for (const c of contenders) {
    const w = deriveWeights(c.d);
    for (const { token } of dedupeWeights(w.featureWeights)) weightTokens.push(token);
    for (const { token } of dedupeWeights(w.riskWeights)) weightTokens.push(token);
  }
  for (const d of openGates)
    weightTokens.push(...(d.pinWhen?.riskAny ?? []), ...(d.pinWhen?.featureAny ?? []));
  const reachable = reachableTokens(weightTokens);

  const leaderNow = contenders[0]!;
  const topNow = new Set(contenders.slice(0, ROS_PRIORITY.TOP).map((c) => c.key));

  const questions: RosQuestion[] = [];
  for (const cand of candidates) {
    const token = normalizeFeature(cand.display);
    if (!token || idx.presentDisplays.has(token) || !reachable.has(token)) {
      questions.push(inert(cand));
      continue;
    }
    const idx2 = withToken(idx, token);

    const moved = contenders.map((c) => ({
      c,
      delta: rescore(c, idx2, demographics) - c.score,
    }));
    const deltas = moved.map((m) => m.delta);
    const maxD = Math.max(...deltas);
    const minD = Math.min(...deltas);
    const separation = maxD - minD;

    const yes = moved
      .map((m, i) => ({ m, i }))
      .sort((a, b) => b.m.c.score + b.m.delta - (a.m.c.score + a.m.delta) || a.i - b.i)
      .map((x) => x.m);
    const leaderYes = yes[0]!.c;
    const flipsLeader = leaderYes.key !== leaderNow.key;
    const entrants = yes.slice(0, ROS_PRIORITY.TOP).filter((m) => !topNow.has(m.c.key)).length;

    // Anti-anchoring (the design test): the ONLY thing this question does is push
    // the hypothesis already in front further in front. It does not help choose.
    const movers = moved.filter((m) => m.delta !== 0);
    const anchored =
      movers.length > 0 &&
      movers.every((m) => m.delta > 0) &&
      (moved.find((m) => m.c.key === leaderNow.key)?.delta ?? 0) === maxD &&
      !flipsLeader &&
      entrants === 0;

    const opensPin = openGates.filter((d) => pinSatisfied(d.pinWhen, idx2)).map((d) => d.dx);

    const raw =
      separation +
      ROS_PRIORITY.LEADER_FLIP * (flipsLeader ? 1 : 0) +
      ROS_PRIORITY.ENTRANT * entrants;
    // The pin bonus is added AFTER the damp — safety is never damped.
    const gain =
      raw * (anchored ? ROS_PRIORITY.ANCHOR_DAMP : 1) +
      (opensPin.length ? ROS_PRIORITY.OPENS_PIN : 0);

    const raises = movers
      .filter((m) => m.delta > 0)
      .sort((a, b) => b.delta - a.delta)
      .map((m) => m.c.dx)
      .slice(0, 2);
    const lowers = movers
      .filter((m) => m.delta < 0)
      .sort((a, b) => a.delta - b.delta)
      .map((m) => m.c.dx)
      .slice(0, 2);
    const separatesFrom = moved
      .filter((m) => m.delta === 0)
      .map((m) => m.c.dx)
      .slice(0, 2);

    questions.push({
      ...cand,
      gain: gain < ROS_PRIORITY.MIN_GAIN ? 0 : Math.round(gain * 100) / 100,
      raises,
      lowers,
      separatesFrom,
      opensPin,
      flipsLeader,
      anchored,
      why:
        gain < ROS_PRIORITY.MIN_GAIN
          ? ""
          : phrase({
              raises,
              lowers,
              separatesFrom,
              opensPin,
              flipsLeader,
              leaderYes: leaderYes.dx,
            }),
    });
  }

  return { active: true, questions };
}

/**
 * Split the candidates into the three lanes the ROS renders. Pure.
 *
 * `redFlags` carries EVERY unanswered must-not-miss screen handed in — ordered by
 * relevance, never truncated, never gated on the agent being active. The
 * discriminating lane is the only ranked-and-capped one, and it is an ordering of
 * the sweep, not a replacement for it.
 */
export function rosLanes(args: {
  index: FeatureIndex;
  maps: ReasoningMap[];
  candidates: readonly RosCandidate[];
  demographics?: Demographics;
  /** Is this system inside the clinician's chosen focus? Red flags ignore it. */
  inScope?: (system: string) => boolean;
  limit?: number;
}): RosLanes {
  const inScope = args.inScope ?? (() => true);
  const limit = args.limit ?? ROS_PRIORITY.LANE_LIMIT;
  const { active, questions } = rankRosQuestions(args);

  const byRelevance = (a: RosQuestion, b: RosQuestion) =>
    b.gain - a.gain || a.display.localeCompare(b.display);

  const redFlags = (
    questions.length
      ? questions.filter((q) => q.mustNotMiss)
      : args.candidates.filter((c) => c.mustNotMiss).map(inert)
  ).sort(byRelevance);

  const ranked = questions.filter((q) => !q.mustNotMiss && q.gain > 0).sort(byRelevance);

  return {
    active,
    discriminating: ranked.filter((q) => inScope(q.system)).slice(0, limit),
    outOfFocus: ranked.filter((q) => !inScope(q.system)),
    redFlags,
  };
}
