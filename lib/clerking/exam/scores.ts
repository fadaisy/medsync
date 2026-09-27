import type { ExamCatalogue } from "./catalogue";
import type { Consciousness, ExamDraft, MrcGrade } from "./payload";

/**
 * Scores computed from their parts (PROMPT-CLERKING-EXAM-V2 §7 scores.ts, E4): GCS (NT never
 * scores), GCS-P, ACVPU (never inferred below 15), orientation, AMTS, CRB65 and ROSIER. Pure.
 */

export type Acvpu = "A" | "C" | "V" | "P" | "U";

export function gcsTotal(c: Consciousness | undefined): number | null {
  if (!c || c.method !== "gcs") return null;
  if (c.nt?.E || c.nt?.V || c.nt?.M) return null;
  if (!c.E || !c.V || !c.M) return null;
  return c.E + c.V + c.M;
}

/** "GCS 13/15 (E3 V4 M6)"; with NT "GCS not totalled (E3 VNT M6)". */
export function gcsText(c: Consciousness | undefined): string | null {
  if (!c || c.method !== "gcs" || (!c.E && !c.V && !c.M && !c.nt)) return null;
  const part = (k: "E" | "V" | "M") => `${k}${c.nt?.[k] ? "NT" : (c[k] ?? "?")}`;
  const t = gcsTotal(c);
  return `${t === null ? "GCS not totalled" : `GCS ${t}/15`} (${part("E")} ${part("V")} ${part("M")})`;
}

/** Pupil reactivity score for GCS-P: both unreactive 2, one 1, both react 0; null until both are
 *  recorded. */
export function pupilScore(d: ExamDraft): number | null {
  const e = d.entries["ex.nervous.pupils"];
  const r = e?.attrs?.right_reaction;
  const l = e?.attrs?.left_reaction;
  if (e?.state === "negative") return 0; // pupils recorded as equal and reactive
  if (typeof r !== "string" || typeof l !== "string") return null;
  return (r === "unreactive" ? 1 : 0) + (l === "unreactive" ? 1 : 0);
}

/** GCS-P = GCS − pupil score. Computed whenever both are recorded; shown and written only when the
 *  pupil score is above 0 (`show`). */
export function gcsP(d: ExamDraft): { value: number; show: boolean } | null {
  const t = gcsTotal(d.blocks.consciousness);
  const p = pupilScore(d);
  if (t === null || p === null) return null;
  return { value: t - p, show: p > 0 };
}

/** ACVPU for NEWS2: chosen directly, or A from GCS 15; below 15 only the clinician's choice. */
export function acvpuOf(c: Consciousness | undefined): Acvpu | null {
  if (!c) return null;
  if (c.method === "acvpu") return c.acvpu ?? null;
  if (gcsTotal(c) === 15) return "A";
  return c.acvpu ?? null;
}

/** The corrected suggestion shown below 15 (never applied): E4 with V4 or V5 → C (if the confusion
 *  is new); eyes to sound, any verbal response or obeying → V; a motor or eye response to pressure
 *  only → P; only E1 V1 M1 → U. */
export function acvpuSuggestion(c: Consciousness | undefined): Acvpu | null {
  if (!c || c.method !== "gcs") return null;
  const { E, V, M } = c;
  if (gcsTotal(c) === 15) return null;
  if (E === 1 && V === 1 && M === 1) return "U";
  if (E === 4 && V !== undefined && V >= 4) return "C";
  if (E === 3 || (V !== undefined && V >= 2) || M === 6) return "V";
  if (E === 2 || (M !== undefined && M >= 2 && M <= 5)) return "P";
  return null;
}

export type OrientationState =
  | { kind: "derived" } // V5: oriented to time, place and person, read-only
  | { kind: "ask" } // V4, or ACVPU A: ask each
  | { kind: "not_assessable" }
  | { kind: "none" }; // nothing recorded yet

export function orientationState(c: Consciousness | undefined): OrientationState {
  if (!c) return { kind: "none" };
  if (c.method === "acvpu")
    return c.acvpu === "A"
      ? { kind: "ask" }
      : c.acvpu
        ? { kind: "not_assessable" }
        : { kind: "none" };
  if (c.nt?.V) return { kind: "not_assessable" };
  if (c.V === 5) return { kind: "derived" };
  if (c.V === 4) return { kind: "ask" };
  if (c.V !== undefined) return { kind: "not_assessable" };
  return { kind: "none" };
}

/** Orientation as recorded: fully oriented, not fully (with what), or unknown. */
export function orientation(c: Consciousness | undefined): { full: boolean | null; not: string[] } {
  const s = orientationState(c);
  if (s.kind === "derived") return { full: true, not: [] };
  if (s.kind !== "ask") return { full: null, not: [] };
  const o = c?.orientation ?? {};
  const keys = ["time", "place", "person"] as const;
  const not = keys.filter((k) => o[k] === "no");
  if (not.length) return { full: false, not: [...not] };
  return { full: keys.every((k) => o[k] === "yes") ? true : null, not: [] };
}

/** AMTS: the score counts correct answers; complete when all ten are answered. */
export function amts(d: ExamDraft): { score: number; answered: number; complete: boolean } | null {
  const a = d.blocks.amts;
  if (!a || !Object.keys(a).length) return null;
  const answered = Object.keys(a).length;
  const score = Object.values(a).filter((x) => x === "correct").length;
  return { score, answered, complete: answered >= 10 };
}

export const mrcNumber = (g: MrcGrade | undefined): number | null =>
  g === undefined ? null : Number(g.replace(/[+-]$/, ""));

/* ─── CRB65 ───────────────────────────────────────────────────────── */

export interface Crb65 {
  points: { id: "confusion" | "rr" | "bp" | "age"; label: string; met: boolean | null }[];
  score: number;
  complete: boolean;
  band: "low" | "intermediate" | "high";
}

export function crb65(
  cat: ExamCatalogue,
  i: {
    amts: number | null;
    newDisorientation: boolean | null;
    rr: number | null;
    sbp: number | null;
    dbp: number | null;
    age: number | null;
  },
): Crb65 {
  const r = (k: string) => cat.refNumber(`REF-EX-CRB65.${k}`)!;
  // Met if either part is; not met once either part is known not met; unknown only when neither is known.
  const or = (a: boolean | null, b: boolean | null) =>
    a || b ? true : a === false || b === false ? false : null;
  const points: Crb65["points"] = [
    {
      id: "confusion",
      label: `Confusion (AMTS ${r("amt_confused_lte")} or less, or new disorientation)`,
      met: or(i.amts === null ? null : i.amts <= r("amt_confused_lte"), i.newDisorientation),
    },
    {
      id: "rr",
      label: `Respiratory rate ${r("rr_gte")} or more`,
      met: i.rr === null ? null : i.rr >= r("rr_gte"),
    },
    {
      id: "bp",
      label: `Systolic below ${r("sbp_lt")} or diastolic ${r("dbp_lte")} or less`,
      met: or(
        i.sbp === null ? null : i.sbp < r("sbp_lt"),
        i.dbp === null ? null : i.dbp <= r("dbp_lte"),
      ),
    },
    {
      id: "age",
      label: `Age ${r("age_gte")} or over`,
      met: i.age === null ? null : i.age >= r("age_gte"),
    },
  ];
  const score = points.filter((p) => p.met).length;
  return {
    points,
    score,
    complete: points.every((p) => p.met !== null),
    band: score >= r("high_gte") ? "high" : score >= r("intermediate_gte") ? "intermediate" : "low",
  };
}
