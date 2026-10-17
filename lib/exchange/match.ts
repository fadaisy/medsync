/**
 * The matching rule (Lab Phase 4 §6.5, MA-1..MA-9; gate-a-proposal §6; D-LAB4-12, signed by the CSO). Pure.
 *
 * A result files by itself only when its number maps to exactly one open order and one more thing agrees.
 * Everything else waits for a person with one reason in words. The outcome types have no branch that creates
 * a patient, an order or a specimen, and none that picks between candidates (MA-4).
 */
import type { ComparisonRow, InboundResult, MatchReason } from "@/lib/exchange/types";

import { compare, normaliseDate, normaliseId, normaliseName } from "@/lib/exchange/normalise";

export type Outcome =
  | { file: string } // a referral id (partner) or a specimen id (analyser)
  | { qc: string } // MA-8: a control-material lot id
  | { wait: MatchReason; candidate: string | null; comparison: ComparisonRow[] };

/* ─── MA-1: a partner's result ───────────────────────────────────────── */

export interface ReferralCandidate {
  referralId: string;
  hospitalId: string;
  theirNumbers: readonly string[];
  labNumber: string;
  open: boolean;
  patient: { name: string | null; birthDate: string | null; hospitalNumber: string | null };
}

/**
 * MA-1: the identifier (their form or accession number, or our lab number echoed back) maps to exactly one open
 * referral in this hospital, AND name and date of birth agree or the hospital number agrees.
 */
export function matchPartnerResult(
  result: InboundResult,
  candidates: readonly ReferralCandidate[],
  ctx: { hospitalId: string; partnerEnabled: boolean },
): Outcome {
  if (!ctx.partnerEnabled) return { wait: "partner_not_enabled", candidate: null, comparison: [] };
  const ids = [result.identifiers.theirNumber, result.identifiers.labNumber]
    .map(normaliseId)
    .filter(Boolean);
  const hits = candidates.filter(
    (c) =>
      c.hospitalId === ctx.hospitalId &&
      c.open &&
      ids.some(
        (id) => c.theirNumbers.map(normaliseId).includes(id) || normaliseId(c.labNumber) === id,
      ),
  );
  if (hits.length === 0)
    return {
      wait: "not_found",
      candidate: null,
      comparison: [{ check: "their_number", outcome: "differs" }],
    };
  if (hits.length > 1)
    return {
      wait: "ambiguous",
      candidate: null,
      comparison: [{ check: "their_number", outcome: "same" }],
    };
  const c = hits[0]!;
  const p = result.patient ?? {};
  const comparison: ComparisonRow[] = [
    { check: "their_number", outcome: "same" },
    { check: "name", outcome: compare(normaliseName(p.name), normaliseName(c.patient.name)) },
    {
      check: "birth_date",
      outcome: compare(normaliseDate(p.birthDate), normaliseDate(c.patient.birthDate)),
    },
    {
      check: "hospital_number",
      outcome: compare(normaliseId(p.hospitalNumber), normaliseId(c.patient.hospitalNumber)),
    },
  ];
  const by = (k: ComparisonRow["check"]) => comparison.find((r) => r.check === k)!.outcome;
  const nameAndBirth = by("name") === "same" && by("birth_date") === "same";
  const hospitalNumber = by("hospital_number") === "same";
  // Exactly as signed (D-LAB4-12). A stricter variant (a differing hospital number always waits) is raised with
  // the CSO at STOP 3, not applied.
  if (!(nameAndBirth || hospitalNumber))
    return { wait: "demographics_disagree", candidate: c.referralId, comparison };
  return { file: c.referralId };
}

/* ─── MA-2, MA-8: an analyser's result ───────────────────────────────── */

export interface SpecimenCandidate {
  specimenId: string;
  hospitalId: string;
  labNumber: string;
  received: boolean;
  /** Components on the specimen's open orders, by our component key, with whether each is released. */
  components: readonly { key: string; released: boolean }[];
}

export interface AnalyserMapping {
  /** analyser code → our component key and the unit the analyser must send (signed, from the maker's document). */
  codes: Readonly<Record<string, { component: string; unit: string }>>;
}

/**
 * MA-2: the sample id maps to exactly one specimen in this hospital that the lab has received; the analyser
 * code maps (signed mapping) to a component on that specimen's open order; the unit sent is the mapping's unit;
 * and that component is not released (a released one goes to the amendment path, never overwritten). MA-8: a
 * sample id that is a registered control-material lot on this analyser goes to quality control, never a patient.
 */
export function matchAnalyserResult(
  sample: { sampleId: string; code: string; unit: string | undefined },
  candidates: readonly SpecimenCandidate[],
  mapping: AnalyserMapping,
  ctx: { hospitalId: string; controlLots: readonly { lotId: string; lotNumber: string }[] },
): Outcome {
  const id = normaliseId(sample.sampleId);
  const qc = ctx.controlLots.find((l) => normaliseId(l.lotNumber) === id);
  if (qc) return { qc: qc.lotId };
  const hits = candidates.filter(
    (c) => c.hospitalId === ctx.hospitalId && normaliseId(c.labNumber) === id,
  );
  if (hits.length === 0) return { wait: "not_found", candidate: null, comparison: [] };
  if (hits.length > 1) return { wait: "ambiguous", candidate: null, comparison: [] };
  const s = hits[0]!;
  if (!s.received) return { wait: "not_received", candidate: s.specimenId, comparison: [] };
  const m = mapping.codes[sample.code];
  if (!m)
    return {
      wait: "code_unmapped",
      candidate: s.specimenId,
      comparison: [{ check: "test", outcome: "cannot_compare" }],
    };
  const comp = s.components.find((x) => x.key === m.component);
  if (!comp)
    return {
      wait: "not_ordered",
      candidate: s.specimenId,
      comparison: [{ check: "test", outcome: "differs" }],
    };
  if ((sample.unit ?? "").trim() !== m.unit)
    return {
      wait: "unit_differs",
      candidate: s.specimenId,
      comparison: [{ check: "unit", outcome: "differs" }],
    };
  if (comp.released) return { wait: "already_released", candidate: s.specimenId, comparison: [] };
  return { file: s.specimenId };
}

/* ─── MA-6, MA-7: what a person does with a waiting item ─────────────── */

/**
 * MA-6: File after confirming needs the permission, how it was confirmed (a corrected report, or a phone call
 * with the name of the person spoken to), a second person who is not the actor, and a reason.
 */
export function fileAfterConfirmingErrors(o: {
  hasPermission: boolean;
  method: "corrected_report" | "phone_call" | null;
  spokeTo: string | null;
  secondUserId: string | null;
  actorUserId: string;
  reason: string;
}): string[] {
  const e: string[] = [];
  if (!o.hasPermission) e.push("permission");
  if (!o.method) e.push("method");
  if (o.method === "phone_call" && !o.spokeTo?.trim()) e.push("spoke_to");
  if (!o.secondUserId || o.secondUserId === o.actorUserId) e.push("second_person");
  if (o.reason.trim().length < 3) e.push("reason");
  return e;
}

/** MA-7: Not ours keeps the message; a notice goes to the partner where a channel exists, else the call is noted. */
export const notOurs = (hasChannel: boolean) =>
  ({ keepMessage: true, notify: hasChannel ? "message" : "call_note" }) as const;
