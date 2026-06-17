/**
 * Cited knowledge packs for the clerkship agent. The reused reasoning maps are
 * already CSO-approved (docs/clinical/enriched-reasoning-maps.json); the three
 * new packs ship empty and are sourced + CSO-signed in Phase 2 (the loader
 * tolerates empty packs). Client-safe: pure JSON imports, no server-only.
 */
import type {
  AgentPacks,
  DependencyRule,
  IncompatibilityRule,
  ReasoningMap,
  VitalsEscalationRule,
} from "@/lib/clerkship/agent/types";
import type { DdxWeightFile } from "@/lib/clerkship/agent/weights";

import rawDeps from "@/docs/clinical/agent/sign-dependencies.json";
import rawIncompat from "@/docs/clinical/agent/sign-incompatibilities.json";
import rawVitals from "@/docs/clinical/agent/vitals-escalation.json";
import rawMaps from "@/docs/clinical/enriched-reasoning-maps.json";
import { mergeDdxWeights } from "@/lib/clerkship/agent/weights";

// Sourced per-complaint weight files (one import per complaint as chunks land).
// CHUNK-1: none yet — bootstrap from the approved maps. Add imports here, e.g.:
//   import chestPainWeights from "@/docs/clinical/agent/ddx-weights/chest_pain.json";
const DDX_WEIGHT_FILES: DdxWeightFile[] = [];

function adaptMaps(raw: unknown): ReasoningMap[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((m: Record<string, unknown>) => ({
    code: String(m.code ?? ""),
    display: String(m.display ?? ""),
    triggerCodes: (m.triggerCodes as string[]) ?? [],
    associated: (m.associated as string[]) ?? [],
    redFlags: (m.redFlags as string[]) ?? [],
    examTargets: (m.examTargets as ReasoningMap["examTargets"]) ?? [],
    differential: (m.differential as ReasoningMap["differential"]) ?? [],
    combinations: (m.combinations as ReasoningMap["combinations"]) ?? [],
  }));
}

let cached: AgentPacks | null = null;

export function loadAgentPacks(): AgentPacks {
  if (cached) return cached;
  const approved = adaptMaps(rawMaps);
  cached = {
    maps: approved,
    rankedMaps: mergeDdxWeights(approved, DDX_WEIGHT_FILES),
    incompatibilities: rawIncompat as IncompatibilityRule[],
    dependencies: rawDeps as DependencyRule[],
    vitalsEscalation: rawVitals as VitalsEscalationRule[],
  };
  return cached;
}
