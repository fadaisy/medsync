/**
 * Interpretation (Lab Phase 2 §6.4, rules DS-1 to DS-11; CD-01, LD-02, LD-04, LD-05, LD-07; ADR 0252). Pure.
 *
 * One resolver wraps Phase 1's reference range (E-LAB2-02). A hospital's signed flag basis says whether a
 * concept is flagged on its reference interval or on a named decision scheme; a scheme reads a category from
 * the row that fits the patient (sex, age in days, recorded pregnancy, method), with the hospital's signed
 * elevation added to every cut-off where the scheme says so. A scheme that does not fit falls back to the
 * reference interval, with the reason, and never borrows another population's category (DS-4). Nothing here
 * carries a clinical number: every cut-off, row and adjustment is signed data.
 */
import type { Flag } from "@/lib/lab/flags";
import type { RangeBand, ResolvedRange, Sex } from "@/lib/lab/ranges";
import type { ResultMethod, SchemePayload, SignedConfig } from "@/lib/lab/signed-config";

import { addDecimal, compareDecimal, isDecimal } from "@/lib/lab/catalogue";
import { computeFlag } from "@/lib/lab/flags";
import { inForce } from "@/lib/lab/signed-config";

/** DS-5: from the record only; never inferred from age, sex or ward (D-LAB2-22). */
export type PregnancyContext =
  | { state: "not_pregnant" }
  | { state: "pregnant"; gestationDays: number | null }
  | { state: "not_recorded" };

export type FallbackReason =
  | "no_scheme_for_patient"
  | "no_band_for_age"
  | "sex_or_age_missing"
  | "context_not_recorded"
  | "method_not_covered";

export type Note = "pregnancy_not_recorded" | "altitude_not_adjusted" | "altitude_no_row";

export interface Adjustment {
  kind: "elevation";
  metres: number;
  amount: string;
  unit: string;
  configId: string;
  configVersion: number;
}

export interface Interpretation {
  basis: "reference" | "scheme";
  /** Reference basis: the Phase 1 flag. Scheme basis: null (the category speaks). */
  flag: Flag | null;
  /** `direction`: below or above the scheme's normal categories, read from the signed bounds. */
  category: {
    code: string;
    label: string;
    abnormal: boolean;
    direction: "low" | "high" | null;
  } | null;
  scheme: { id: string; version: number; label: string; source: string; rowSource: string } | null;
  adjustments: Adjustment[];
  notes: Note[];
  /** Why a scheme basis fell back to the reference interval (DS-4). */
  fallback: FallbackReason | null;
  /** The reference band: the basis, or shown "for information" beside a scheme (DS-3). */
  reference: Pick<RangeBand, "id" | "low" | "high"> | null;
}

export interface InterpretQuery {
  conceptId: string;
  unitUcum: string;
  /** The value as entered (UN-3); null with notDetected for "target not detected". */
  value: string | null;
  notDetected?: boolean;
  sex: Sex | null;
  ageDaysAtCollection: number | null;
  pregnancy: PregnancyContext;
  method: ResultMethod;
  at: Date;
  /** Phase 1's resolved reference range for this result (RR-*). */
  reference: ResolvedRange;
  /** The hospital's and the global signed configuration. */
  configs: readonly SignedConfig[];
}

const bandOf = (r: ResolvedRange) =>
  r.kind === "band" ? { id: r.band.id, low: r.band.low, high: r.band.high } : null;

/**
 * Steps 1–6 of the decision table: the basis, the signed scheme, the row that fits this patient (method, sex,
 * age, recorded pregnancy) and the elevation shift. Shared by the resolver and by the entry screen, which
 * shows what will flag a value before it is typed.
 */
export function pickRow(q: Omit<InterpretQuery, "value" | "notDetected" | "reference">):
  | { fallback: FallbackReason | null; reference: true; notes?: Note[] }
  | {
      reference: false;
      scheme: SignedConfig<"scheme">;
      row: SchemePayload["rows"][number];
      shift: string | null;
      adjustments: Adjustment[];
      notes: Note[];
    } {
  const notes: Note[] = [];
  // Step 1 (DS-2): no signed basis, or a reference basis, is Phase 1.
  const basis = inForce(q.configs, "flag_basis", q.conceptId, q.at);
  if (!basis || basis.payload.basis !== "scheme")
    return { fallback: null, reference: true as const };

  // Step 2: the scheme, signed, in the result's unit (RR-6's rule for schemes).
  const scheme = inForce(q.configs, "scheme", q.conceptId, q.at);
  if (!scheme || scheme.payload.unit !== q.unitUcum)
    return { fallback: "no_scheme_for_patient" as const, reference: true as const, notes };
  const s = scheme.payload;

  // Step 3 (Law 7, D-LAB2-10): a row must name this method.
  const forMethod = s.rows.filter((r) => r.methods.includes(q.method));
  if (!forMethod.length)
    return { fallback: "method_not_covered" as const, reference: true as const, notes };

  // Step 4 (RR-4, RR-5): sex and age.
  const needs = forMethod.some(
    (r) => r.sex !== "any" || r.ageFromDays !== null || r.ageToDays !== null,
  );
  if (needs && (q.sex === null || q.ageDaysAtCollection === null))
    return { fallback: "sex_or_age_missing" as const, reference: true as const, notes };
  const fits = forMethod.filter(
    (r) =>
      (r.sex === "any" || r.sex === q.sex) &&
      (r.ageFromDays === null || (q.ageDaysAtCollection ?? -1) >= r.ageFromDays) &&
      (r.ageToDays === null || (q.ageDaysAtCollection ?? Infinity) < r.ageToDays),
  );
  if (!fits.length)
    return { fallback: "no_scheme_for_patient" as const, reference: true as const, notes };

  // Step 5 (DS-5): the pregnancy row from the record; not recorded → the non-pregnant row, said so.
  const pick = (ctx: SchemePayload["rows"][number]["context"]) =>
    fits.filter((r) => r.context === ctx);
  let rows: typeof fits;
  if (q.pregnancy.state === "pregnant") {
    const g = q.pregnancy.gestationDays;
    rows = pick("pregnant").filter(
      (r) =>
        (r.gestationFromDays == null && r.gestationToDays == null) ||
        (g !== null &&
          (r.gestationFromDays == null || g >= r.gestationFromDays) &&
          (r.gestationToDays == null || g < r.gestationToDays)),
    );
    if (!rows.length && pick("pregnant").length)
      return { fallback: "context_not_recorded" as const, reference: true as const, notes };
  } else {
    rows = pick("not_pregnant");
    if (
      q.pregnancy.state === "not_recorded" &&
      rows.length &&
      fits.some((r) => r.context === "pregnant")
    )
      notes.push("pregnancy_not_recorded");
  }
  if (!rows.length) rows = pick("any");
  if (rows.length !== 1)
    return { fallback: "no_scheme_for_patient" as const, reference: true as const, notes };
  const row = rows[0]!;

  // Step 6 (DS-6, DS-7): the signed elevation, added to every cut-off.
  const adjustments: Adjustment[] = [];
  let shift: string | null = null;
  if (s.elevation) {
    const elev = inForce(q.configs, "elevation", "hospital", q.at);
    if (!elev) notes.push("altitude_not_adjusted");
    else {
      const m = elev.payload.metres;
      const hit = s.elevation.table.find((t) => m >= t.fromM && m <= t.toM);
      if (!hit) notes.push("altitude_no_row");
      else {
        shift = hit.amount;
        adjustments.push({
          kind: "elevation",
          metres: m,
          amount: hit.amount,
          unit: s.elevation.unit,
          configId: elev.id,
          configVersion: elev.version,
        });
      }
    }
  }

  return { reference: false, scheme, row, shift, adjustments, notes };
}

/** DS-3: the basis, the band or category, the flag, every adjustment, the reference band, or a reason. */
export function resolveInterpretation(q: InterpretQuery): Interpretation {
  const reference = bandOf(q.reference);
  const onReference = (fallback: FallbackReason | null, notes: Note[] = []): Interpretation => ({
    basis: "reference",
    flag: q.value !== null && reference ? computeFlag(q.value, reference) : null,
    category: null,
    scheme: null,
    adjustments: [],
    notes,
    fallback,
    reference,
  });

  const picked = pickRow(q);
  if (picked.reference) return onReference(picked.fallback, picked.notes ?? []);
  const { scheme, row, shift, adjustments, notes } = picked;
  const s = scheme.payload;

  // Step 7 (DS-8): the category, bounds exactly as signed.
  const category = categoryFor(s, row.bounds, q.value, q.notDetected === true, shift);
  // No value yet (the entry screen's preview): the scheme and row, no category.
  if (!category && (q.value !== null || q.notDetected))
    return onReference("no_scheme_for_patient", notes);
  return {
    basis: "scheme",
    flag: null,
    category: category
      ? {
          code: category.code,
          label: category.label,
          abnormal: category.abnormal,
          direction: category.abnormal ? directionOf(s, row.bounds, category.code) : null,
        }
      : null,
    scheme: {
      id: scheme.id,
      version: scheme.version,
      label: s.label,
      source: s.source,
      rowSource: row.source,
    },
    adjustments,
    notes,
    fallback: null,
    reference,
  };
}

/** An abnormal category lies below or above the row's normal categories. */
export function directionOf(
  s: Pick<SchemePayload, "categories">,
  bounds: SchemePayload["rows"][number]["bounds"],
  code: string,
): "low" | "high" | null {
  const normal = new Set(s.categories.filter((c) => !c.abnormal).map((c) => c.code));
  const mine = bounds.find((b) => b.category === code);
  const ok = bounds.filter((b) => normal.has(b.category));
  if (!mine || !ok.length) return null;
  if (mine.to !== null && ok.every((b) => b.from !== null && compareDecimal(mine.to!, b.from) <= 0))
    return "low";
  if (mine.from !== null && ok.every((b) => b.to !== null && compareDecimal(mine.from!, b.to) >= 0))
    return "high";
  return null;
}

/** DS-8: the category whose bounds hold the value; a shift is added to every bound (DS-6). */
export function categoryFor(
  s: Pick<SchemePayload, "categories">,
  bounds: SchemePayload["rows"][number]["bounds"],
  value: string | null,
  notDetected: boolean,
  shift: string | null,
) {
  if (notDetected) return s.categories.find((c) => c.notDetected) ?? null;
  if (value === null || !isDecimal(value)) return null;
  const at = (d: string | null) => (d === null || shift === null ? d : addDecimal(d, shift));
  const b = bounds.find((x) => {
    const from = at(x.from);
    const to = at(x.to);
    const lo =
      from === null ||
      (x.fromInclusive ? compareDecimal(value, from) >= 0 : compareDecimal(value, from) > 0);
    const hi =
      to === null ||
      (x.toInclusive ? compareDecimal(value, to) <= 0 : compareDecimal(value, to) < 0);
    return lo && hi;
  });
  return b ? (s.categories.find((c) => c.code === b.category) ?? null) : null;
}

/**
 * CD-04, CC-9: HbA1c IFCC (mmol/mol) for display only, from the signed REF-HBA1C-IFCC entry
 * (IFCC = (NGSP − intercept) / slope, whole number). Null without a signed entry. Never stored.
 */
export function hba1cIfcc(
  ngspPercent: string,
  configs: readonly SignedConfig[],
  at: Date,
): string | null {
  const ref = inForce(configs, "ref", "REF-HBA1C-IFCC", at);
  const intercept = ref?.payload.constants.intercept;
  const slope = ref?.payload.constants.slope;
  if (!intercept || !slope || !isDecimal(ngspPercent)) return null;
  return String(Math.round((Number(ngspPercent) - Number(intercept)) / Number(slope)));
}
