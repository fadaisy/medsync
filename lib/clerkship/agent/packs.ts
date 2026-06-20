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

import abdominalPainWeights from "@/docs/clinical/agent/ddx-weights/abdominal_pain.json";
import chestPainWeights from "@/docs/clinical/agent/ddx-weights/chest_pain.json";
import coughWeights from "@/docs/clinical/agent/ddx-weights/cough.json";
import dyspnoeaWeights from "@/docs/clinical/agent/ddx-weights/dyspnoea.json";
import feverWeights from "@/docs/clinical/agent/ddx-weights/fever.json";
import rawDeps from "@/docs/clinical/agent/sign-dependencies.json";
import rawIncompat from "@/docs/clinical/agent/sign-incompatibilities.json";
import rawVitals from "@/docs/clinical/agent/vitals-escalation.json";
import rawMaps from "@/docs/clinical/enriched-reasoning-maps.json";
import { mergeDdxWeights } from "@/lib/clerkship/agent/weights";

// Sourced per-complaint weight files (overlay existing dx + append new ones).
// One import + array entry per complaint as chunks land; each is cited + CSO-signed.
const DDX_WEIGHT_FILES: DdxWeightFile[] = [
  chestPainWeights as unknown as DdxWeightFile,
  coughWeights as unknown as DdxWeightFile,
  feverWeights as unknown as DdxWeightFile,
  dyspnoeaWeights as unknown as DdxWeightFile,
  abdominalPainWeights as unknown as DdxWeightFile,
];

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
