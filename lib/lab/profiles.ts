/**
 * Analyser profiles (Lab Phase 2 §6.2, rules AP-1 to AP-7; CD-05, D-LAB2-26; ADR 0251). Pure.
 *
 * A profile is data: an analyser model, and for each code it prints the concept it fills and who sees it
 * (clinician, lab only, never). Research-use codes are blocked; a 3-part analyser's MID and GRAN fill only
 * their own concepts and never neutrophils (AP-3); a profile is used only when every reportable code is
 * mapped, every open question is answered and every mapped quantity is verified on this analyser (AP-4).
 */
import MODELS from "@/data/lab/analyser-models.v1.json";

export type Visibility = "clinician" | "lab_only" | "never";
export type ProfileKind = "five_part" | "three_part" | "chemistry" | "other";

export interface Mapping {
  code: string;
  concept: string;
  visibility: Visibility;
}
export interface OpenCheck {
  code: string;
  question: string;
  resolution?: string | null;
}
export interface Profile {
  id: string;
  model: string;
  kind: ProfileKind;
  state: "draft" | "in_use" | "retired";
  mappings: Mapping[];
  openChecks: OpenCheck[];
  verifiedConcepts: string[];
}

export interface AnalyserModel {
  display: string;
  kind: ProfileKind;
  test: string;
  codes: Record<string, string>;
  labOnly: string[];
  researchUse: string[];
  openChecks: { code: string; question: string }[];
}
export const ANALYSER_MODELS = MODELS.models as Record<string, AnalyserModel>;

/** AP-3: the differential each kind of analyser may fill. */
const FIVE_PART_ONLY = /^obs\.(neutrophils|eosinophils|monocytes|basophils|ig)_/;
const THREE_PART_ONLY = /^obs\.(mid|granulocytes)_/;

export type MappingError =
  | { code: string; error: "research_use" }
  | { code: string; error: "wrong_differential" }
  | { code: string; error: "not_a_component" }
  | { code: string; error: "duplicate" };

/** AP-2, AP-3: what a mapping may not do. `components` are the test's v2 components. */
export function mappingErrors(
  p: Pick<Profile, "kind" | "mappings">,
  model: AnalyserModel | undefined,
  components: readonly string[],
): MappingError[] {
  const out: MappingError[] = [];
  const seen = new Set<string>();
  for (const m of p.mappings) {
    if (seen.has(m.code)) out.push({ code: m.code, error: "duplicate" });
    seen.add(m.code);
    if (m.visibility === "never") continue; // locked: not stored, not mappable
    if (model?.researchUse.includes(m.code)) {
      out.push({ code: m.code, error: "research_use" });
      continue;
    }
    const midGran = /^(MID|GRAN)/i.test(m.code);
    if (
      (p.kind === "three_part" && FIVE_PART_ONLY.test(m.concept)) ||
      (p.kind === "five_part" && THREE_PART_ONLY.test(m.concept)) ||
      (midGran && !THREE_PART_ONLY.test(m.concept))
    )
      out.push({ code: m.code, error: "wrong_differential" });
    else if (!components.includes(m.concept)) out.push({ code: m.code, error: "not_a_component" });
  }
  return out;
}

export type Blocker =
  | { kind: "unmapped"; code: string }
  | { kind: "open_check"; code: string; question: string }
  | { kind: "not_verified"; concept: string }
  | { kind: "mapping"; error: MappingError };

/** AP-4: everything that keeps "Use this profile" closed. */
export function activationBlockers(
  p: Profile,
  model: AnalyserModel | undefined,
  components: readonly string[],
): Blocker[] {
  const out: Blocker[] = mappingErrors(p, model, components).map((error) => ({
    kind: "mapping",
    error,
  }));
  for (const code of Object.keys(model?.codes ?? {}))
    if (!p.mappings.some((m) => m.code === code)) out.push({ kind: "unmapped", code });
  for (const c of p.openChecks)
    if (!c.resolution?.trim()) out.push({ kind: "open_check", code: c.code, question: c.question });
  for (const m of p.mappings)
    if (m.visibility !== "never" && !p.verifiedConcepts.includes(m.concept))
      out.push({ kind: "not_verified", concept: m.concept });
  return out;
}

/** A new profile from its model: every code mapped as suggested, research-use codes locked as never. */
export function profileFromModel(
  modelId: string,
): Pick<Profile, "model" | "kind" | "mappings" | "openChecks"> {
  const m = ANALYSER_MODELS[modelId];
  if (!m) throw new Error(`unknown analyser model ${modelId}`);
  return {
    model: modelId,
    kind: m.kind,
    mappings: [
      ...Object.entries(m.codes).map(([code, concept]) => ({
        code,
        concept,
        visibility: (m.labOnly.includes(code) ? "lab_only" : "clinician") as Visibility,
      })),
      ...m.researchUse.map((code) => ({ code, concept: "", visibility: "never" as const })),
    ],
    openChecks: m.openChecks.map((c) => ({ ...c, resolution: null })),
  };
}

/** AP-5, AP-6: the rows a specimen shows, from the profile pinned at receipt. `never` rows do not exist. */
export function rowsFor(p: Pick<Profile, "mappings">, viewer: "lab" | "clinician"): Mapping[] {
  return p.mappings.filter(
    (m) => m.visibility === "clinician" || (viewer === "lab" && m.visibility === "lab_only"),
  );
}

/** AP-6: may a value for this concept be stored from this profile, and is it lab-only? */
export function storeAs(
  p: Pick<Profile, "mappings">,
  concept: string,
): "clinician" | "lab_only" | "refuse" {
  const m = p.mappings.find((x) => x.concept === concept && x.visibility !== "never");
  return m ? (m.visibility === "lab_only" ? "lab_only" : "clinician") : "refuse";
}
