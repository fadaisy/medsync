import "server-only";

import type { WriteCtx } from "./context";
import type { WriteResult } from "./orders";
import type { EmrTx } from "@/lib/emr/db";
import type { EncounterDiagnosisView } from "@/lib/emr/diagnoses";
import { and, desc, eq, inArray, ne, sql } from "drizzle-orm";

import { clinicalCosignRequests } from "@/db/schema/doctor-workspace";
import { conditions, diagnosisTerms } from "@/db/schema/emr";
import { encounterDiagnoses, newestVersions, pendingCosignIds } from "@/lib/emr/diagnoses";
import { decrypt } from "@/lib/encryption";
import { EmrWriteError, stampActivity } from "./context";
import {
  ALREADY_ON_VISIT,
  authority,
  conditionColumns,
  currentPrimary,
  currentVersion,
  DEMOTE_FINAL,
  FINAL_AWAITING_COSIGN,
  insertNextVersion,
  lockVisit,
  openDiagnosisCosign,
  recordEncounterDiagnosis,
  sameDiagnosis,
  SENIOR_CADRES,
  updateProblemStatus,
} from "./facts";
import { openEncounter, ORDERING_CADRES, replayed, requireCadre } from "./orders";

/**
 * The Impression step's diagnosis writes (PROMPT-CLERKING-SUMMARY-IMPRESSION §9, gate-a-proposal
 * §3, signed 28 Sep 2026). Each is `(ctx, input) => result` inside one withPatientWrite
 * transaction; every condition version is audited by 0071's audit_conditions trigger and every
 * co-signature request by 0030's audit_clinical_cosign_requests.
 *
 * - setLeadingDiagnosis (D-SI-05): demote the visit's primary, then promote the chosen one: two
 *   versions, one client key (`key` demotes, `key:promote` promotes).
 * - moveToDifferential (D-SI-05): one version, leaving no leading diagnosis.
 * - requestDiagnosisCosign / decideDiagnosisCosign (D-SI-09, D-SI-23, migration 0084).
 *   recordEncounterDiagnosis raises the same request itself for a junior's Final on a NEW
 *   diagnosis; requestDiagnosisCosign is the path for one already on the visit.
 * Demoting or moving a Final needs a final-diagnosis authority (D-SI-21).
 */

const invalid = (m: string) => new EmrWriteError("invalid", m);
const NO_REASON = { reasonCode: null, reasonCiphertext: null };

function requireEncounterDiagnosis(row: { category: string }, act: string): void {
  if (row.category !== "encounter_diagnosis") throw invalid(`Only a visit's diagnosis ${act}.`);
}

/* ─── Leading and differential (D-SI-05, D-SI-21) ────────────────── */

export interface SetLeadingDiagnosisInput {
  patientUserId: string;
  encounterId: string;
  /** The current version (as the clinician saw it) of the diagnosis to lead. */
  id: string;
  clientKey: string;
}

/**
 * Make a diagnosis on this visit the leading one, in one transaction: the visit's current primary
 * first becomes secondary + differential, then the chosen one becomes primary + provisional (a
 * Final keeps its verification: promotion never takes a Final away). Already leading: nothing to
 * write.
 */
export async function setLeadingDiagnosis(
  ctx: WriteCtx,
  input: SetLeadingDiagnosisInput,
): Promise<WriteResult & { demotedId: string | null }> {
  requireCadre(ctx, ORDERING_CADRES, "change a diagnosis");
  const promoteKey = `${input.clientKey}:promote`;
  const replay = await replayed(ctx.tx, conditions, promoteKey, input.patientUserId);
  if (replay)
    return {
      id: replay,
      demotedId: await replayed(ctx.tx, conditions, input.clientKey, input.patientUserId),
    };
  const encounter = await openEncounter(ctx, input.patientUserId, input.encounterId);
  // Lock first: two swaps on one visit serialise before either reads a version.
  const visit = await lockVisit(ctx, encounter.id);
  const chosen = await currentVersion(ctx, "condition", input.id, input.patientUserId);
  requireEncounterDiagnosis(chosen, "can lead");
  if (chosen.encounterId !== encounter.id) throw invalid("That diagnosis is not on this visit.");
  if (chosen.verification === "refuted") throw invalid("A ruled-out diagnosis cannot lead.");
  if (chosen.rank === "primary") return { id: chosen.id, demotedId: null };

  let demotedId: string | null = null;
  const old = await currentPrimary(ctx, visit, chosen.logicalId);
  if (old) {
    const prev = await currentVersion(ctx, "condition", old.id, input.patientUserId);
    if (prev.verification === "confirmed" && !authority(ctx).canWriteFinalDiagnosis)
      throw new EmrWriteError("forbidden", DEMOTE_FINAL);
    demotedId = await insertNextVersion(
      ctx,
      "condition",
      prev,
      { rank: "secondary", verification: "differential", ...NO_REASON },
      input.clientKey,
    );
  }
  const id = await insertNextVersion(
    ctx,
    "condition",
    chosen,
    {
      rank: "primary",
      verification: chosen.verification === "confirmed" ? "confirmed" : "provisional",
      ...NO_REASON,
    },
    promoteKey,
  );
  await stampActivity(ctx, encounter.id);
  return { id, demotedId };
}

export interface MoveToDifferentialInput {
  patientUserId: string;
  /** The current version the clinician saw. */
  id: string;
  clientKey: string;
}

/** The diagnosis becomes secondary + differential; the visit is left with no leading diagnosis. */
export async function moveToDifferential(
  ctx: WriteCtx,
  input: MoveToDifferentialInput,
): Promise<WriteResult> {
  requireCadre(ctx, ORDERING_CADRES, "change a diagnosis");
  const replay = await replayed(ctx.tx, conditions, input.clientKey, input.patientUserId);
  if (replay) return { id: replay };
  const prev = await currentVersion(ctx, "condition", input.id, input.patientUserId);
  requireEncounterDiagnosis(prev, "moves to the differential");
  if (prev.rank !== "primary" && prev.verification === "differential")
    throw invalid("This diagnosis is already in the differential.");
  if (prev.verification === "confirmed" && !authority(ctx).canWriteFinalDiagnosis)
    throw new EmrWriteError("forbidden", DEMOTE_FINAL);
  const id = await insertNextVersion(
    ctx,
    "condition",
    prev,
    { rank: "secondary", verification: "differential", ...NO_REASON },
    input.clientKey,
  );
  await stampActivity(ctx, prev.encounterId);
  return { id };
}

/* ─── A junior's Final (D-SI-09, D-SI-23) ────────────────────────── */

export interface RequestDiagnosisCosignInput {
  patientUserId: string;
  /** The current version the clinician saw. */
  id: string;
  clientKey: string;
}

/**
 * A clinician without a final-diagnosis authority chooses Final for a diagnosis on the visit: it is
 * stored Working (a new version only when it is not Working already) and a confirm_diagnosis
 * request opens (one per diagnosis). Returns the request's id, the condition's current version and
 * "Final · awaiting senior co-signature".
 */
export async function requestDiagnosisCosign(
  ctx: WriteCtx,
  input: RequestDiagnosisCosignInput,
): Promise<WriteResult & { conditionId: string }> {
  requireCadre(ctx, ORDERING_CADRES, "record a diagnosis");
  if (authority(ctx).canWriteFinalDiagnosis)
    throw invalid("Your cadre confirms a diagnosis directly: no co-signature is needed.");
  const replay = await replayed(ctx.tx, conditions, input.clientKey, input.patientUserId);
  if (replay) {
    // The Working version this key wrote, and the request opened with it.
    const [row] = await ctx.tx
      .select({ logicalId: conditions.logicalId })
      .from(conditions)
      .where(eq(conditions.id, replay));
    const [req] = row
      ? await ctx.tx
          .select({ id: clinicalCosignRequests.id })
          .from(clinicalCosignRequests)
          .where(
            and(
              eq(clinicalCosignRequests.patientUserId, input.patientUserId),
              eq(clinicalCosignRequests.actionKind, "confirm_diagnosis"),
              sql`${clinicalCosignRequests.actionPayload}->>'conditionLogicalId' = ${row.logicalId}`,
            ),
          )
          .orderBy(desc(clinicalCosignRequests.createdAt))
          .limit(1)
      : [];
    return { id: req?.id ?? replay, conditionId: replay, warnings: [FINAL_AWAITING_COSIGN] };
  }
  const prev = await currentVersion(ctx, "condition", input.id, input.patientUserId);
  requireEncounterDiagnosis(prev, "is co-signed as final");
  if (prev.verification === "confirmed") throw invalid("This diagnosis is already final.");
  if (prev.verification === "refuted") throw invalid("A ruled-out diagnosis cannot be final.");
  if (prev.encounterId) await openEncounter(ctx, input.patientUserId, prev.encounterId);
  const conditionId =
    prev.verification === "provisional"
      ? prev.id
      : await insertNextVersion(
          ctx,
          "condition",
          prev,
          { verification: "provisional", ...NO_REASON },
          input.clientKey,
        );
  const id = await openDiagnosisCosign(ctx, {
    patientUserId: input.patientUserId,
    logicalId: prev.logicalId,
    encounterId: prev.encounterId,
  });
  await stampActivity(ctx, prev.encounterId);
  return { id, conditionId, warnings: [FINAL_AWAITING_COSIGN] };
}

export interface DecideDiagnosisCosignInput {
  patientUserId: string;
  requestId: string;
  decision: "approve" | "return";
  /** Required to return, so the requester knows why. */
  reviewNote?: string;
  clientKey: string;
}

/**
 * The co-signature inbox's decision on a confirm_diagnosis request. The approver passes the inbox's
 * seniority AND holds a final-diagnosis authority (D-SI-23), and is never the requester. Approve:
 * the CURRENT version of the diagnosis becomes Final (updateProblemStatus, verification confirmed)
 * and the request closes, in this one transaction. Return: the request closes with the note; the
 * diagnosis stays Working. A diagnosis changed since the request (moved to the differential,
 * ruled out, entered in error) cannot be approved: return it instead.
 */
export async function decideDiagnosisCosign(
  ctx: WriteCtx,
  input: DecideDiagnosisCosignInput,
): Promise<WriteResult> {
  requireCadre(ctx, SENIOR_CADRES, "co-sign a diagnosis");
  if (!authority(ctx).canWriteFinalDiagnosis)
    throw new EmrWriteError("forbidden", "Your cadre may not co-sign a diagnosis.");
  const replay = await replayed(ctx.tx, conditions, input.clientKey, input.patientUserId);
  if (replay) return { id: replay };
  const [req] = await ctx.tx
    .select()
    .from(clinicalCosignRequests)
    .where(eq(clinicalCosignRequests.id, input.requestId));
  if (
    !req ||
    req.hospitalId !== ctx.actor.hospitalId ||
    req.patientUserId !== input.patientUserId ||
    req.actionKind !== "confirm_diagnosis"
  )
    throw new EmrWriteError("not_found", "Co-signature request not found for this patient here.");
  if (req.requestedByUserId === ctx.actor.userId)
    throw new EmrWriteError("forbidden", "You cannot co-sign your own diagnosis.");
  const state = input.decision === "approve" ? "approved" : "returned";
  if (req.state !== "pending_review") {
    // The same decision retried by the same senior is not a conflict.
    if (req.state === state && req.reviewedByUserId === ctx.actor.userId) return { id: req.id };
    throw new EmrWriteError("conflict", "The co-sign request is no longer open.");
  }
  const reviewNote = input.reviewNote?.trim() || null;
  if (input.decision === "return" && !reviewNote)
    throw invalid("A short note is required so the requester knows why it was returned.");
  const payload = req.actionPayload as { conditionLogicalId?: unknown; encounterId?: unknown };
  const logicalId = payload?.conditionLogicalId;
  if (typeof logicalId !== "string") throw invalid("The request does not name a diagnosis.");

  let id = req.id;
  if (input.decision === "approve") {
    const [current] = await ctx.tx
      .select()
      .from(conditions)
      .where(
        and(eq(conditions.logicalId, logicalId), eq(conditions.patientUserId, input.patientUserId)),
      )
      .orderBy(desc(conditions.version))
      .limit(1);
    if (!current) throw new EmrWriteError("not_found", "The diagnosis is not on this record.");
    if (current.status === "entered_in_error" || current.status === "cancelled")
      throw new EmrWriteError("conflict", "This diagnosis was entered in error: return it.");
    if (current.verification !== "confirmed") {
      if (current.verification !== "provisional" && current.verification !== "unconfirmed")
        throw new EmrWriteError("conflict", "This diagnosis changed after the request: return it.");
      id = (
        await updateProblemStatus(ctx, {
          patientUserId: input.patientUserId,
          id: current.id,
          clientKey: input.clientKey,
          verification: "confirmed",
        })
      ).id;
    }
  }
  const [answered] = await ctx.tx
    .update(clinicalCosignRequests)
    .set({ state, reviewedByUserId: ctx.actor.userId, reviewedAt: ctx.now, reviewNote })
    .where(
      and(
        eq(clinicalCosignRequests.id, req.id),
        eq(clinicalCosignRequests.state, "pending_review"),
      ),
    )
    .returning({ id: clinicalCosignRequests.id });
  if (!answered) throw new EmrWriteError("conflict", "The co-sign request is no longer open.");
  await stampActivity(ctx, typeof payload.encounterId === "string" ? payload.encounterId : null);
  return { id };
}

/* ─── Refine and replace (D-REL-05, dx-relations-design §3) ──────── */

export interface RefineDiagnosisInput {
  patientUserId: string;
  /** The current version the clinician saw. */
  id: string;
  /** The narrower term (or typed words). */
  termId?: string;
  text?: string;
  /** The deciding results, as chart ids ("clinical_observations:<uuid>", "diagnostic_reports:<uuid>"). */
  decidedBy?: string[];
  clientKey: string;
}

/**
 * Refine: the next version of the SAME condition (same logical id) with the narrower term; its
 * `refined_from` names the version and term it came from and the results that decided it. Status,
 * rank, verification, evidence and relations stay (relations point at the logical id). A Final is
 * refined by someone allowed to write one (D-SI-21). A change of identity is replaceDiagnosis.
 */
export async function refineDiagnosis(
  ctx: WriteCtx,
  input: RefineDiagnosisInput,
): Promise<WriteResult> {
  requireCadre(ctx, ORDERING_CADRES, "change a diagnosis");
  const replay = await replayed(ctx.tx, conditions, input.clientKey, input.patientUserId);
  if (replay) return { id: replay };
  const prev = await currentVersion(ctx, "condition", input.id, input.patientUserId);
  if (prev.verification === "refuted") throw invalid("A ruled-out diagnosis is not refined.");
  if (prev.verification === "confirmed" && !authority(ctx).canWriteFinalDiagnosis)
    throw new EmrWriteError("forbidden", "A senior refines a final diagnosis.");
  if (input.termId && input.termId === prev.termId)
    throw invalid("The diagnosis already has this term.");
  if (prev.encounterId) await openEncounter(ctx, input.patientUserId, prev.encounterId);
  // S-3: the narrower term must not already be its own diagnosis in the same place.
  const where =
    prev.category === "encounter_diagnosis"
      ? and(
          inArray(conditions.encounterId, await lockVisit(ctx, prev.encounterId!)),
          eq(conditions.category, "encounter_diagnosis"),
        )
      : and(eq(conditions.category, "problem_list_item"), eq(conditions.subjectRelation, "self"));
  if (
    await sameDiagnosis(
      ctx,
      and(
        where,
        eq(conditions.patientUserId, input.patientUserId),
        eq(conditions.hospitalId, ctx.actor.hospitalId),
        ne(conditions.logicalId, prev.logicalId),
      ),
      input,
    )
  )
    throw new EmrWriteError("conflict", ALREADY_ON_VISIT);
  const cols = await conditionColumns(
    ctx,
    {
      patientUserId: input.patientUserId,
      clientKey: input.clientKey,
      termId: input.termId,
      text: input.text,
    },
    prev.effectiveAt,
  );
  const id = await insertNextVersion(
    ctx,
    "condition",
    prev,
    {
      ...cols,
      refinedFrom: { versionId: prev.id, termId: prev.termId, decidedBy: input.decidedBy ?? [] },
      ...NO_REASON,
    },
    input.clientKey,
  );
  await stampActivity(ctx, prev.encounterId);
  return { id };
}

export interface ReplaceDiagnosisInput {
  patientUserId: string;
  encounterId: string;
  /** The current version the clinician saw: it is ruled out. */
  id: string;
  /** Why it is ruled out ("Ruled out: …" in the note). */
  reasonCode?: string;
  reasonText?: string;
  /** The new diagnosis. */
  termId?: string;
  text?: string;
  clientKey: string;
}

/**
 * Replace (a change of identity, D-REL-05): the old diagnosis is refuted with its reason and the new
 * one recorded in its place (same rank and slot), in this one transaction. Keys: `key` refutes,
 * `key:new` records. The old one's relations are retired by 0096 (system_end_removed), never moved.
 */
export async function replaceDiagnosis(
  ctx: WriteCtx,
  input: ReplaceDiagnosisInput,
): Promise<WriteResult & { refutedId: string }> {
  const newKey = `${input.clientKey}:new`;
  const replay = await replayed(ctx.tx, conditions, newKey, input.patientUserId);
  if (replay)
    return {
      id: replay,
      refutedId: (await replayed(ctx.tx, conditions, input.clientKey, input.patientUserId))!,
    };
  const prev = await currentVersion(ctx, "condition", input.id, input.patientUserId);
  requireEncounterDiagnosis(prev, "is replaced");
  if (prev.encounterId !== input.encounterId) throw invalid("That diagnosis is not on this visit.");
  const refuted = await updateProblemStatus(ctx, {
    patientUserId: input.patientUserId,
    id: prev.id,
    clientKey: input.clientKey,
    verification: "refuted",
    reasonCode: input.reasonCode,
    reasonText: input.reasonText,
  });
  const made = await recordEncounterDiagnosis(ctx, {
    patientUserId: input.patientUserId,
    encounterId: input.encounterId,
    clientKey: newKey,
    termId: input.termId,
    text: input.text,
    rank: prev.rank === "primary" ? "primary" : "secondary",
    verification:
      prev.verification === "confirmed" || prev.verification === "differential"
        ? prev.verification
        : "provisional",
  });
  return { ...made, refutedId: refuted.id };
}

/* ─── Reads the writes share ─────────────────────────────────────── */

/**
 * The encounter's current diagnoses as the note is signed (D-SI-20) and as the desk reads them:
 * lib/emr/diagnoses encounterDiagnoses over the patient's rows at this hospital.
 */
export async function loadEncounterDiagnoses(
  tx: EmrTx,
  scope: { hospitalId: string; patientUserId: string; encounterId: string },
): Promise<EncounterDiagnosisView[]> {
  const rows = await tx
    .select()
    .from(conditions)
    .where(
      and(
        eq(conditions.patientUserId, scope.patientUserId),
        eq(conditions.hospitalId, scope.hospitalId),
      ),
    );
  const termIds = [...new Set(rows.flatMap((r) => (r.termId ? [r.termId] : [])))];
  const terms = termIds.length
    ? await tx
        .select({
          id: diagnosisTerms.id,
          display: diagnosisTerms.display,
          icd11Code: diagnosisTerms.icd11Code,
          verifiedOn: diagnosisTerms.verifiedOn,
        })
        .from(diagnosisTerms)
        .where(inArray(diagnosisTerms.id, termIds))
    : [];
  const open = await tx
    .select({ payload: clinicalCosignRequests.actionPayload })
    .from(clinicalCosignRequests)
    .where(
      and(
        eq(clinicalCosignRequests.patientUserId, scope.patientUserId),
        eq(clinicalCosignRequests.hospitalId, scope.hospitalId),
        eq(clinicalCosignRequests.actionKind, "confirm_diagnosis"),
        eq(clinicalCosignRequests.state, "pending_review"),
      ),
    );
  const termMap = new Map(terms.map((t) => [t.id, t]));
  const textOf = (r: (typeof rows)[number]) => {
    if (!r.textCiphertext) return null;
    try {
      return decrypt(r.textCiphertext);
    } catch {
      return null;
    }
  };
  return encounterDiagnoses({
    rows,
    encounterId: scope.encounterId,
    terms: termMap,
    textOf,
    displayOf: (r) =>
      (r.termId ? termMap.get(r.termId)?.display : null) ?? textOf(r) ?? "Diagnosis",
    cosignPending: pendingCosignIds(open.map((o) => o.payload)),
  });
}

/**
 * The co-signature inbox's words for confirm_diagnosis requests: the payload is PHI-free, so the
 * diagnosis is resolved here, for the reviewing senior's own hospital only (as
 * prescriptionsForCosign). Keyed by the condition's logical id; the current version is read.
 */
export async function diagnosesForCosign(
  tx: EmrTx,
  hospitalId: string,
  logicalIds: readonly string[],
): Promise<Map<string, { display: string; restricted: boolean; verification: string }>> {
  if (logicalIds.length === 0) return new Map();
  const rows = newestVersions(
    await tx
      .select()
      .from(conditions)
      .where(
        and(inArray(conditions.logicalId, [...logicalIds]), eq(conditions.hospitalId, hospitalId)),
      ),
  );
  const termIds = [...new Set(rows.flatMap((r) => (r.termId ? [r.termId] : [])))];
  const terms = new Map(
    (termIds.length
      ? await tx
          .select({ id: diagnosisTerms.id, display: diagnosisTerms.display })
          .from(diagnosisTerms)
          .where(inArray(diagnosisTerms.id, termIds))
      : []
    ).map((t) => [t.id, t.display]),
  );
  return new Map(
    rows.map((r) => {
      let text: string | null = null;
      try {
        text = r.textCiphertext ? decrypt(r.textCiphertext) : null;
      } catch {
        text = null;
      }
      return [
        r.logicalId,
        {
          display: (r.termId ? terms.get(r.termId) : null) ?? text ?? "Diagnosis",
          restricted: r.sensitivity === "restricted",
          verification: r.verification,
        },
      ];
    }),
  );
}
