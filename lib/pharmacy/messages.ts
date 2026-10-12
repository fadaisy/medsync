import type { SignedCopy } from "@/content/signed-copy";
import type { RxCourse } from "@/lib/prescribing/reference/formulary-types";

import {
  bannedTermsIn,
  bannedTerms as ncdBannedTerms,
  normaliseTerm,
} from "@/lib/ncdreg/recall/banned";
import { DEFAULT_TIME_ZONE, directionsAsWritten, printDay } from "@/lib/pharmacy/print/label";
import { FORMULARY_DRUGS } from "@/lib/prescribing/reference/general-formulary";

/**
 * The patient's medicine list and messages (Pharmacy Phase 1, §5.11, §6.11). Pure; `now` is injected.
 *
 * - ML-1 One list entry per supplied line, however many batches (W7): the medicine as supplied, the
 *   directions as written, the pharmacist's line, the total given, the date and the supplying hospital.
 *   The entry names its source. The row reuses `selfMedicationFromPrescription`'s shape, keyed by
 *   `source_supply_id` (the column is Step 9's; this is the seam).
 * - ML-2 Owed, buying outside and declined lines show "Not given today" with the signed patient wording.
 * - ML-3 A refill date only from days covered, or from a structured course supplied in full. Course codes
 *   map 3d→3, 5d→5, 7d→7, 14d→14; `single`, `until_review` and none give no date. Nothing is estimated.
 * - ML-5 Refill status from supply events only: before the date `not_due`, on it `due`, after it `overdue`.
 * - ML-6 A reversed or corrected supply withdraws its share; all withdrawn, no entry.
 * - MS-1 The renderer takes the kind, the hospital's message name and the point's phone. Nothing else.
 * - MS-2 `bannedTermsScan`: the NCD scan's approach (normalised, start-of-word) over every catalogue
 *   medicine name and synonym, the NCD condition terms, restricted-class words, and the product, clinic,
 *   department, point and fixture patient names passed in; plus MedSync numbers and digits beside a unit.
 * - W1 No point phone, no owed or buying-outside message (B-67, B-68 both carry {phone}).
 * Strings: gate-a-content Part 1 (B-61 to B-69, X-19, X-20), all `draft`; RD-4 keeps them off in production.
 */

export const PATIENT_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  groupHead: "From {hospital} pharmacy, {date}.",
  given: "{n} {units} given today",
  pharmacistLine: "From the pharmacist: {line}",
  notGiven: "Not given today",
  buyingOutside:
    "The hospital pharmacy had none. Take the paper you were given, with your prescription, to any licensed pharmacy.",
  owed: "The hospital pharmacy had none today. Ask at the pharmacy, or call {phone}, to find out when it has arrived.",
  declined: "The pharmacy did not give this medicine. Speak to your doctor or the pharmacy.",
  refill: "Next supply due around {date}",
} as const satisfies SignedCopy & Record<string, unknown>;

export const MESSAGE_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  inAppNotAvailable:
    "One of your medicines was not available at the hospital today. Open MedSync to see what to do.",
  smsOwed:
    "MedSync: one of your medicines was not available at {hospital message name} today. Call the pharmacy on {phone} to ask when it has arrived.",
  smsBuyingOutside:
    "MedSync: one of your medicines was not available at {hospital message name} today. Keep the paper you were given, or call the pharmacy on {phone}.",
  inStock: "A medicine the pharmacy owed you is in stock at {hospital message name} today.",
} as const satisfies SignedCopy & Record<string, unknown>;

const fill = (s: string, v: Record<string, string>) =>
  s.replace(/\{([\w ]+)\}/g, (m, k: string) => v[k] ?? m);

// ─── ML-3, ML-5: the refill date ─────────────────────────────────────────

const COURSE_DAYS: Partial<Record<RxCourse, number>> = { "3d": 3, "5d": 5, "7d": 7, "14d": 14 };

/** "YYYY-MM-DD" in, "YYYY-MM-DD" out, or null when ML-3 allows no date. */
export function refillDate(input: {
  suppliedOn: string;
  daysCovered: number | null;
  courseCode: RxCourse | null;
  suppliedInFull: boolean;
}): string | null {
  const days =
    input.daysCovered !== null && Number.isInteger(input.daysCovered) && input.daysCovered > 0
      ? input.daysCovered
      : input.suppliedInFull && input.courseCode
        ? (COURSE_DAYS[input.courseCode] ?? null)
        : null;
  if (days === null) return null;
  const d = new Date(`${input.suppliedOn}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export type RefillStatus = "not_due" | "due" | "overdue";

export interface RefillSupply {
  medicineId: string;
  suppliedOn: string;
  daysCovered: number | null;
  courseCode: RxCourse | null;
  suppliedInFull: boolean;
  withdrawn: boolean;
}

/** ML-5: per medicine with a refill date, from its latest standing supply. */
export function refillStatus(
  supplies: readonly RefillSupply[],
  now: Date,
  timeZone = DEFAULT_TIME_ZONE,
): { medicineId: string; refillOn: string; status: RefillStatus }[] {
  const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(now);
  const latest = new Map<string, RefillSupply>();
  for (const s of supplies) {
    if (s.withdrawn) continue;
    const seen = latest.get(s.medicineId);
    if (!seen || s.suppliedOn > seen.suppliedOn) latest.set(s.medicineId, s);
  }
  const out: { medicineId: string; refillOn: string; status: RefillStatus }[] = [];
  for (const [medicineId, s] of latest) {
    const refillOn = refillDate(s);
    if (!refillOn) continue;
    const status: RefillStatus =
      today < refillOn ? "not_due" : today === refillOn ? "due" : "overdue";
    out.push({ medicineId, refillOn, status });
  }
  return out;
}

// ─── ML-1, ML-2, ML-6: the list ──────────────────────────────────────────

export interface ListSupply {
  id: string;
  quantity: number;
  issueUnit: string;
  suppliedAt: string;
  pharmacistLine: string | null;
  /** Reversed, or recorded in error (ML-6). */
  withdrawn: boolean;
}

export interface ListLineGroup {
  /** As supplied: generic name, form and strength. */
  medicine: string;
  directions: string;
  hospitalName: string;
  supplies: readonly ListSupply[];
  refillOn: string | null;
  timeZone?: string;
}

export function patientListEntry(group: ListLineGroup) {
  const standing = group.supplies.filter((s) => !s.withdrawn);
  if (standing.length === 0) return null;
  const first = [...standing].sort(
    (a, b) => Date.parse(a.suppliedAt) - Date.parse(b.suppliedAt),
  )[0]!;
  const totals = new Map<string, number>();
  for (const s of standing) totals.set(s.issueUnit, (totals.get(s.issueUnit) ?? 0) + s.quantity);
  const line = standing.find((s) => s.pharmacistLine !== null)?.pharmacistLine ?? null;
  return {
    row: {
      name: group.medicine,
      dose: null,
      instructions: directionsAsWritten(group.directions),
      schedule_pattern: "as_needed" as const,
      schedule_times: null,
      notes: fill(PATIENT_COPY.groupHead, {
        hospital: group.hospitalName,
        date: printDay(first.suppliedAt, group.timeZone),
      }),
      source_supply_id: first.id,
    },
    pharmacistLine: line === null ? null : fill(PATIENT_COPY.pharmacistLine, { line }),
    // One unit per line in practice; units are never converted or added across (Law 7).
    given: [...totals]
      .map(([units, n]) => fill(PATIENT_COPY.given, { n: String(n), units }))
      .join(" · "),
    refill: group.refillOn
      ? fill(PATIENT_COPY.refill, { date: printDay(`${group.refillOn}T12:00:00Z`, group.timeZone) })
      : null,
  };
}

export type NotGivenOutcome = "owed" | "buying_outside" | "declined";

/** ML-2. Owed needs the point's phone (B-63); a live point always has one (RD-1 condition 6). */
export function notGivenWording(
  outcome: NotGivenOutcome,
  phone: string,
): { lead: string; text: string } {
  const text =
    outcome === "owed"
      ? fill(PATIENT_COPY.owed, { phone })
      : outcome === "buying_outside"
        ? PATIENT_COPY.buyingOutside
        : PATIENT_COPY.declined;
  return { lead: PATIENT_COPY.notGiven, text };
}

// ─── MS-1: the renderer ──────────────────────────────────────────────────

export type MessageKind = "owed" | "buying_outside" | "in_stock";
export type MessageChannel = "sms" | "in_app";

const GSM7_BASIC =
  "@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !\"#¤%&'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà";
const GSM7_EXTENDED = "^{}\\[~]|€\f";

/** GSM-7 length in septets (extension characters count two), or null if a character is outside it. */
export function gsm7Length(text: string): number | null {
  let n = 0;
  for (const ch of text) {
    if (GSM7_BASIC.includes(ch)) n += 1;
    else if (GSM7_EXTENDED.includes(ch)) n += 2;
    else return null;
  }
  return n;
}

export const SMS_LIMIT = 160;

export type RenderResult =
  | { ok: true; text: string; fitsOneSms: boolean }
  | { ok: false; reason: "no_point_phone" | "no_message_name" };

export function renderMessage(
  kind: MessageKind,
  { messageName, phone }: { messageName: string; phone: string | null },
  channel: MessageChannel = "sms",
): RenderResult {
  const name = messageName.trim();
  if (!name) return { ok: false, reason: "no_message_name" };
  const p = phone?.trim() ?? "";
  if (kind !== "in_stock" && channel === "sms" && !p)
    return { ok: false, reason: "no_point_phone" };
  const template =
    kind === "in_stock"
      ? MESSAGE_COPY.inStock
      : channel === "in_app"
        ? MESSAGE_COPY.inAppNotAvailable
        : kind === "owed"
          ? MESSAGE_COPY.smsOwed
          : MESSAGE_COPY.smsBuyingOutside;
  const text = fill(template, { "hospital message name": name, phone: p });
  const len = gsm7Length(text);
  return { ok: true, text, fitsOneSms: len !== null && len <= SMS_LIMIT };
}

// ─── MS-2: the banned-term scan ──────────────────────────────────────────

/** Restricted-class words: a message never says what kind of medicine it is about. */
const RESTRICTED_CLASS_TERMS = ["controlled", "narcotic", "psychotropic", "opioid", "restricted"];

/** Every catalogue medicine: the generic name, its parts (combinations, comma heads), its bracketed synonym, its id. */
export function medicineTerms(): string[] {
  return FORMULARY_DRUGS.flatMap((d) => {
    const bracketed = [...d.generic.matchAll(/\(([^)]+)\)/g)].map((m) => m[1]!);
    const bare = d.generic.replace(/\([^)]*\)/g, " ");
    return [d.generic, bare, d.id, ...bracketed, ...bare.split(/[–,]/)];
  });
}

export interface ScanExtras {
  products?: readonly string[];
  /** Clinic, department and dispensing-point names. */
  places?: readonly string[];
  patientNames?: readonly string[];
}

const MEDSYNC_NUMBER = /MS-\d{4}-\d{5}/gi;
const DIGITS_BESIDE_UNIT =
  /\d+(?:[.,]\d+)?\s*(?:mg|mcg|µg|ug|g|kg|ml|l|iu|units?|mmol|%|tablets?|tabs?|capsules?|caps?|drops?|puffs?|sachets?|vials?|ampoules?)(?![a-z])/gi;

/** MS-2: every banned term or pattern the text contains; empty means it passes. */
export function bannedTermsScan(text: string, extras: ScanExtras = {}): string[] {
  const terms = [
    ...new Set(
      [
        ...ncdBannedTerms(),
        ...medicineTerms(),
        ...RESTRICTED_CLASS_TERMS,
        ...(extras.products ?? []),
        ...(extras.places ?? []),
        ...(extras.patientNames ?? []),
      ]
        .map(normaliseTerm)
        .filter((t) => t.length > 1),
    ),
  ];
  return [
    ...bannedTermsIn(text, terms),
    ...(text.match(MEDSYNC_NUMBER) ?? []),
    ...(text.match(DIGITS_BESIDE_UNIT) ?? []),
  ];
}
