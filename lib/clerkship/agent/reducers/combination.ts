import type {
  AgentInput,
  EvidenceItem,
  FeatureIndex,
  Insight,
  ReasoningMap,
} from "@/lib/clerkship/agent/types";

import { normalizeFeature } from "@/lib/clerkship/agent/normalize";
import { matchedMaps } from "@/lib/clerkship/agent/reducers/maps";

export function combinationFlags(
  _input: AgentInput,
  idx: FeatureIndex,
  maps: ReasoningMap[],
): Insight[] {
  const out: Insight[] = [];
  for (const m of matchedMaps(idx, maps)) {
    for (const c of m.combinations ?? []) {
      const allPresent = c.features.every((f) => idx.presentDisplays.has(normalizeFeature(f)));
      if (!allPresent) continue;
      const evidence: EvidenceItem[] = c.features.map(
        (f) =>
          idx.provenance.get(normalizeFeature(f)) ?? { label: f.replace(/[«»]/g, ""), from: "hpc" },
      );
      out.push({
        id: `combo:${m.code}:${normalizeFeature(c.suggests)}`,
        kind: "combination",
        severity: c.mustNotMiss ? "red" : "amber",
        target: { area: "complaint" },
        message: `${c.suggests}${c.action ? ` — ${c.action}` : ""}`,
        evidence,
        suggests: { dx: c.suggests, mustNotMiss: c.mustNotMiss },
        sourceRef: {
          pack: "enriched-reasoning-maps",
          entryId: m.code,
          citation: "CSO-approved reasoning maps",
        },
      });
    }
  }
  return out;
}
