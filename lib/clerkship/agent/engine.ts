/**
 * Clerkship agent — orchestration. Pure + client-safe. Decision-support only:
 * runs each reducer over a present-only feature index, gated by config; returns
 * sorted insights. Never autonomous; every insight carries a cited sourceRef.
 */
import type {
  AgentConfig,
  AgentInput,
  AgentPacks,
  AgentReport,
  Insight,
  Severity,
} from "@/lib/clerkship/agent/types";

import { buildFeatureIndex } from "@/lib/clerkship/agent/feature-index";
import { combinationFlags } from "@/lib/clerkship/agent/reducers/combination";
import { suggestDiagnoses } from "@/lib/clerkship/agent/reducers/diagnosis";
import { mapAssociations, mapExpectedSigns } from "@/lib/clerkship/agent/reducers/maps";
import { incompatibleSigns, mustCheckSigns } from "@/lib/clerkship/agent/reducers/signs";
import { vitalFlags } from "@/lib/clerkship/agent/reducers/vitals";

const SEV_ORDER: Record<Severity, number> = { red: 0, amber: 1, info: 2 };

export function runClerkshipAgent(
  input: AgentInput,
  packs: AgentPacks,
  config: AgentConfig,
): AgentReport {
  if (!config.enabled) return { insights: [] };
  const idx = buildFeatureIndex(input);
  const insights: Insight[] = [];

  if (config.activePacks.maps) {
    insights.push(...mapAssociations(input, idx, packs.maps));
    insights.push(...mapExpectedSigns(input, idx, packs.maps));
    insights.push(...combinationFlags(input, idx, packs.maps));
    insights.push(...suggestDiagnoses(input, idx, packs.maps));
  }
  if (config.activePacks.vitalsEscalation)
    insights.push(...vitalFlags(input, idx, packs.vitalsEscalation));
  if (config.activePacks.dependencies)
    insights.push(...mustCheckSigns(input, idx, packs.dependencies));
  if (config.activePacks.incompatibilities)
    insights.push(...incompatibleSigns(input, idx, packs.incompatibilities));

  // Stable sort by severity (red → amber → info); reducers already order within kind.
  const sorted = insights
    .map((ins, i) => ({ ins, i }))
    .sort((a, b) => {
      const s = SEV_ORDER[a.ins.severity] - SEV_ORDER[b.ins.severity];
      return s !== 0 ? s : a.i - b.i;
    });
  return { insights: sorted.map((x) => x.ins) };
}
