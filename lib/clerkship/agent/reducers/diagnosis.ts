import type {
  AgentInput,
  Contribution,
  Demographics,
  EvidenceItem,
  ExpectItem,
  FeatureIndex,
  Insight,
  MapDifferential,
  ReasoningMap,
} from "@/lib/clerkship/agent/types";

import { featurePresent } from "@/lib/clerkship/agent/aliases";
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

const present = featurePresent;
const clean = (s: string) => s.replace(/[«»]/g, "");
const dxKey = (d: MapDifferential) => d.dxCode ?? normalizeFeature(d.dx);

/** Unmet positive features → "to discriminate, check next". */
function discriminatorsFor(idx: FeatureIndex, d: MapDifferential): ExpectItem[] {
  const w = deriveWeights(d);
  return dedupeWeights(w.featureWeights)
    .filter(({ token, weight }) => weight > 0 && !present(idx, token))
    .map(({ token }) => ({ label: clean(token), area: "complaint" as const }));
}

function evidenceFromContributions(c: Contribution[]): EvidenceItem[] {
  const fromOf: Record<string, EvidenceItem["from"]> = {
    feature: "hpc",
    risk: "background",
    age: "vitals",
    sex: "vitals",
    interaction: "hpc",
  };
  return c
    .filter((x) => x.source !== "base" && x.delta > 0)
    .map((x) => ({ label: x.label, from: fromOf[x.source] ?? "hpc" }));
}

/** Ranked differential: every applicable dx tiered; must-not-miss always present. */
function suggestRanked(
  idx: FeatureIndex,
  maps: ReasoningMap[],
  demographics: Demographics | undefined,
): Insight[] {
  const matched = matchedMaps(idx, maps);
  const idCount = new Map<string, number>();
  for (const m of matched)
    for (const d of m.differential) {
      const k = dxKey(d);
      idCount.set(k, (idCount.get(k) ?? 0) + 1);
    }

  const seen = new Set<string>();
  const insights: Insight[] = [];
  for (const m of matched) {
    for (const d of m.differential) {
      const k = dxKey(d);
      if (seen.has(k)) continue; // a shared dx is shown once (reinforced)
      seen.add(k);

      const { score, contributions } = scoreDifferential(d, idx, demographics);
      let finalScore = score;
      const contribs = [...contributions];
      if ((idCount.get(k) ?? 0) >= 2) {
        finalScore += REINFORCE;
        contribs.push({
          source: "interaction",
          label: "fits multiple complaints",
          delta: REINFORCE,
        });
      }
      // A conditional must-not-miss (pinWhen) only counts as must-not-miss — i.e.
      // gets the red pin + always-visible treatment — when its gate is satisfied;
      // otherwise it ranks like a normal dx (quiet unless its risk/feature is present).
      const mustNotMiss = d.likelihood === "must_not_miss" && pinSatisfied(d.pinWhen, idx);

      insights.push({
        id: `dx:${m.code}:${normalizeFeature(d.dx)}`,
        kind: "diagnosis",
        severity: mustNotMiss ? "red" : "info",
        target: { area: "assessment" },
        message: d.dx,
        evidence: evidenceFromContributions(contribs),
        discriminators: discriminatorsFor(idx, d),
        suggests: { dx: d.dx, mustNotMiss },
        score: finalScore,
        tier: tierOf(finalScore),
        contributions: contribs,
        sourceRef: {
          pack: "enriched-reasoning-maps",
          entryId: m.code,
          citation: "CSO-approved reasoning maps",
        },
      });
    }
  }

  // must-not-miss / leading first, then score desc, stable.
  return insights
    .map((ins, i) => ({ ins, i }))
    .sort((a, b) => {
      const ap = a.ins.suggests?.mustNotMiss || a.ins.tier === "leading" ? 1 : 0;
      const bp = b.ins.suggests?.mustNotMiss || b.ins.tier === "leading" ? 1 : 0;
      if (ap !== bp) return bp - ap;
      const sc = (b.ins.score ?? 0) - (a.ins.score ?? 0);
      return sc !== 0 ? sc : a.i - b.i;
    })
    .map((x) => x.ins);
}

/** Flat fallback — VERBATIM the legacy behaviour (no behaviour change when the
 * flag is off). Local `scoreFlat` avoids clashing with the imported `scoreDifferential`. */
function scoreFlat(idx: FeatureIndex, d: MapDifferential) {
  const ruleInHit = d.ruleIn.filter((f) => present(idx, f));
  const ruleInMiss = d.ruleIn.filter((f) => !present(idx, f));
  const ruleOutHit = d.ruleOut.filter((f) => present(idx, f));
  const supportHit = d.supportingSymptoms.filter((s) => present(idx, s.symptom));
  const refuteHit = d.refutingSymptoms.filter((s) => present(idx, s.symptom));
  const riskHit = d.riskFactors.filter((f) => present(idx, f));
  const score =
    ruleInHit.length + supportHit.length + riskHit.length - ruleOutHit.length - refuteHit.length;
  return { score, ruleInHit, ruleInMiss, supportHit, riskHit };
}

function suggestFlat(idx: FeatureIndex, maps: ReasoningMap[]): Insight[] {
  const insights: Insight[] = [];
  for (const m of matchedMaps(idx, maps)) {
    for (const d of m.differential) {
      const mustNotMiss = d.likelihood === "must_not_miss";
      const s = scoreFlat(idx, d);
      if (!mustNotMiss && s.score <= 0) continue;

      const evidence: EvidenceItem[] = [
        ...s.ruleInHit.map((f) => ({ label: clean(f), from: "hpc" as const })),
        ...s.supportHit.map((x) => ({ label: x.symptom, from: "ros" as const })),
        ...s.riskHit.map((f) => ({ label: clean(f), from: "background" as const })),
      ];
      const discriminators: ExpectItem[] = s.ruleInMiss.map((f) => ({
        label: clean(f),
        area: "complaint" as const,
      }));
      insights.push({
        id: `dx:${m.code}:${normalizeFeature(d.dx)}`,
        kind: "diagnosis",
        severity: mustNotMiss ? "red" : "info",
        target: { area: "assessment" },
        message: d.dx,
        evidence,
        discriminators,
        suggests: { dx: d.dx, mustNotMiss },
        score: s.score,
        sourceRef: {
          pack: "enriched-reasoning-maps",
          entryId: m.code,
          citation: "CSO-approved reasoning maps",
        },
      });
    }
  }
  return insights
    .map((ins, i) => ({ ins, i }))
    .sort((a, b) => {
      const am = a.ins.suggests?.mustNotMiss ? 1 : 0;
      const bm = b.ins.suggests?.mustNotMiss ? 1 : 0;
      if (am !== bm) return bm - am;
      const sc = (b.ins.score ?? 0) - (a.ins.score ?? 0);
      return sc !== 0 ? sc : a.i - b.i;
    })
    .map((x) => x.ins);
}

export function suggestDiagnoses(
  input: AgentInput,
  idx: FeatureIndex,
  maps: ReasoningMap[],
  opts?: { ranked?: boolean; demographics?: Demographics },
): Insight[] {
  void input;
  return opts?.ranked ? suggestRanked(idx, maps, opts.demographics) : suggestFlat(idx, maps);
}
