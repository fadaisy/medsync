/**
 * Units and the test catalogue (Lab Phase 1, §6.1, rules UN-1 to UN-8; ADR 0240). Pure.
 *
 * A numeric component has exactly one unit, fixed per component version. Values are kept as the decimal
 * string the technologist entered (never a float) and compared exactly. No value is ever converted
 * between units (UN-4, D-LAB1-26): a unit changes only by a new component version.
 */

export type ResultType = "number" | "coded" | "text";

/** A component version, as `lab_component_measures` holds it (0103). Bounds are decimal strings. */
export interface Measure {
  id: string;
  version: number;
  resultType: ResultType;
  unitUcum: string | null;
  unitDisplay: string | null;
  decimalPlaces: number | null;
  loincCode: string | null;
  entryCheckLow: string | null;
  entryCheckHigh: string | null;
  /** Lab Phase 2 (ME-1): the method in force and, for creatinine, IDMS traceability. */
  methodCode?: string | null;
  idmsTraceable?: boolean | null;
}

// ─── Exact decimals (UN-3) ───────────────────────────────────────────────

const DECIMAL = /^-?\d+(\.\d+)?$/;

/** A decimal string as an integer and a scale: "7.20" → 720n, 2. */
function scaled(d: string): { n: bigint; scale: number } {
  if (!DECIMAL.test(d)) throw new Error(`not a decimal: ${d}`);
  const [int, frac = ""] = d.split(".");
  return { n: BigInt(int! + frac), scale: frac.length };
}

/** Exact comparison of two decimal strings: -1, 0 or 1. "7.2" equals "7.20". */
export function compareDecimal(a: string, b: string): -1 | 0 | 1 {
  const x = scaled(a);
  const y = scaled(b);
  const s = Math.max(x.scale, y.scale);
  const xa = x.n * 10n ** BigInt(s - x.scale);
  const ya = y.n * 10n ** BigInt(s - y.scale);
  return xa < ya ? -1 : xa > ya ? 1 : 0;
}

export const isDecimal = (s: string) => DECIMAL.test(s);

/** Exact sum of two decimal strings, at the larger scale: "11.0" + "0.8" → "11.8". */
export function addDecimal(a: string, b: string): string {
  const x = scaled(a);
  const y = scaled(b);
  const s = Math.max(x.scale, y.scale);
  const n = x.n * 10n ** BigInt(s - x.scale) + y.n * 10n ** BigInt(s - y.scale);
  const neg = n < 0n;
  const digits = (neg ? -n : n).toString().padStart(s + 1, "0");
  const out = s ? `${digits.slice(0, -s)}.${digits.slice(-s)}` : digits;
  return neg ? `-${out}` : out;
}

// ─── UN-1: a numeric component needs its unit ────────────────────────────

export type ResultableCheck = { ok: true } | { ok: false; reason: "no_unit" | "no_measure" };

export function canResult(measure: Measure | null): ResultableCheck {
  if (!measure) return { ok: false, reason: "no_measure" };
  if (measure.resultType !== "number") return { ok: true };
  return measure.unitUcum && measure.unitDisplay ? { ok: true } : { ok: false, reason: "no_unit" };
}

// ─── UN-5: parsing what was typed ────────────────────────────────────────

export type ParsedInput =
  | { ok: true; value: string }
  | { ok: false; reason: "empty" | "not_a_number" | "too_many_decimals" };

/**
 * Accepts "7.2" and "7,2" (a decimal comma is a decimal point, never a thousands separator; hazard 24),
 * keeps trailing zeros ("7.20" stays "7.20", UN-3), and refuses everything else: "<0.1", "-", "1e3",
 * "7.2 mmol/L", "1 234". More decimals than the component allows is refused, never rounded.
 */
export function parseResultInput(raw: string, decimalPlaces: number | null): ParsedInput {
  const s = raw.trim();
  if (s === "") return { ok: false, reason: "empty" };
  if (!/^-?\d+([.,]\d+)?$/.test(s)) return { ok: false, reason: "not_a_number" };
  const value = s.replace(",", ".");
  const frac = value.split(".")[1] ?? "";
  if (decimalPlaces !== null && frac.length > decimalPlaces)
    return { ok: false, reason: "too_many_decimals" };
  return { ok: true, value: value.replace(/^(-?)0+(?=\d)/, "$1") };
}

/** Display at the component's decimal places: padded, never rounded (entry refuses more places). */
export function formatResult(value: string, decimalPlaces: number | null): string {
  if (decimalPlaces === null || !isDecimal(value)) return value;
  const [int, frac = ""] = value.split(".");
  if (frac.length >= decimalPlaces) return value;
  return decimalPlaces === 0 ? int! : `${int}.${frac.padEnd(decimalPlaces, "0")}`;
}

// ─── UN-6: the entry check ───────────────────────────────────────────────

/** Outside the entry band needs a recorded confirm. With no band there is no check. */
export function entryCheck(value: string, measure: Measure): "no_check" | "inside" | "outside" {
  const { entryCheckLow: lo, entryCheckHigh: hi } = measure;
  if (lo === null && hi === null) return "no_check";
  if (lo !== null && compareDecimal(value, lo) < 0) return "outside";
  if (hi !== null && compareDecimal(value, hi) > 0) return "outside";
  return "inside";
}

// ─── UN-4: a unit changes only by a new version ──────────────────────────

/** The fields that define how a value is read. Any change to one is a new version. */
const DEFINING = [
  "resultType",
  "unitUcum",
  "unitDisplay",
  "decimalPlaces",
  "loincCode",
  "entryCheckLow",
  "entryCheckHigh",
  "methodCode",
  "idmsTraceable",
] as const;

export type MeasureDraft = Pick<Measure, (typeof DEFINING)[number]>;

/** "same" when nothing defining changed; otherwise the next version number. The old version is kept. */
export function measureChange(
  current: Measure | null,
  draft: MeasureDraft,
): { kind: "same" } | { kind: "new_version"; version: number } {
  if (current && DEFINING.every((k) => (current[k] ?? null) === (draft[k] ?? null)))
    return { kind: "same" };
  return { kind: "new_version", version: (current?.version ?? 0) + 1 };
}

/** UN-1 and UN-7 at set-up: what stops a draft being saved. */
export function measureDraftErrors(
  draft: MeasureDraft,
  knownUcum: ReadonlySet<string>,
  knownLoinc: ReadonlySet<string>,
): string[] {
  const errors: string[] = [];
  if (draft.resultType === "number") {
    if (!draft.unitUcum || !draft.unitDisplay) errors.push("unit_required");
    else if (!knownUcum.has(draft.unitUcum)) errors.push("unit_unknown");
    if (draft.decimalPlaces === null || draft.decimalPlaces < 0 || draft.decimalPlaces > 6)
      errors.push("decimal_places");
  } else if (draft.unitUcum || draft.entryCheckLow || draft.entryCheckHigh) {
    errors.push("unit_on_non_numeric");
  }
  if (draft.loincCode !== null && !knownLoinc.has(draft.loincCode)) errors.push("loinc_unknown");
  const { entryCheckLow: lo, entryCheckHigh: hi } = draft;
  if ((lo !== null && !isDecimal(lo)) || (hi !== null && !isDecimal(hi)))
    errors.push("entry_check_not_decimal");
  else if (lo !== null && hi !== null && compareDecimal(lo, hi) >= 0)
    errors.push("entry_check_order");
  return errors;
}

// ─── UN-2, UN-7, UN-8: what a result carries, and what FHIR is told ──────

/** What the result stores at entry (UN-2). Never recomputed after release. */
export interface ResultValue {
  valueDecimal: string | null;
  valueText: string;
  unitUcum: string | null;
  unitDisplay: string | null;
  measureVersion: number | null;
}

/** A released result as shown: snapshotted values as stored; older results exactly as typed (UN-8). */
export function displayValue(
  snapshot: ResultValue | null,
  legacy: { value: string; unit: string | null },
): { value: string; unit: string | null; asTyped: boolean } {
  if (!snapshot) return { value: legacy.value, unit: legacy.unit, asTyped: true };
  return { value: snapshot.valueText, unit: snapshot.unitDisplay, asTyped: false };
}

/** UN-7: LOINC and UCUM are emitted when present and never invented. A legacy unit is text only. */
export function fhirValue(
  snapshot: ResultValue | null,
  legacy: { value: string; unit: string | null },
  loincCode: string | null,
): {
  code?: { system: string; code: string };
  valueQuantity?: Record<string, string | number>;
  valueString?: string;
} {
  const code = loincCode ? { system: "http://loinc.org", code: loincCode } : undefined;
  if (snapshot?.valueDecimal != null && snapshot.unitUcum) {
    return {
      ...(code && { code }),
      valueQuantity: {
        value: Number(snapshot.valueDecimal),
        unit: snapshot.unitDisplay ?? snapshot.unitUcum,
        system: "http://unitsofmeasure.org",
        code: snapshot.unitUcum,
      },
    };
  }
  const v = snapshot?.valueText ?? legacy.value;
  const unit = snapshot ? snapshot.unitDisplay : legacy.unit;
  return { ...(code && { code }), valueString: unit ? `${v} ${unit}` : v };
}
