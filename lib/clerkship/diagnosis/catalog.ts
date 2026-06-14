import type { CrossSystemRef } from "@/lib/clerkship/reasoning/types";

import { REASONING_MAPS } from "@/lib/clerkship/reasoning/maps";
import { ICD10_CODES } from "@/lib/encounter/reference-codes";

/**
 * Diagnosis catalog (Assessment-as-diagnostic-logic, GATE A) — the content
 * substrate for the diagnostic-logic Assessment: each diagnosis defined by the
 * features that support it, so the engine can match the captured clerkship
 * against each diagnosis and surface ranked, evidence-backed suggestions.
 *
 * THE ONE-SOURCE-OF-TRUTH RULE (non-negotiable): this catalog is a RE-PIVOT of
 * the 17 CSO-signed clinical-reasoning maps — the SAME content, re-keyed from
 * "presentation → differentials" into "diagnosis → its supports". It is DERIVED
 * FROM `REASONING_MAPS` at runtime (not a parallel hand-maintained file), so the
 * catalog and the reasoning engine can NEVER disagree — a change to a map flows
 * here automatically. Net-new diagnoses are authored ONLY where the maps don't
 * reach (none in this first pass; the flag exists for when they are).
 *
 * Support WEIGHT ranks suggestions; it never asserts a diagnosis. Must-not-miss
 * surfaces regardless of support (carried from the maps). The actual ranking is
 * BORROWED from the reasoning engine's score (see the matching adapter) — these
 * weights are display metadata derived structurally from the support TYPE
 * (discriminator > cross-system symptom > risk factor), never per-item clinical
 * judgement invented here.
 *
 * ICD-10 is NEVER fabricated from memory: a diagnosis is linked to a code ONLY
 * when its name matches an already-verified `ICD10_CODES` entry; otherwise it is
 * left null (pending web-verified CSO population). `workupRef` is a placeholder —
 * workup is the next build.
 */

export type SupportWeight = "strong" | "moderate" | "weak";

export interface WeightedFeature {
  label: string;
  weight: SupportWeight;
}

export type DiagnosisStatus = "from_reasoning_maps" | "net_new";

export interface DiagnosisEntry {
  /** Stable slug derived from the display. */
  code: string;
  /** Diagnosis name (honest, as authored in the maps). */
  display: string;
  /** ICD-10 code — linked from verified ICD10_CODES by name, else null (pending). */
  icd10: string | null;
  status: DiagnosisStatus;
  /** The reasoning-map presentation(s) this diagnosis appears under (provenance). */
  presentations: string[];
  /** Surfaces regardless of support (carried from the maps' must-not-miss flags). */
  mustNotMiss: boolean;
  /** Cross-system supporting symptoms (ROS refs), with a structural weight. */
  supportingSymptoms: CrossSystemRef[];
  /** Examination-sign supports — a net-new dimension the maps don't carry yet
   *  (empty in this first pass; flagged for later exam-catalog enrichment). */
  supportingSigns: WeightedFeature[];
  /** Risk/background features that raise pre-test probability. */
  riskFactors: string[];
  /** Discriminators that strongly argue FOR (the maps' ruleIn). */
  ruleIn: string[];
  /** Discriminators that argue AGAINST (the maps' ruleOut). */
  ruleOut: string[];
  /** Features whose presence argues against (the maps' refutingSymptoms). */
  refutingFeatures: CrossSystemRef[];
  /** Workup link — placeholder; workup is the next build. */
  workupRef: null;
}

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/** Deterministic ICD-10 link: a diagnosis maps to a verified ICD10_CODES entry
 *  ONLY on a confident name match (whole-phrase equality/containment). Never
 *  fabricated; anything uncertain stays null (pending CSO web-verification). */
function linkIcd10(display: string): string | null {
  const d = norm(display);
  // split composite names ("Asthma / COPD", "Acute coronary syndrome / MI")
  const parts = d.split(/\s*\/\s*/).filter(Boolean);
  for (const code of ICD10_CODES) {
    const c = norm(code.display);
    if (c === d) return code.code;
    if (parts.some((p) => p.length >= 5 && (c === p || c.includes(p) || p.includes(c)))) {
      return code.code;
    }
  }
  return null;
}

const dedupeStr = (xs: string[]) => Array.from(new Set(xs.map((x) => x.trim()).filter(Boolean)));
const dedupeRefs = (xs: CrossSystemRef[]) => {
  const seen = new Set<string>();
  const out: CrossSystemRef[] = [];
  for (const r of xs) {
    const k = `${r.system}::${r.symptom}`.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
};

/**
 * Build the diagnosis catalog by INVERTING the reasoning maps: every differential
 * across all 17 maps becomes/extends a diagnosis-keyed entry whose supports are
 * the UNION of that diagnosis's appearances (a diagnosis like PE appears under
 * several presentations — its supports union, all presentations recorded).
 * Pure + deterministic. Fabricates nothing — surfaces only what the maps contain.
 */
export function buildDiagnosisCatalog(): DiagnosisEntry[] {
  const byDx = new Map<string, DiagnosisEntry>();

  for (const map of REASONING_MAPS) {
    for (const d of map.differential) {
      const key = norm(d.dx);
      const existing = byDx.get(key);
      if (existing) {
        if (!existing.presentations.includes(map.code)) existing.presentations.push(map.code);
        existing.mustNotMiss = existing.mustNotMiss || d.likelihood === "must_not_miss";
        existing.ruleIn = dedupeStr([...existing.ruleIn, ...(d.ruleIn ?? [])]);
        existing.ruleOut = dedupeStr([...existing.ruleOut, ...(d.ruleOut ?? [])]);
        existing.riskFactors = dedupeStr([...existing.riskFactors, ...(d.riskFactors ?? [])]);
        existing.supportingSymptoms = dedupeRefs([
          ...existing.supportingSymptoms,
          ...(d.supportingSymptoms ?? []),
        ]);
        existing.refutingFeatures = dedupeRefs([
          ...existing.refutingFeatures,
          ...(d.refutingSymptoms ?? []),
        ]);
      } else {
        byDx.set(key, {
          code: slug(d.dx),
          display: d.dx,
          icd10: linkIcd10(d.dx),
          status: "from_reasoning_maps",
          presentations: [map.code],
          mustNotMiss: d.likelihood === "must_not_miss",
          supportingSymptoms: dedupeRefs(d.supportingSymptoms ?? []),
          supportingSigns: [],
          riskFactors: dedupeStr(d.riskFactors ?? []),
          ruleIn: dedupeStr(d.ruleIn ?? []),
          ruleOut: dedupeStr(d.ruleOut ?? []),
          refutingFeatures: dedupeRefs(d.refutingSymptoms ?? []),
          workupRef: null,
        });
      }
    }
  }

  // Stable order: must-not-miss first, then alphabetical (display).
  return [...byDx.values()].sort(
    (a, b) => Number(b.mustNotMiss) - Number(a.mustNotMiss) || a.display.localeCompare(b.display),
  );
}

/** The catalog, built once from the maps. */
export const DIAGNOSIS_CATALOG: DiagnosisEntry[] = buildDiagnosisCatalog();

/** Lookup by diagnosis display (case-insensitive) — the join key the matching
 *  adapter uses to enrich the reasoning engine's scored differentials. */
const BY_DISPLAY = new Map(DIAGNOSIS_CATALOG.map((e) => [norm(e.display), e]));
export function diagnosisByDisplay(display: string): DiagnosisEntry | undefined {
  return BY_DISPLAY.get(norm(display));
}
