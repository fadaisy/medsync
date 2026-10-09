import "server-only";

import { randomUUID } from "node:crypto";
import type { WriteCtx } from "./context";
import type { WriteResult } from "./orders";
import type {
  ConditionRelation,
  RelationLabel,
  RelationOrigin,
  RelationType,
} from "@/db/schema/emr";
import type { RestrictedClass } from "@/lib/clerking/impression/catalogue";
import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { conditionRelations, conditions } from "@/db/schema/emr";
import { CLINICAL_VIEWER } from "@/lib/clerking/impression/facts";
import { DX_CATALOGUE, DX_TERM_IDS } from "@/lib/clerking/impression/load";
import { decrypt } from "@/lib/encryption";
import { EmrWriteError, stampActivity } from "./context";
import { currentVersion, reasonCols, recordEncounterDiagnosis, requireReason } from "./facts";
import { openEncounter, ORDERING_CADRES, replayed, requireCadre } from "./orders";

/**
 * How diagnoses relate, in the record (migration 0096, dx-relations-design §1 and §5, GATE A
 * 2026-10-09). Each write is `(ctx, input) => result` in one withPatientWrite transaction, as the
 * owner after the access check; the guard trigger enforces the integrity rules (self, differential,
 * loop, 4 levels, same patient) and its "Relation refused: …" message comes back as `invalid`.
 * Every change is the next version of the relation (append-only); a removed end retires its
 * relations in SQL (origin system_end_removed), so nothing here handles that.
 *
 * Restricted classes (D-REL-09): conditions carry only sensitivity, so the classes of both ends come
 * from the signed diagnosis catalogue (as the board reads them) and are written with every version.
 * The writer must hold both: today every clinical viewer holds every class (D-SI-18).
 *
 * Severity stages (D-REL-14) are Phase 4: a stage write is the next condition version with `stage`
 * set, beside refineDiagnosis in ./diagnoses; nothing here reads or writes `stage`.
 */

const invalid = (m: string) => new EmrWriteError("invalid", m);
const ACT = "link diagnoses";

/** A condition's restricted class, from its term's catalogue profile. */
export const classOfTerm = (termId: string | null): RestrictedClass | null =>
  (termId ? DX_CATALOGUE.profile(DX_TERM_IDS[termId] ?? "")?.restricted_class : null) ?? null;

/** Both ends' current versions here, and their classes, which the writer must be able to view. */
async function endClasses(
  ctx: WriteCtx,
  patientUserId: string,
  logicalIds: [string, string],
): Promise<RestrictedClass[]> {
  const rows = await ctx.tx
    .select({ logicalId: conditions.logicalId, termId: conditions.termId })
    .from(conditions)
    .where(
      and(
        inArray(conditions.logicalId, logicalIds),
        eq(conditions.patientUserId, patientUserId),
        eq(conditions.hospitalId, ctx.actor.hospitalId),
      ),
    )
    .orderBy(desc(conditions.version));
  const term = new Map<string, string | null>();
  for (const r of rows) if (!term.has(r.logicalId)) term.set(r.logicalId, r.termId);
  if (logicalIds.some((id) => !term.has(id)))
    throw new EmrWriteError("not_found", "Diagnosis not found for this patient here.");
  const classes = [...new Set(logicalIds.flatMap((id) => classOfTerm(term.get(id)!) ?? []))];
  // ponytail: the viewer is CLINICAL_VIEWER (every class) until per-user classes exist (D-SI-18).
  if (!classes.every((c) => CLINICAL_VIEWER.classes.has(c)))
    throw new EmrWriteError("forbidden", "You cannot view one of these diagnoses.");
  return classes.sort();
}

/** The guard's refusal, as the clinician reads it; anything else is rethrown. */
async function insert(ctx: WriteCtx, row: typeof conditionRelations.$inferInsert): Promise<void> {
  try {
    await ctx.tx.insert(conditionRelations).values(row);
  } catch (e) {
    const err = e as { message?: string; cause?: { message?: string } };
    const m = /Relation refused: ([^\n]*)/.exec(`${err.message}\n${err.cause?.message}`);
    if (m) throw invalid(m[1]!);
    throw e;
  }
}

const notSuperseded = sql`NOT EXISTS (SELECT 1 FROM public.condition_relations s WHERE s.supersedes_id = ${conditionRelations.id})`;

/* ─── Create ──────────────────────────────────────────────────────── */

export interface CreateRelationInput {
  patientUserId: string;
  /** The visit at which it is asserted. */
  encounterId: string;
  /** Logical ids: the condition (effect, factor, this visit's episode) and the related one. */
  conditionId: string;
  relatedConditionId: string;
  relationType: RelationType;
  /** due_to only (complication, secondary, precipitated_by). */
  label?: RelationLabel | null;
  /** Coded non-diagnosis causes (D-REL-11). */
  qualifiers?: string[];
  position?: number;
  /** When the link was offered from a signed catalogue. */
  catalogueRef?: string | null;
  /** backfill_confirmed: the clinician confirmed a link carried from the draft (D-REL-17). */
  origin?: Extract<RelationOrigin, "clinician" | "backfill_confirmed">;
  clientKey: string;
}

/** A clinician links two diagnoses (never the system, design §1.3). Already linked: `conflict`. */
export async function createRelation(
  ctx: WriteCtx,
  input: CreateRelationInput,
): Promise<WriteResult> {
  requireCadre(ctx, ORDERING_CADRES, ACT);
  const replay = await replayed(ctx.tx, conditionRelations, input.clientKey, input.patientUserId);
  if (replay) return { id: replay };
  if ((input.relationType === "due_to") !== !!input.label)
    throw invalid("A cause link needs its wording (secondary, complication or precipitated by).");
  const encounter = await openEncounter(ctx, input.patientUserId, input.encounterId);
  // Symmetric: stored once, the lower id first.
  const [a, b] =
    input.relationType === "associated_with" && input.relatedConditionId < input.conditionId
      ? [input.relatedConditionId, input.conditionId]
      : [input.conditionId, input.relatedConditionId];
  const classes = await endClasses(ctx, input.patientUserId, [a, b]);
  const [dup] = await ctx.tx
    .select({ id: conditionRelations.id })
    .from(conditionRelations)
    .where(
      and(
        eq(conditionRelations.patientUserId, input.patientUserId),
        eq(conditionRelations.conditionId, a),
        eq(conditionRelations.relatedConditionId, b),
        eq(conditionRelations.relationType, input.relationType),
        eq(conditionRelations.state, "active"),
        notSuperseded,
      ),
    )
    .limit(1);
  if (dup) throw new EmrWriteError("conflict", "These diagnoses are already linked.");
  const id = randomUUID();
  await insert(ctx, {
    id,
    logicalId: id,
    hospitalId: ctx.actor.hospitalId,
    patientUserId: input.patientUserId,
    encounterId: encounter.id,
    conditionId: a,
    relatedConditionId: b,
    relationType: input.relationType,
    label: input.relationType === "due_to" ? input.label! : null,
    position: input.position ?? 1,
    qualifiers: input.qualifiers ?? [],
    restrictedClasses: classes,
    origin: input.origin ?? "clinician",
    catalogueRef: input.catalogueRef ?? null,
    recordedByUserId: ctx.actor.userId,
    authorCadre: ctx.actor.cadreCode,
    recordedAt: ctx.now,
    clientKey: input.clientKey,
  });
  await stampActivity(ctx, encounter.id);
  return { id };
}

/* ─── Change: the next version ────────────────────────────────────── */

interface VersionInput {
  patientUserId: string;
  /** The relation's current version, as the clinician saw it. */
  id: string;
  clientKey: string;
}

async function nextVersion(
  ctx: WriteCtx,
  input: VersionInput,
  patch: (prev: ConditionRelation) => Partial<ConditionRelation>,
  opts: { openVisit: boolean },
): Promise<WriteResult> {
  requireCadre(ctx, ORDERING_CADRES, ACT);
  const replay = await replayed(ctx.tx, conditionRelations, input.clientKey, input.patientUserId);
  if (replay) return { id: replay };
  const [prev] = await ctx.tx
    .select()
    .from(conditionRelations)
    .where(eq(conditionRelations.id, input.id));
  if (
    !prev ||
    prev.patientUserId !== input.patientUserId ||
    prev.hospitalId !== ctx.actor.hospitalId
  )
    throw new EmrWriteError("not_found", "Link not found for this patient here.");
  const [next] = await ctx.tx
    .select({ id: conditionRelations.id })
    .from(conditionRelations)
    .where(eq(conditionRelations.supersedesId, prev.id))
    .limit(1);
  if (next) throw new EmrWriteError("conflict", "A newer version exists: reload and try again.");
  if (prev.state !== "active") throw new EmrWriteError("conflict", "This link was removed.");
  if (opts.openVisit) await openEncounter(ctx, input.patientUserId, prev.encounterId);
  const classes = await endClasses(ctx, input.patientUserId, [
    prev.conditionId,
    prev.relatedConditionId,
  ]);
  const { id: _id, recordedAt: _at, clientKey: _key, ...rest } = prev;
  const id = randomUUID();
  await insert(ctx, {
    ...rest,
    ...patch(prev),
    id,
    version: prev.version + 1,
    supersedesId: prev.id,
    restrictedClasses: classes,
    origin: "clinician",
    recordedByUserId: ctx.actor.userId,
    authorCadre: ctx.actor.cadreCode,
    recordedAt: ctx.now,
    // A change is a new assertion: a co-signature covered the version it was given on (DXV-14).
    cosignedByUserId: null,
    cosignedAt: null,
    clientKey: input.clientKey,
  });
  await stampActivity(ctx, prev.encounterId);
  return { id };
}

export interface RetireRelationInput extends VersionInput {
  reasonCode?: string;
  reasonText?: string;
  /** The link itself was a mistake (entered in error), not a judgement that changed. */
  enteredInError?: boolean;
}

/** Unlink, with a reason. Also after signing (design §4.3); the diagnoses stay. */
export async function retireRelation(
  ctx: WriteCtx,
  input: RetireRelationInput,
): Promise<WriteResult> {
  requireReason(input.reasonCode, input.reasonText, "remove a link");
  return nextVersion(
    ctx,
    input,
    () => ({
      state: input.enteredInError ? "entered_in_error" : "retired",
      ...reasonCols(input.reasonCode, input.reasonText),
    }),
    { openVisit: false },
  );
}

export interface MoveRelationInput extends VersionInput {
  /** 1-based place among its parent's links (D-REL-12): the note follows it. */
  position: number;
}

export async function moveRelation(ctx: WriteCtx, input: MoveRelationInput): Promise<WriteResult> {
  if (!Number.isInteger(input.position) || input.position < 1 || input.position > 20)
    throw invalid("A place from 1 to 20.");
  return nextVersion(ctx, input, () => ({ position: input.position }), { openVisit: true });
}

export interface RelabelRelationInput extends VersionInput {
  label: RelationLabel;
}

/** "Change" on a cause link: secondary, complication or precipitated by. */
export async function relabelRelation(
  ctx: WriteCtx,
  input: RelabelRelationInput,
): Promise<WriteResult> {
  return nextVersion(
    ctx,
    input,
    (prev) => {
      if (prev.relationType !== "due_to") throw invalid("Only a cause link has a wording.");
      if (prev.label === input.label) throw invalid("The link already reads so.");
      return { label: input.label };
    },
    { openVisit: true },
  );
}

/* ─── Active this visit (episode_of, design §1.2) ─────────────────── */

export interface ActiveThisVisitInput {
  patientUserId: string;
  encounterId: string;
  /** The problem-list condition's current version. */
  problemId: string;
  rank?: "primary" | "secondary";
  /** Default Working: Final follows the usual co-signature rule (D-SI-09). */
  verification?: "provisional" | "confirmed";
  clientKey: string;
}

/**
 * A known condition is active this visit: this visit's diagnosis (encounter_diagnosis, the same term
 * or words) and its episode_of link to the problem-list item, in this one transaction. The problem
 * list keeps its one entry. Keys: `key` for the diagnosis, `key:episode` for the link.
 */
export async function activeThisVisit(
  ctx: WriteCtx,
  input: ActiveThisVisitInput,
): Promise<WriteResult & { conditionId: string }> {
  const linkKey = `${input.clientKey}:episode`;
  const replay = await replayed(ctx.tx, conditionRelations, linkKey, input.patientUserId);
  const done = await replayed(ctx.tx, conditions, input.clientKey, input.patientUserId);
  if (replay && done) return { id: replay, conditionId: done };
  const problem = await currentVersion(ctx, "condition", input.problemId, input.patientUserId);
  if (problem.category !== "problem_list_item")
    throw invalid("Only a problem-list condition becomes active this visit.");
  const dx = await recordEncounterDiagnosis(ctx, {
    patientUserId: input.patientUserId,
    encounterId: input.encounterId,
    clientKey: input.clientKey,
    ...(problem.termId
      ? { termId: problem.termId }
      : { text: problem.textCiphertext ? decrypt(problem.textCiphertext) : undefined }),
    restricted: problem.sensitivity === "restricted",
    verification: input.verification ?? "provisional",
    rank: input.rank,
    addToProblemList: false,
  });
  const link = await createRelation(ctx, {
    patientUserId: input.patientUserId,
    encounterId: input.encounterId,
    conditionId: dx.id,
    relatedConditionId: problem.logicalId,
    relationType: "episode_of",
    clientKey: linkKey,
  });
  return { id: link.id, conditionId: dx.id, warnings: dx.warnings };
}
