/**
 * The general formulary MS-RX-CAT-001, read (ADR 0187). Pure: lookups over the generated
 * catalogue, the signed regimens laid over it, and regimen resolution for a patient.
 *
 * A regimen is offered only from a dose that is `verified` and CSO-signed; otherwise the dialog
 * says "No verified regimen yet" and the prescriber types the dose. Per-kg arithmetic runs only
 * with a weight from the vitals (ADR 0188): no weight, no number.
 */
import type {
  DiagnosisLink,
  DoseBand,
  DoseUnit,
  Drug,
  DrugClass,
  DrugDose,
  Regimen,
  SupportiveItem,
} from "./reference/formulary-types";

import { PAEDIATRIC_AGE_THRESHOLD } from "./engine";
import { SIGNED_DOSE_ORIGIN, SIGNED_DOSES } from "./reference/formulary-regimens";
import {
  ALLERGY_GROUPS,
  DIAGNOSIS_LINKS,
  DRUG_CLASSES,
  DRUG_SYSTEMS,
  FORMULARY_DRUGS,
  SUPPORTIVE_ITEMS,
} from "./reference/general-formulary";

/**
 * An older adult, for the "Dose by age" table only (proposed; no source splits by it today).
 * Where a drug has no older-adult row the adult regimen applies, and the dialog says so.
 */
export const OLDER_ADULT_AGE = 65;

const withDose = (d: Drug): Drug => {
  const signed = SIGNED_DOSES[d.id];
  return signed ? { ...d, dose: { ...signed, verifyAt: d.dose.verifyAt } } : d;
};

export const DRUGS: readonly Drug[] = FORMULARY_DRUGS.map(withDose);
const DRUG_BY_ID = new Map(DRUGS.map((d) => [d.id, d]));
const CLASS_BY_ID = new Map(DRUG_CLASSES.map((c) => [c.id, c]));
const LINK_BY_PROFILE = new Map(DIAGNOSIS_LINKS.map((l) => [l.profileId, l]));
const SYSTEM_NAME = new Map(DRUG_SYSTEMS.map((s) => [s.id, s.name]));
const GROUP_NAME = new Map(ALLERGY_GROUPS.map((g) => [g.id, g.name]));

export { DRUG_CLASSES, SUPPORTIVE_ITEMS };

export const drugById = (id: string): Drug | undefined => DRUG_BY_ID.get(id);
export const classById = (id: string): DrugClass | undefined => CLASS_BY_ID.get(id);
export const systemName = (id: string): string => SYSTEM_NAME.get(id) ?? id;
export const allergyGroupName = (id: string): string => GROUP_NAME.get(id) ?? id;
export const diagnosisLink = (profileId: string): DiagnosisLink | undefined =>
  LINK_BY_PROFILE.get(profileId);

/** The drugs of a class; a parent class lists its children's drugs, class by class. */
export function drugsInClass(classId: string): Drug[] {
  const own = DRUGS.filter((d) => d.class === classId);
  const children = DRUG_CLASSES.filter((c) => c.parent === classId);
  return [...own, ...children.flatMap((c) => drugsInClass(c.id))];
}

/** A drug's generic name, class and system, lower-cased: what the search and the filter match. */
const HAY = new Map(
  DRUGS.map((d) => {
    const cls = classById(d.class);
    return [
      d.id,
      [d.generic, cls?.name ?? "", systemName(cls?.system ?? "")].join(" ").toLowerCase(),
    ];
  }),
);
const wordsOf = (query: string) => query.toLowerCase().split(/\s+/).filter(Boolean);
const matches = (d: Drug, words: string[]) => words.every((w) => HAY.get(d.id)!.includes(w));

/** Drugs whose generic name, class or system matches every word typed. */
export function searchDrugs(query: string, limit = 30): Drug[] {
  const words = wordsOf(query);
  if (!words.length) return [];
  return DRUGS.filter((d) => matches(d, words)).slice(0, limit);
}

export interface BrowseClass {
  id: string;
  name: string;
  drugs: Drug[];
}
export interface BrowseSystem {
  id: string;
  name: string;
  classes: BrowseClass[];
  /** Drugs shown in this system. */
  count: number;
}

/**
 * Every drug for "Show all medicines": the catalogue's systems in its order, each system's classes
 * in catalogue order, drugs A to Z within a class (an order, never a ranking). A class with no drug
 * of its own (Cephalosporins, whose drugs sit in its generations) is not a heading. The filter is
 * the search's: every word typed must match the generic name, the class or the system; empty
 * groups drop out.
 */
export function formularyBrowse(query = ""): BrowseSystem[] {
  const words = wordsOf(query);
  const byName = (a: Drug, b: Drug) =>
    a.generic.localeCompare(b.generic, "en", { sensitivity: "base" });
  return DRUG_SYSTEMS.map((s) => {
    const classes = DRUG_CLASSES.filter((c) => c.system === s.id)
      .map((c) => ({
        id: c.id,
        name: c.name,
        drugs: DRUGS.filter((d) => d.class === c.id && matches(d, words)).sort(byName),
      }))
      .filter((c) => c.drugs.length > 0);
    return {
      id: s.id,
      name: s.name,
      classes,
      count: classes.reduce((n, c) => n + c.drugs.length, 0),
    };
  }).filter((s) => s.count > 0);
}

/** Supportive items a diagnosis links to, with their classes. */
export function supportiveFor(profileId: string): SupportiveItem[] {
  const link = diagnosisLink(profileId);
  return SUPPORTIVE_ITEMS.filter((s) => link?.supportive.includes(s.id));
}

export const isFluid = (d: Drug): boolean => d.class === "fluid.iv";

/* ─── Reference state ────────────────────────────────────────────── */

export type ReferenceTag = "signed_emergency" | "verified_awaiting_cso" | "not_verified";

export function referenceTag(dose: DrugDose): ReferenceTag {
  if (dose.status !== "verified") return "not_verified";
  if (dose.csoSigned)
    return dose.origin === "emergency-formulary" ? "signed_emergency" : "verified_awaiting_cso";
  return "verified_awaiting_cso";
}

export const REFERENCE_TAG_WORD: Record<ReferenceTag, string> = {
  signed_emergency: "Signed emergency formulary",
  verified_awaiting_cso: "Verified · awaiting CSO",
  not_verified: "Not verified",
};

/** Regimens are offered only from a verified, CSO-signed dose. */
export const offersRegimens = (dose: DrugDose): boolean =>
  dose.status === "verified" && dose.csoSigned === true && dose.regimens.length > 0;

/** The emergency formulary entry a signed catalogue drug came from, if any. */
export const emergencyOriginOf = (drugId: string): string | undefined => SIGNED_DOSE_ORIGIN[drugId];

/* ─── Regimen resolution ─────────────────────────────────────────── */

export function patientBand(ageYears: number | null): DoseBand | null {
  if (ageYears == null) return null;
  if (ageYears < PAEDIATRIC_AGE_THRESHOLD) return "child";
  return ageYears >= OLDER_ADULT_AGE ? "olderAdult" : "adult";
}

export const BAND_WORD: Record<DoseBand, string> = {
  child: "Child",
  adult: "Adult",
  olderAdult: "Older adult",
};

export interface WeightFact {
  kg: number;
  /** ISO time the weight was recorded. */
  at: string;
  /** Where it came from, in words ("triage", "vitals"). */
  source: string;
}

export interface RegimenPatient {
  ageYears: number | null;
  weight: WeightFact | null;
}

export interface ResolvedDose {
  num: number | null;
  low?: number;
  high?: number;
  unit: DoseUnit;
}

export interface ResolvedRegimen {
  regimen: Regimen;
  dose: ResolvedDose;
  /** The arithmetic in words, e.g. "2 mL/kg × 20 kg = 40 mL". */
  working: string | null;
  /** Why the dose could not be worked out, in words. */
  unresolved: string | null;
  /** This row applies to the patient and may be pre-selected. */
  applies: boolean;
}

export interface RegimenResolution {
  band: DoseBand | null;
  regimens: ResolvedRegimen[];
  /** A sentence for the dialog: why nothing shows, or which band's row is used. */
  note: string | null;
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const fmt = (n: number) => (Number.isInteger(n) ? String(n) : n.toFixed(1));

function perKgDose(r: Regimen, weight: WeightFact | null): Omit<ResolvedRegimen, "applies"> {
  const pk = r.perKg!;
  const rate = pk.amountHigh != null ? `${fmt(pk.amount)}–${fmt(pk.amountHigh)}` : fmt(pk.amount);
  if (!weight)
    return {
      regimen: r,
      dose: { num: null, unit: r.unit },
      working: null,
      unresolved: `${rate} ${pk.unit}/kg: no weight in the vitals, so the dose is not worked out.`,
    };
  let low = round1(pk.amount * weight.kg);
  let high = pk.amountHigh != null ? round1(pk.amountHigh * weight.kg) : null;
  if (pk.max != null) {
    low = Math.min(low, pk.max);
    if (high != null) high = Math.min(high, pk.max);
  }
  const result = high != null ? `${fmt(low)}–${fmt(high)}` : fmt(low);
  const strength = r.strength ? ` of ${r.strength}` : "";
  return {
    regimen: r,
    dose: high != null ? { num: null, low, high, unit: r.unit } : { num: low, unit: r.unit },
    working: `${rate} ${pk.unit}/kg × ${fmt(weight.kg)} kg = ${result} ${r.unit}${strength}`,
    unresolved: null,
  };
}

function fixedDose(r: Regimen): Omit<ResolvedRegimen, "applies"> {
  if (r.doseRange)
    return {
      regimen: r,
      dose: { num: null, low: r.doseRange.low, high: r.doseRange.high, unit: r.unit },
      working: null,
      unresolved: null,
    };
  return {
    regimen: r,
    dose: { num: r.doseNum ?? null, unit: r.unit },
    working: null,
    unresolved: null,
  };
}

/**
 * Which rows of an age- or weight-split child regimen apply. A "below" row (e.g. "<8 yr or
 * <25 kg") applies when any known criterion says so; an "at least" row applies only when every
 * known criterion says so and no "below" row applies. With neither age nor weight, none applies.
 */
function splitApplies(rows: Regimen[], p: RegimenPatient): Map<string, boolean> {
  const kg = p.weight?.kg ?? null;
  const out = new Map<string, boolean>();
  const below = rows.filter(
    (r) => r.appliesWhen?.ageYearsBelow != null || r.appliesWhen?.weightKgBelow != null,
  );
  const belowApplies = (r: Regimen) =>
    (p.ageYears != null &&
      r.appliesWhen?.ageYearsBelow != null &&
      p.ageYears < r.appliesWhen.ageYearsBelow) ||
    (kg != null && r.appliesWhen?.weightKgBelow != null && kg < r.appliesWhen.weightKgBelow);
  const anyBelow = below.some(belowApplies);
  for (const r of rows) {
    const w = r.appliesWhen;
    if (!w) {
      out.set(r.id, true);
    } else if (below.includes(r)) {
      out.set(r.id, belowApplies(r));
    } else {
      const known =
        (p.ageYears != null && w.ageYearsAtLeast != null) ||
        (kg != null && w.weightKgAtLeast != null);
      const ageOk =
        p.ageYears == null || w.ageYearsAtLeast == null || p.ageYears >= w.ageYearsAtLeast;
      const kgOk = kg == null || w.weightKgAtLeast == null || kg >= w.weightKgAtLeast;
      out.set(r.id, known && ageOk && kgOk && !anyBelow);
    }
  }
  return out;
}

/** The drug's signed regimens for this patient's band, resolved with the vitals weight. */
export function resolveRegimens(drug: Drug, p: RegimenPatient): RegimenResolution {
  const band = patientBand(p.ageYears);
  if (!offersRegimens(drug.dose))
    return { band, regimens: [], note: "No verified regimen yet: type the dose." };
  if (!band)
    return { band, regimens: [], note: "Age not recorded: a regimen cannot be chosen for a band." };
  let rows = drug.dose.regimens.filter((r) => r.band === band);
  let note: string | null = null;
  if (!rows.length && band === "olderAdult") {
    rows = drug.dose.regimens.filter((r) => r.band === "adult");
    if (rows.length)
      note = "The source gives no separate older-adult dose: the adult regimen is shown.";
  }
  if (!rows.length)
    return {
      band,
      regimens: [],
      note: `No verified ${BAND_WORD[band].toLowerCase()} regimen yet: type the dose.`,
    };
  const split = splitApplies(rows, p);
  const regimens = rows.map((r) => ({
    ...(r.perKg ? perKgDose(r, p.weight) : fixedDose(r)),
    applies: split.get(r.id) ?? true,
  }));
  if (regimens.length > 1 && !regimens.some((r) => r.applies))
    note ??= "Age and weight are not recorded: choose the row that applies.";
  return { band, regimens, note };
}

/** The regimen by id on a drug, if it is offered. */
export function regimenById(drug: Drug, regimenId: string): Regimen | undefined {
  return offersRegimens(drug.dose) ? drug.dose.regimens.find((r) => r.id === regimenId) : undefined;
}
