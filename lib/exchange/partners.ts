/**
 * Partners and data protection (Lab Phase 4 §6.8, PT-1..PT-6; gate-a-proposal §3.1, A4, A21; D-LAB4-19..22). Pure.
 *
 * A partner's tests, packing checklist, legal record and field list are signed configuration
 * (`lab_signed_configs`, key = the partner id). Nothing here is a value: codes, turnaround, items and the legal
 * record are entered and signed in the product. The field list's allow-list has no key for a diagnosis, a phone
 * number or an address, so none can be signed onto it (D-LAB4-21).
 */
import { z } from "zod";

import { fill, LAB4 } from "@/content/lab-phase-4";

const words = z.string().trim().min(1).max(300);
const source = z.object({ doc: z.string().trim().min(3).max(200), date: z.iso.date() });

/** PT-1: per test the partner takes — their code, stated turnaround, required identifiers, requirements. */
export const PartnerTestsPayload = z.object({
  tests: z
    .array(
      z.object({
        testCode: z.string().trim().min(1).max(80),
        theirCode: z.string().trim().min(1).max(80),
        loinc: z
          .string()
          .trim()
          .regex(/^\d{1,7}-\d$/)
          .optional(),
        turnaround: z
          .object({
            value: z.number().positive().max(365),
            unit: z.enum(["hours", "days", "working_days"]),
          })
          .optional(),
        requiredIds: z
          .array(
            z.object({
              key: z.string().regex(/^[a-z][a-z0-9_]{1,30}$/),
              words,
              symbologies: z.array(z.string().max(40)).default([]),
            }),
          )
          .default([]),
        requirements: words.optional(),
        category: z.string().trim().min(1).max(60),
      }),
    )
    .min(1),
  holidays: z.array(z.iso.date()).default([]),
  source,
});

/** PT-1: the packing checklist for one specimen category (key = `{partnerId}:{category}`). */
export const PartnerPackingPayload = z.object({
  category: z.string().trim().min(1).max(60),
  items: z.array(z.object({ key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/), words })).min(1),
  source,
});

/** PT-2: the legal record (DPPA 2019). Signed by the data protection lead. */
export const PartnerLegalPayload = z.object({
  basis: z.enum(["s7_2_a", "s7_2_b_i", "s7_2_d", "s7_2_e"]),
  agreement: z
    .object({
      ref: z.string().trim().min(2).max(200),
      signedOn: z.iso.date(),
      reviewOn: z.iso.date(),
    })
    .optional(),
  processorTerms: z.boolean(),
  crossBorder: z.boolean(),
  safeguards: z.object({ ref: z.string().trim().min(2).max(200) }).optional(),
  perPatientConsent: z.boolean().default(false),
  pdpo: z.object({ ref: z.string().trim().min(2).max(80), renewOn: z.iso.date() }),
  breachContact: z.string().trim().min(3).max(200),
});

/** D-LAB4-21: what MedSync may ever send. No diagnosis, phone number or address exists here. */
export const FIELD_ALLOW_LIST = [
  "hospital_number",
  "name",
  "birth_date",
  "sex",
  "nin",
  "lab_number",
  "specimen_type",
  "collected_at",
  "test",
] as const;
export type PartnerField = (typeof FIELD_ALLOW_LIST)[number];

/** PT-3: the signed field list; the clinical question is opt-in and off by default (A21). */
export const PartnerFieldsPayload = z.object({
  fields: z.array(z.enum(FIELD_ALLOW_LIST)).min(1),
  clinicalQuestion: z.boolean().default(false),
});

/** The IPC lead's high-risk wording and the site procedure it points at (D-LAB4-07). */
export const ReferralWordingPayload = z.object({
  highRisk: z.string().trim().min(20).max(1200),
  procedureRef: z.string().trim().min(2).max(200),
});

/** Operational settings (never clinical): the presence window (P13) and the stop after a review date (D-LAB4-20). */
export const ReferralOpsPayload = z.object({
  presenceMinutes: z.number().int().min(5).max(720),
  stopSendingDaysAfterReview: z.number().int().min(0).max(365),
  /** HM-16: the first month referral tracking was on all month ("YYYY-MM"); 10.4 comes from records from then. */
  hmis104RecordsFrom: z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .optional(),
});

export type PartnerTests = z.infer<typeof PartnerTestsPayload>;
export type PartnerLegal = z.infer<typeof PartnerLegalPayload>;

/** PT-2: what is missing from a legal record before any electronic sending (Law 8). */
export function legalMissing(l: PartnerLegal | null): string[] {
  if (!l) return ["legal_record"];
  const m: string[] = [];
  if (!l.agreement) m.push("agreement");
  if (l.crossBorder && !l.safeguards && !l.perPatientConsent) m.push("cross_border_safeguards");
  return m;
}

/** PT-6: the review date and the PDPO registration, against today (hospital-local dates). */
export function reviewState(
  l: PartnerLegal,
  today: string,
): "ok" | "review_passed" | "pdpo_expired" {
  if (l.pdpo.renewOn < today) return "pdpo_expired";
  if (l.agreement && l.agreement.reviewOn < today) return "review_passed";
  return "ok";
}

const daysBetween = (from: string, to: string) =>
  Math.floor((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/**
 * PT-4, D-LAB4-20, D-LAB4-22: may MedSync send electronically to this partner for this referral? The connection
 * needs a complete legal record and a signed agreement; a partner abroad needs safeguards or the patient's
 * recorded consent on the referral; a passed review date informs, then stops sending after the operational days.
 */
export function electronicSendAllowed(o: {
  legal: PartnerLegal | null;
  legalSigned: boolean;
  partnerKind: string;
  consentRef: string | null;
  today: string;
  stopSendingDaysAfterReview: number;
}): { ok: true; inform: string[] } | { ok: false; reasons: string[] } {
  const reasons: string[] = [];
  if (!o.legalSigned) reasons.push("legal_not_signed");
  reasons.push(...legalMissing(o.legal));
  const l = o.legal;
  if (o.partnerKind === "abroad" && !l?.safeguards && !o.consentRef)
    reasons.push("cross_border_refused");
  const inform: string[] = [];
  if (l) {
    const state = reviewState(l, o.today);
    if (state === "pdpo_expired") inform.push("pdpo_expired");
    if (state === "review_passed") {
      inform.push("review_passed");
      if (daysBetween(l.agreement!.reviewOn, o.today) > o.stopSendingDaysAfterReview)
        reasons.push("review_lapsed");
    }
  }
  return reasons.length ? { ok: false, reasons: [...new Set(reasons)] } : { ok: true, inform };
}

/** D-LAB4-22: the words when a cross-border send is refused. */
export const crossBorderWords = (partner: string) =>
  fill(LAB4.crossBorderRefused, { Partner: partner });

/** PT-1, §5.10: our test against the partner's signed list: its mapping, or "Map before sending". */
export function testFor(
  tests: PartnerTests | null,
  testCode: string,
): PartnerTests["tests"][number] | { mapBeforeSending: true } {
  return tests?.tests.find((t) => t.testCode === testCode) ?? { mapBeforeSending: true };
}

/** PT-3: only fields on the signed list leave; anything else is dropped before a message is built. */
export function allowedFields<T extends Partial<Record<PartnerField, unknown>>>(
  values: T,
  list: z.infer<typeof PartnerFieldsPayload>,
): Partial<T> {
  const out: Partial<T> = {};
  for (const f of list.fields) if (f in values) (out as Record<string, unknown>)[f] = values[f];
  return out;
}
