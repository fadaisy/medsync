import type {
  AgentInput,
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

// Alias-aware: matches the map's prose feature against catalog tokens (handles
// vocabulary near-misses like "Crushing" → "Crushing / pressing").
const present = featurePresent;

function scoreDifferential(idx: FeatureIndex, d: MapDifferential) {
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

export function suggestDiagnoses(
  _input: AgentInput,
  idx: FeatureIndex,
  maps: ReasoningMap[],
): Insight[] {
  const insights: Insight[] = [];
  for (const m of matchedMaps(idx, maps)) {
    for (const d of m.differential) {
      const mustNotMiss = d.likelihood === "must_not_miss";
      const s = scoreDifferential(idx, d);
      if (!mustNotMiss && s.score <= 0) continue;

      const evidence: EvidenceItem[] = [
        ...s.ruleInHit.map((f) => ({ label: f.replace(/[«»]/g, ""), from: "hpc" as const })),
        ...s.supportHit.map((x) => ({ label: x.symptom, from: "ros" as const })),
        ...s.riskHit.map((f) => ({ label: f.replace(/[«»]/g, ""), from: "background" as const })),
      ];
      const discriminators: ExpectItem[] = s.ruleInMiss.map((f) => ({
        label: f.replace(/[«»]/g, ""),
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
  // Must-not-miss floated to top, then by score desc, then stable.
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
