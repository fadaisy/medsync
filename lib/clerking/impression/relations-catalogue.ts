import ASSOCIATIONS from "@/data/clerking/dx-associations.v1.json";
import CAUSES from "@/data/clerking/dx-causes.v1.json";
import RISKS from "@/data/clerking/dx-risk-factors.v1.json";
import SUBTYPES from "@/data/clerking/dx-subtypes.v1.json";

/**
 * The signed relation catalogues of ADR 0220 (BRIEF-DX-RELATIONS, GATE A 2026-10-09), read as the
 * board needs them. Pure. A catalogue only ever OFFERS: a relation exists only when a clinician makes
 * it (design §1.3). Every lookup is by catalogue dx id (`dx.*`); a typed diagnosis has none.
 *
 * Reading direction is the record's: `child` due_to `parent` (the effect, the complication, the
 * precipitated episode is the child; the cause is the parent). Where a pair is in the signed
 * complication list, the label is `complication` whatever the cause file says (its own rule).
 */

export type DueLabel = "complication" | "secondary" | "precipitated_by";
export type RelationType = "due_to" | "associated_with" | "risk_factor_for" | "episode_of";

export interface Catalogued {
  type: "due_to" | "associated_with";
  label: DueLabel | null;
  /** Both directions are listed (AF and heart failure…): a drop always opens the chooser (D-REL-06). */
  ambiguous: boolean;
  /** Where it came from, stored on the relation: "MS-EMR-DX-CAUSES-001@1.0.0:child<-parent". */
  ref: string;
}

export interface LinkedCandidate {
  /** The diagnosis that would hang under the parent. */
  dxId: string;
  type: "due_to" | "associated_with";
  label: DueLabel | null;
  /** When the cause catalogue says the link is worth offering, in words. */
  suggestWhen: string | null;
  restrictedClass: string | null;
  ref: string;
}

interface CauseEntry {
  id: string;
  label: DueLabel;
  suggest_when?: string;
  restricted_class?: string | null;
  direction_ambiguous?: boolean;
}
interface CauseFile {
  id: string;
  version: string;
  status: string;
  effects: Record<string, { secondary_to?: CauseEntry[]; same_as?: string }>;
  non_diagnosis_causes: { id: string; display: string; applies_to: string[] }[];
}
interface AssocFile {
  id: string;
  version: string;
  status: string;
  associations: Record<string, { complications?: string[]; goes_with?: string[] }>;
}
interface RiskFile {
  id: string;
  version: string;
  status: string;
  outcomes: Record<
    string,
    { risk_factors?: { id: string; restricted_class?: string | null }[]; same_as?: string }
  >;
}
export interface SubtypeEntry {
  id: string;
  display: string;
  proposed?: boolean;
  decided_by?: string[];
  criteria?: string;
  source?: string | string[];
}
export interface SubtypeParent {
  why?: string;
  subtypes: SubtypeEntry[];
  note_before?: string;
  note_after?: string;
  alternatives_if_ruled_out?: string[];
  suppressed_when?: unknown;
}
interface SubtypeFile {
  id: string;
  version: string;
  status: string;
  parents: Record<string, SubtypeParent>;
  stages: Record<string, { scale: string; applies_also_to?: string[]; [k: string]: unknown }>;
}

const C = CAUSES as unknown as CauseFile;
const A = ASSOCIATIONS as unknown as AssocFile;
const R = RISKS as unknown as RiskFile;
const S = SUBTYPES as unknown as SubtypeFile;

const signed = (f: { status: string }) => f.status.startsWith("signed");
const ref = (f: { id: string; version: string }, child: string, parent: string) =>
  `${f.id}@${f.version}:${child}<-${parent}`;

/** An effect's own entry, following `same_as` (anaemia, cause not yet known → anaemia). */
function effectOf(dx: string) {
  const e = C.effects[dx];
  return e?.same_as ? C.effects[e.same_as] : e;
}

const isComplication = (child: string, parent: string) =>
  signed(A) && (A.associations[parent]?.complications ?? []).includes(child);

/** child due_to parent, or the two associated, as a signed catalogue lists it; null if not listed. */
export function cataloguedRelation(child: string, parent: string): Catalogued | null {
  if (isComplication(child, parent))
    return { type: "due_to", label: "complication", ambiguous: false, ref: ref(A, child, parent) };
  if (signed(C)) {
    const hit = effectOf(child)?.secondary_to?.find((x) => x.id === parent);
    if (hit)
      return {
        type: "due_to",
        label: hit.label,
        ambiguous: !!hit.direction_ambiguous,
        ref: ref(C, child, parent),
      };
  }
  if (
    signed(A) &&
    ((A.associations[parent]?.goes_with ?? []).includes(child) ||
      (A.associations[child]?.goes_with ?? []).includes(parent))
  )
    return { type: "associated_with", label: null, ambiguous: false, ref: ref(A, child, parent) };
  return null;
}

/** The catalogue lists the other direction only: a drop asks "Did you mean …?" first (§4.2). */
export const listedReversed = (child: string, parent: string) =>
  !cataloguedRelation(child, parent) && cataloguedRelation(parent, child)?.type === "due_to";

/** "Add a linked diagnosis" under a parent: its complications, what it causes, what goes with it. */
export function linkedCandidates(parent: string): LinkedCandidate[] {
  const out = new Map<string, LinkedCandidate>();
  if (signed(A))
    for (const id of A.associations[parent]?.complications ?? [])
      out.set(id, {
        dxId: id,
        type: "due_to",
        label: "complication",
        suggestWhen: null,
        restrictedClass: null,
        ref: ref(A, id, parent),
      });
  if (signed(C))
    for (const [effect, e] of Object.entries(C.effects))
      for (const x of e.secondary_to ?? [])
        if (x.id === parent && !out.has(effect))
          out.set(effect, {
            dxId: effect,
            type: "due_to",
            label: isComplication(effect, parent) ? "complication" : x.label,
            suggestWhen: x.suggest_when ?? null,
            restrictedClass: x.restricted_class ?? null,
            ref: ref(C, effect, parent),
          });
  if (signed(A))
    for (const id of A.associations[parent]?.goes_with ?? [])
      if (!out.has(id))
        out.set(id, {
          dxId: id,
          type: "associated_with",
          label: null,
          suggestWhen: null,
          restrictedClass: null,
          ref: ref(A, id, parent),
        });
  return [...out.values()];
}

/** The causes the catalogue lists for an effect (for "secondary to …" offers on promotion). */
export function causesOf(effect: string): CauseEntry[] {
  return signed(C) ? (effectOf(effect)?.secondary_to ?? []) : [];
}

/** Coded non-diagnosis causes that may qualify an effect (D-REL-11). */
export function precipitantsFor(effect: string) {
  return signed(C) ? C.non_diagnosis_causes.filter((c) => c.applies_to.includes(effect)) : [];
}

/** The subtypes a diagnosis refines into (R3), or null. */
export function subtypesOf(dx: string): SubtypeParent | null {
  return signed(S) ? (S.parents[dx] ?? null) : null;
}

/** The parent a refined diagnosis came from in the catalogue (NSTEMI → NSTE-ACS), if any. */
export function refinesFrom(dx: string): string | null {
  if (!signed(S)) return null;
  for (const [p, e] of Object.entries(S.parents)) if (e.subtypes.some((s) => s.id === dx)) return p;
  return null;
}

/** Risk factors for an outcome (R2): shown as one derived line, never stored unless asked (D-REL-04). */
export function riskFactorsOf(outcome: string) {
  if (!signed(R)) return [];
  const o = R.outcomes[outcome];
  return (o?.same_as ? R.outcomes[o.same_as] : o)?.risk_factors ?? [];
}

/** The severity scale a diagnosis is staged by (D-REL-14), by its own id or `applies_also_to`. */
export function stageScaleOf(dx: string) {
  if (!signed(S)) return null;
  for (const [id, st] of Object.entries(S.stages))
    if (id === dx || (st.applies_also_to ?? []).includes(dx)) return { id, ...st };
  return null;
}

/** A coded non-diagnosis cause in words ("Missed or stopped insulin"); the id if unknown. */
export const precipitantName = (id: string) =>
  C.non_diagnosis_causes.find((c) => c.id === id)?.display ?? id;
