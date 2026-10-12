import type { PharmacyAccess } from "@/lib/pharmacy/access";

import { isoFromParts, normalizeUgPhone } from "@/lib/onboarding/fields";
import { can } from "@/lib/pharmacy/access";
import { localDate } from "@/lib/pharmacy/stock/ledger";

/**
 * The right patient at the window (Pharmacy Phase 1; SU-4, SU-5, Law 6, D-PH1-16, gate-a-proposal §1 H5
 * and §7). Pure: the server injects `blindIndex` (and, only where `phone_hmac` is null, a way to decrypt
 * the stored phone), so nothing here holds a key or reads a row.
 *
 * - SU-4 The second identifier is the date of birth or the phone on file, typed by the supplier and
 *   compared here after normalising: dates from the common day-first forms or ISO (a two-digit year is
 *   refused, never guessed); phones to E.164 through the same normaliser sign-up used to write
 *   `phone_hmac`, then compared by blind index, falling back to decrypt-and-compare only where the
 *   index is null. The answer is "match" or "mismatch": no stored value is ever returned.
 * - H5 Five wrong attempts per patient per hospital-local day close the typed check for that patient,
 *   until the pharmacy in charge (`pharmacy.manage`) writes a `reopened` attempt row.
 * - D-PH1-16 "Identified another way": a route from the signed list; "other" needs a note.
 * - SU-5 The collector: the patient, a representative (name and relationship), or, only where individual
 *   inpatient supply is on (D-PH1-02), a member of this hospital's staff.
 * Words: Appendix B (B-38, B-39), draft.
 */

export const IDENTITY_COPY = {
  status: "draft",
  signedBy: null,
  signedOn: null,
  rule: "Two identifiers are needed before the hand-over can be recorded. Ask the person to say them; do not read them out.",
  mismatch: "This does not match. Check you have the right patient.",
} as const;

/* ─── SU-4: normalising what was typed ─────────────────────────────── */

/** DD/MM/YYYY, D/M/YYYY, DD-MM-YYYY, DD.MM.YYYY or YYYY-MM-DD → ISO; anything else (or no such day) → null. */
export function normaliseDob(input: string): string | null {
  const s = input.replace(/\s+/g, "");
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (iso) return isoFromParts(iso[3]!, iso[2]!, iso[1]!);
  const dmy = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{4})$/.exec(s);
  return dmy ? isoFromParts(dmy[1]!, dmy[3]!, dmy[4]!) : null;
}

/** 07…, 7…, 256…, +256… with spaces or dashes → E.164; the normaliser `phone_hmac` was written with. */
export const normalisePhoneUg = (input: string): string | null => normalizeUgPhone(input);

export type SecondIdentifier = "date_of_birth" | "phone";

/** SU-4: compare on the server. Returns only "match" or "mismatch". */
export function compareSecondIdentifier(input: {
  kind: SecondIdentifier;
  typed: string;
  /** `patient_profiles.date_of_birth`, ISO. */
  storedDob: string | null;
  phoneHmac: string | null;
  blindIndex: (value: string) => string;
  /** Only called where `phoneHmac` is null. */
  decryptPhone?: () => string | null;
}): "match" | "mismatch" {
  if (input.kind === "date_of_birth") {
    const typed = normaliseDob(input.typed);
    return typed !== null && input.storedDob !== null && typed === input.storedDob
      ? "match"
      : "mismatch";
  }
  const typed = normalisePhoneUg(input.typed);
  if (typed === null) return "mismatch";
  if (input.phoneHmac !== null)
    return input.blindIndex(typed) === input.phoneHmac ? "match" : "mismatch";
  const stored = input.decryptPhone?.() ?? null;
  return stored !== null && normalisePhoneUg(stored) === typed ? "match" : "mismatch";
}

/* ─── H5: the attempt limit ────────────────────────────────────────── */

export const MAX_WRONG_ATTEMPTS = 5;

/** One pharmacy_identity_attempts row (the typed value is never stored). */
export interface IdentityAttempt {
  outcome: "match" | "mismatch" | "closed" | "reopened";
  attemptedAt: Date;
}

/** H5: wrong attempts left today (Africa/Kampala) for this patient, counted since the last reopening. */
export function attemptsLeft(attempts: readonly IdentityAttempt[], today: string): number {
  let wrong = 0;
  for (const a of [...attempts]
    .filter((x) => localDate(x.attemptedAt) === today)
    .sort((x, y) => x.attemptedAt.getTime() - y.attemptedAt.getTime())) {
    if (a.outcome === "reopened") wrong = 0;
    else if (a.outcome === "mismatch") wrong += 1;
  }
  return Math.max(0, MAX_WRONG_ATTEMPTS - wrong);
}

export const typedCheckClosed = (attempts: readonly IdentityAttempt[], today: string): boolean =>
  attemptsLeft(attempts, today) === 0;

/** H5: only the pharmacy in charge reopens a closed typed check. */
export const mayReopenTypedCheck = (access: PharmacyAccess): boolean =>
  can(access, "pharmacy.manage");

/* ─── D-PH1-16: identified another way ─────────────────────────────── */

export function identifiedAnotherWay(
  route: string,
  note: string | null | undefined,
  /** The signed route codes in force; null while unsigned. */
  signedRoutes: readonly string[] | null,
):
  | { ok: true; how: string; note: string | null }
  | { ok: false; reason: "unsigned" | "unknown_route" | "note_needed" | "note_too_long" } {
  if (!signedRoutes) return { ok: false, reason: "unsigned" };
  if (!signedRoutes.includes(route)) return { ok: false, reason: "unknown_route" };
  const n = note?.trim() ?? "";
  if (n.length > 500) return { ok: false, reason: "note_too_long" };
  if (route === "other" && n.length < 2) return { ok: false, reason: "note_needed" };
  return { ok: true, how: route, note: n || null };
}

/* ─── SU-5: who collects ───────────────────────────────────────────── */

export type CollectorInput =
  | { kind: "patient" }
  | { kind: "representative"; name: string; relationship: string }
  | { kind: "ward_staff"; userId: string };

export interface CollectorRow {
  collector: CollectorInput["kind"];
  collectorName: string | null;
  collectorRelationship: string | null;
  collectorUserId: string | null;
}

const within = (s: string, min: number, max: number) =>
  s.trim().length >= min && s.trim().length <= max;

/** SU-5 and 0126's `ph_collector`: the collector as stored. */
export function validateCollector(
  c: CollectorInput,
  ctx: { inpatientSupplyOn: boolean; isHospitalStaff: boolean },
):
  | { ok: true; row: CollectorRow }
  | { ok: false; reason: "name" | "relationship" | "ward_staff_off" | "not_staff" } {
  const row = { collectorName: null, collectorRelationship: null, collectorUserId: null };
  if (c.kind === "patient") return { ok: true, row: { collector: "patient", ...row } };
  if (c.kind === "representative") {
    if (!within(c.name, 2, 120)) return { ok: false, reason: "name" };
    if (!within(c.relationship, 2, 80)) return { ok: false, reason: "relationship" };
    return {
      ok: true,
      row: {
        ...row,
        collector: "representative",
        collectorName: c.name.trim(),
        collectorRelationship: c.relationship.trim(),
      },
    };
  }
  if (!ctx.inpatientSupplyOn) return { ok: false, reason: "ward_staff_off" };
  if (!ctx.isHospitalStaff) return { ok: false, reason: "not_staff" };
  return { ok: true, row: { ...row, collector: "ward_staff", collectorUserId: c.userId } };
}
