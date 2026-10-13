/**
 * Going live at a dispensing point (Pharmacy Phase 1, §5.13, §6.13): RD-1 to RD-5, gate-a-proposal §1 W1
 * and the owner's STOP 1 answers. Pure: the caller reads the facts; this decides. The page carries no PHI.
 *
 * - RD-1 Six conditions, each {met, evidence, action}:
 *   1. signed content in force: the permission map v2; every `pharmacy_signed_sets` kind RD-1 names (the
 *      lane rule, every reason and code list in Appendix D, the substitution rule, the label fields and
 *      wording, counselling points, staff-facing copy, the witness list); a controlled-class decision for
 *      every medicine the point stocks; the hazard log signed; and, when `pharmacistCoSignRequired` (off
 *      by the owner's decision of 13 Oct 2026), a registered pharmacist's co-signature on every clinical
 *      pack and on the hazard log. Applied everywhere, not only in
 *      production: the test hospital goes live by fixture, never through this switch (Law 8, stricter path);
 *   2. an interim answer to legal questions 1 to 6, each with a document reference, who gave it and when;
 *   3. every active product at the point has an opening count (and there is at least one);
 *   4. a downtime drill recorded at this point;
 *   5. a briefing recorded for pharmacy staff and for prescribers;
 *   6. an in-charge named and the point's phone set (W1); a pharmacist in charge where legal Q1 requires
 *      one, or while Q1 has no answer (the stricter path).
 * - RD-2 / RD-3 `canSwitchOn` / `canSwitchOff`: a second approver who is not the requester; off needs a
 *   reason of 10 characters or more (0129's CHECK).
 * - RD-4 `patientSurfacesAllowed`: in production the patient's list and live SMS need the patient copy
 *   signed, the templates approved and a signed message name.
 * - RD-5 A later point needs a pilot note on the first, written by someone other than the requester.
 */

export type SignedSetKind =
  | "lane_rule"
  | "high_risk_list"
  | "controlled_classes"
  | "witness_list"
  | "outcome_reasons"
  | "close_reasons"
  | "decline_reasons"
  | "reversal_reasons"
  | "correction_reasons"
  | "adjustment_reasons"
  | "batch_choice_reasons"
  | "count_difference_reasons"
  | "supply_without_pharmacist_reasons"
  | "payment_exemption_reasons"
  | "identity_routes"
  | "query_codes"
  | "keep_reasons"
  | "withdraw_reasons"
  | "substitution_rule"
  | "label_fields"
  | "warning_lines"
  | "additional_instructions"
  | "plain_words_templates"
  | "counselling_points"
  | "staff_copy"
  | "patient_copy"
  | "message_name"
  | "availability_mapping";

/** RD-1 condition 1's sets. High-risk list, plain words, patient copy, message name, mapping: not here (Appendix D). */
export const GO_LIVE_SETS: readonly SignedSetKind[] = [
  "lane_rule",
  "controlled_classes",
  "witness_list",
  "outcome_reasons",
  "close_reasons",
  "decline_reasons",
  "reversal_reasons",
  "correction_reasons",
  "adjustment_reasons",
  "batch_choice_reasons",
  "count_difference_reasons",
  "identity_routes",
  "query_codes",
  "keep_reasons",
  "withdraw_reasons",
  "substitution_rule",
  "label_fields",
  "warning_lines",
  "additional_instructions",
  "counselling_points",
  "staff_copy",
];

/** gate-a-content Part 2: the packs signed PR + CSO (clinical). */
export const CLINICAL_SETS: ReadonlySet<SignedSetKind> = new Set<SignedSetKind>([
  "lane_rule",
  "high_risk_list",
  "controlled_classes",
  "witness_list",
  "query_codes",
  "keep_reasons",
  "withdraw_reasons",
  "substitution_rule",
  "label_fields",
  "warning_lines",
  "additional_instructions",
  "plain_words_templates",
  "counselling_points",
]);

export interface ReadinessFacts {
  permissionMapSigned: boolean;
  /** The set in force per kind (status `signed`), with whether a registered pharmacist co-signed it. */
  signedSets: readonly { kind: SignedSetKind; pharmacistCoSigned: boolean }[];
  /** Only when D-PH1-05 / payment status are on for the hospital do their lists become required. */
  supplyWithoutPharmacistOn: boolean;
  usesPaymentStatus: boolean;
  hazardLogSigned: boolean;
  hazardLogPharmacistCoSigned: boolean;
  /** PHARMACIST_COSIGN.required: off while the CSO signs alone (13 Oct 2026). */
  pharmacistCoSignRequired: boolean;
  stockedMedicineIds: readonly string[];
  /** Medicines with a decision in the signed controlled-classes set. */
  controlledDecisionIds: readonly string[];
  legalAnswers: readonly {
    question: number;
    sourceRef: string;
    givenBy: string;
    givenOn: string;
  }[];
  /** Legal Q1's answer on a pharmacist in charge; null while unanswered. */
  q1RequiresPharmacistInCharge: boolean | null;
  activeProducts: readonly { name: string; hasOpeningCount: boolean }[];
  drillOn: string | null;
  briefings: readonly { audience: "pharmacy" | "prescribers"; on: string }[];
  inCharge: { name: string; isPharmacist: boolean } | null;
  pointPhone: string | null;
  /** True when another point at the hospital has been live (RD-5). */
  laterPoint: boolean;
  pilotNote: { writtenBy: string; on: string } | null;
}

export interface Condition {
  id: 1 | 2 | 3 | 4 | 5 | 6;
  title: string;
  met: boolean;
  evidence: string[];
  action: string | null;
}

export interface Readiness {
  conditions: Condition[];
  /** RD-5; null for the first point. Who wrote it is checked against the requester in `canSwitchOn`. */
  pilotNote: { met: boolean; evidence: string[]; action: string | null } | null;
  ready: boolean;
}

const cond = (
  id: Condition["id"],
  title: string,
  missing: string[],
  evidence: string[],
  action: string,
): Condition => ({
  id,
  title,
  met: missing.length === 0,
  evidence: [...evidence, ...missing],
  action: missing.length ? action : null,
});

export function pharmacyReadiness(f: ReadinessFacts): Readiness {
  // 1. Signed content.
  const inForce = new Map(f.signedSets.map((s) => [s.kind, s]));
  const required: SignedSetKind[] = [
    ...GO_LIVE_SETS,
    ...(f.supplyWithoutPharmacistOn ? (["supply_without_pharmacist_reasons"] as const) : []),
    ...(f.usesPaymentStatus ? (["payment_exemption_reasons"] as const) : []),
  ];
  const missing1: string[] = [];
  if (!f.permissionMapSigned) missing1.push("Not signed: the permission map");
  for (const k of required) {
    const s = inForce.get(k);
    if (!s) missing1.push(`Not signed: ${k}`);
    else if (f.pharmacistCoSignRequired && CLINICAL_SETS.has(k) && !s.pharmacistCoSigned)
      missing1.push(`No pharmacist co-signature: ${k}`);
  }
  if (!f.hazardLogSigned) missing1.push("Not signed: the hazard log");
  else if (f.pharmacistCoSignRequired && !f.hazardLogPharmacistCoSigned)
    missing1.push("No pharmacist co-signature: the hazard log");
  const decided = new Set(f.controlledDecisionIds);
  const undecided = f.stockedMedicineIds.filter((m) => !decided.has(m));
  if (undecided.length)
    missing1.push(`No controlled-class decision: ${undecided.length} stocked medicines`);
  const c1 = cond(
    1,
    "The content is signed",
    missing1,
    [`${required.filter((k) => inForce.has(k)).length} of ${required.length} sets signed`],
    f.pharmacistCoSignRequired
      ? "Sign the missing sets, with a pharmacist's co-signature on the clinical ones."
      : "Sign the missing sets.",
  );

  // 2. Legal Q1 to Q6.
  const answered = new Set(
    f.legalAnswers
      .filter((a) => a.sourceRef.trim() && a.givenBy.trim() && a.givenOn.trim())
      .map((a) => a.question),
  );
  const unanswered = [1, 2, 3, 4, 5, 6].filter((q) => !answered.has(q));
  const c2 = cond(
    2,
    "The legal interim answers are on record",
    unanswered.length ? [`No interim answer: question ${unanswered.join(", ")}`] : [],
    f.legalAnswers
      .filter((a) => a.question <= 6)
      .map((a) => `Q${a.question}: ${a.sourceRef}, ${a.givenBy}, ${a.givenOn}`),
    "Record an interim written answer for each question.",
  );

  // 3. Stock.
  const uncounted = f.activeProducts.filter((p) => !p.hasOpeningCount);
  const c3 = cond(
    3,
    "The stock is set up and counted",
    f.activeProducts.length === 0
      ? ["No products are set up at this point"]
      : uncounted.length
        ? [`No opening count: ${uncounted.map((p) => p.name).join(", ")}`]
        : [],
    [
      `${f.activeProducts.length - uncounted.length} of ${f.activeProducts.length} products counted`,
    ],
    "Set up the products and record an opening count for each.",
  );

  // 4. Drill.
  const c4 = cond(
    4,
    "A downtime drill is recorded",
    f.drillOn ? [] : ["No drill recorded at this point"],
    f.drillOn ? [`Drill on ${f.drillOn}`] : [],
    "Run a downtime drill at this point and record it.",
  );

  // 5. Briefings.
  const briefed = (a: "pharmacy" | "prescribers") => f.briefings.find((b) => b.audience === a);
  const c5 = cond(
    5,
    "The pharmacy and the prescribers are briefed",
    [
      ...(briefed("pharmacy") ? [] : ["No briefing for pharmacy staff"]),
      ...(briefed("prescribers") ? [] : ["No briefing for prescribers"]),
    ],
    f.briefings.map(
      (b) =>
        `Briefing for ${b.audience === "pharmacy" ? "pharmacy staff" : "prescribers"} on ${b.on}`,
    ),
    "Brief the pharmacy staff and the prescribers, and record each briefing.",
  );

  // 6. In-charge and phone.
  const needsPharmacist = f.q1RequiresPharmacistInCharge !== false;
  const c6 = cond(
    6,
    "An in-charge is named for the point",
    [
      ...(f.inCharge ? [] : ["No in-charge named"]),
      ...(f.inCharge && needsPharmacist && !f.inCharge.isPharmacist
        ? ["The in-charge must be a pharmacist"]
        : []),
      ...(f.pointPhone?.trim() ? [] : ["No phone set for the point"]),
    ],
    [
      ...(f.inCharge ? [`In-charge: ${f.inCharge.name}`] : []),
      ...(f.pointPhone?.trim() ? [`Phone: ${f.pointPhone}`] : []),
    ],
    "Name the in-charge in the hub and set the point's phone.",
  );

  const conditions = [c1, c2, c3, c4, c5, c6];
  const pilotNote = f.laterPoint
    ? {
        met: f.pilotNote !== null,
        evidence: f.pilotNote
          ? [`Pilot note by ${f.pilotNote.writtenBy}, ${f.pilotNote.on}`]
          : ["No pilot note"],
        action: f.pilotNote ? null : "Record how the first point's pilot went.",
      }
    : null;
  return {
    conditions,
    pilotNote,
    ready: conditions.every((c) => c.met) && (pilotNote?.met ?? true),
  };
}

export type SwitchDecision = { ok: true } | { ok: false; reason: string };

/** RD-2, RD-5: all six (and, for a later point, a pilot note not written by the requester), and a second approver. */
export function canSwitchOn(
  readiness: Readiness,
  who: { requestedBy: string; approvedBy: string | null; pilotNoteBy: string | null },
): SwitchDecision {
  if (!readiness.ready) return { ok: false, reason: "not_ready" };
  if (readiness.pilotNote && who.pilotNoteBy === who.requestedBy)
    return { ok: false, reason: "pilot_note_by_requester" };
  if (!who.approvedBy) return { ok: false, reason: "needs_second_approver" };
  if (who.approvedBy === who.requestedBy) return { ok: false, reason: "same_person" };
  return { ok: true };
}

/** RD-3: a reason (10 characters or more) and a second approver. */
export function canSwitchOff(who: {
  requestedBy: string;
  approvedBy: string | null;
  reason: string;
}): SwitchDecision {
  if (who.reason.trim().length < 10) return { ok: false, reason: "reason_too_short" };
  if (!who.approvedBy) return { ok: false, reason: "needs_second_approver" };
  if (who.approvedBy === who.requestedBy) return { ok: false, reason: "same_person" };
  return { ok: true };
}

/** RD-4: outside production, always; in production, only with everything a patient reads signed. */
export function patientSurfacesAllowed(f: {
  production: boolean;
  patientCopySigned: boolean;
  templatesApproved: boolean;
  messageNameSigned: boolean;
}): { allowed: boolean; missing: ("patient_copy" | "templates" | "message_name")[] } {
  if (!f.production) return { allowed: true, missing: [] };
  const missing = [
    ...(f.patientCopySigned ? [] : (["patient_copy"] as const)),
    ...(f.templatesApproved ? [] : (["templates"] as const)),
    ...(f.messageNameSigned ? [] : (["message_name"] as const)),
  ];
  return { allowed: missing.length === 0, missing };
}
