import type {
  AgentInput,
  ExpectItem,
  FeatureIndex,
  Insight,
  ReasoningMap,
} from "@/lib/clerkship/agent/types";

import { featurePresent } from "@/lib/clerkship/agent/aliases";

export function matchedMaps(idx: FeatureIndex, maps: ReasoningMap[]): ReasoningMap[] {
  return maps.filter((m) => m.triggerCodes.some((c) => idx.complaintCodes.has(c)));
}

export function mapAssociations(
  _input: AgentInput,
  idx: FeatureIndex,
  maps: ReasoningMap[],
): Insight[] {
  const out: Insight[] = [];
  for (const m of matchedMaps(idx, maps)) {
    const expects: ExpectItem[] = m.associated
      .filter((a) => !featurePresent(idx, a))
      .map((a) => ({ label: a.replace(/[«»]/g, ""), area: "ros" as const }));
    if (!expects.length) continue;
    out.push({
      id: `assoc:${m.code}`,
      kind: "association",
      severity: "info",
      target: { area: "complaint" },
      message: `With ${m.display.toLowerCase()}, also ask about:`,
      evidence: [{ label: m.display, from: "hpc" }],
      expects,
      sourceRef: {
        pack: "enriched-reasoning-maps",
        entryId: m.code,
        citation: "CSO-approved reasoning maps",
      },
    });
  }
  return out;
}

export function mapExpectedSigns(
  _input: AgentInput,
  idx: FeatureIndex,
  maps: ReasoningMap[],
): Insight[] {
  const out: Insight[] = [];
  for (const m of matchedMaps(idx, maps)) {
    const expects: ExpectItem[] = m.examTargets.map((t) => ({
      label: `${t.sign} (${t.area})`,
      area: "general" as const,
      why: `discriminates ${t.discriminates}`,
    }));
    if (!expects.length) continue;
    out.push({
      id: `expect:${m.code}`,
      kind: "expected-sign",
      severity: "info",
      target: { area: "complaint" },
      message: `With ${m.display.toLowerCase()}, look for on exam:`,
      evidence: [{ label: m.display, from: "hpc" }],
      expects,
      sourceRef: {
        pack: "enriched-reasoning-maps",
        entryId: m.code,
        citation: "CSO-approved reasoning maps",
      },
    });
  }
  return out;
}
