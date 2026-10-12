import "server-only";

import type { CriticalEvaluation, CriticalLimit, CriticalLimitVersion } from "./flags";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import { and, asc, desc, eq, inArray, isNull, max, ne } from "drizzle-orm";

import { specimens } from "@/db/schema/emr";
import {
  criticalLimits,
  criticalLimitVersions,
  criticalResponseVersions,
  labComponentMeasures,
  labResultSnapshots,
} from "@/db/schema/lab-safety";
import { clinicalObservations } from "@/db/schema/nurse-workspace";
import { EmrWriteError } from "@/lib/emr/write/context";
import { flaggingActiveFrom } from "./critical-flagging";
import { evaluateCritical, limitSignErrors } from "./flags";
import { patientSexAge } from "./units";

/**
 * Critical limits (Lab Phase 1 Step 6, §5.8, FL-4 to FL-7; D-LAB1-10, -11, -12): one signed,
 * versioned set per hospital, each limit with its test, unit, age band, reference id and source.
 * Typed by the hospital, signed by the laboratory lead and the CSO; an unsigned limit never fires
 * (Law 5). Editing a signed set opens a new draft; the signed one stays in force until replaced.
 */

type Actor = { userId: string; hospitalId: string };
const invalid = (m: string) => new EmrWriteError("invalid", m);

/** Every signed or superseded set here, with its limits (a downtime form asks about the past). */
export async function limitVersions(
  tx: EmrTx,
  hospitalId: string,
): Promise<CriticalLimitVersion[]> {
  const versions = await tx
    .select()
    .from(criticalLimitVersions)
    .where(
      and(
        eq(criticalLimitVersions.hospitalId, hospitalId),
        ne(criticalLimitVersions.status, "draft"),
      ),
    );
  if (versions.length === 0) return [];
  const limits = await tx
    .select()
    .from(criticalLimits)
    .where(
      inArray(
        criticalLimits.versionId,
        versions.map((v) => v.id),
      ),
    );
  return versions.map((v) => ({
    id: v.id,
    hospitalId: v.hospitalId,
    version: v.version,
    status: v.status as CriticalLimitVersion["status"],
    inForceFrom: v.inForceFrom,
    supersededAt: v.supersededAt,
    limits: limits.filter((l) => l.versionId === v.id).map(toLimit),
  }));
}

const toLimit = (l: typeof criticalLimits.$inferSelect): CriticalLimit => ({
  id: l.id,
  testId: l.testId,
  conceptId: l.conceptId,
  unitUcum: l.unitUcum,
  ageFromDays: l.ageFromDays,
  ageToDays: l.ageToDays,
  low: l.low,
  high: l.high,
});

async function unitLookup(tx: EmrTx, hospitalId: string) {
  const rows = await tx
    .select({
      testId: labComponentMeasures.testId,
      conceptId: labComponentMeasures.conceptId,
      unit: labComponentMeasures.unitUcum,
    })
    .from(labComponentMeasures)
    .where(
      and(
        eq(labComponentMeasures.hospitalId, hospitalId),
        isNull(labComponentMeasures.supersededBy),
      ),
    );
  const m = new Map(rows.map((r) => [`${r.testId}|${r.conceptId}`, r.unit]));
  return (testId: string, conceptId: string) => m.get(`${testId}|${conceptId}`) ?? null;
}

const LIMIT_ERRORS: Record<string, string> = {
  unit_mismatch: "A limit must be in its test's unit, from the catalogue.",
  no_limits: "Add at least one limit.",
  limit_empty: "Each limit needs a low or a high.",
  limit_not_decimal: "Type the limits as numbers.",
  limit_order: "In each limit the low must be below the high.",
  limit_overlap: "Two limits for the same test overlap in age.",
};
const words = (errors: string[]) =>
  [...new Set(errors.map((e) => LIMIT_ERRORS[e.split(":")[0]!] ?? e))].join(" ");

export interface LimitDraft extends Omit<CriticalLimit, "id" | "unitUcum"> {
  referenceId: string;
  source: string;
}

/** The whole set as the draft. A draft the lead has signed is never edited: a new one opens. */
export async function saveLimitsDraft(
  tx: EmrTx,
  actor: Actor,
  input: { limits: LimitDraft[] },
  now: Date,
): Promise<string> {
  const unitOf = await unitLookup(tx, actor.hospitalId);
  const rows = input.limits.map((l, i) => ({
    ...l,
    id: String(i + 1),
    unitUcum: unitOf(l.testId, l.conceptId) ?? "",
  }));
  if (rows.some((r) => !r.unitUcum)) throw invalid("Set each test's unit in the catalogue first.");
  if (rows.some((r) => r.source.trim().length < 3 || !r.referenceId.trim()))
    throw invalid("Every limit needs its reference id and source.");
  const errors = limitSignErrors(rows, unitOf);
  if (errors.length) throw invalid(words(errors));
  const [open] = await tx
    .select({ id: criticalLimitVersions.id })
    .from(criticalLimitVersions)
    .where(
      and(
        eq(criticalLimitVersions.hospitalId, actor.hospitalId),
        eq(criticalLimitVersions.status, "draft"),
        isNull(criticalLimitVersions.leadSignedBy),
      ),
    )
    .limit(1);
  let versionId = open?.id;
  if (versionId) {
    await tx.delete(criticalLimits).where(eq(criticalLimits.versionId, versionId));
    await tx
      .update(criticalLimitVersions)
      .set({ authoredBy: actor.userId })
      .where(eq(criticalLimitVersions.id, versionId));
  } else {
    const [{ v }] = (await tx
      .select({ v: max(criticalLimitVersions.version) })
      .from(criticalLimitVersions)
      .where(eq(criticalLimitVersions.hospitalId, actor.hospitalId))) as [{ v: number | null }];
    const [row] = await tx
      .insert(criticalLimitVersions)
      .values({
        hospitalId: actor.hospitalId,
        version: (v ?? 0) + 1,
        authoredBy: actor.userId,
        createdAt: now,
      })
      .returning({ id: criticalLimitVersions.id });
    versionId = row!.id;
  }
  await tx.insert(criticalLimits).values(
    rows.map((r) => ({
      versionId: versionId!,
      testId: r.testId,
      conceptId: r.conceptId,
      unitUcum: r.unitUcum,
      ageFromDays: r.ageFromDays,
      ageToDays: r.ageToDays,
      low: r.low,
      high: r.high,
      referenceId: r.referenceId.trim(),
      source: r.source.trim(),
    })),
  );
  return versionId;
}

/** D-LAB1-11, -12: the lead, then the CSO; the CSO's signature checks the units again (FL-5). */
export async function signLimitsVersion(
  tx: EmrTx,
  signer: { userId: string; hospitalId: string; as: "lead" | "cso" },
  input: { versionId: string; exceptionNote: string | null },
  now: Date,
) {
  const [v] = await tx
    .select()
    .from(criticalLimitVersions)
    .where(
      and(
        eq(criticalLimitVersions.id, input.versionId),
        eq(criticalLimitVersions.hospitalId, signer.hospitalId),
      ),
    )
    .for("update");
  if (!v) throw new EmrWriteError("not_found", "That set of limits was not found.");
  if (v.status !== "draft") throw new EmrWriteError("conflict", "This set is already signed.");
  const note = input.exceptionNote?.trim() || null;
  if (note && note.length < 10) throw invalid("Say in a sentence why no second person can sign.");
  const limits = (
    await tx.select().from(criticalLimits).where(eq(criticalLimits.versionId, v.id))
  ).map(toLimit);
  const errors = limitSignErrors(limits, await unitLookup(tx, signer.hospitalId));
  if (errors.length) throw invalid(words(errors));
  if (signer.as === "lead") {
    if (v.leadSignedBy)
      throw new EmrWriteError("conflict", "The laboratory lead has already signed.");
    if (v.authoredBy === signer.userId && !note)
      throw new EmrWriteError(
        "forbidden",
        "You wrote this draft: another lead signs it, or record why no one else can.",
      );
    await tx
      .update(criticalLimitVersions)
      .set({
        leadSignedBy: signer.userId,
        leadSignedAt: now,
        ...(note ? { exceptionNote: note } : {}),
      })
      .where(eq(criticalLimitVersions.id, v.id));
    return;
  }
  if (!v.leadSignedBy) throw new EmrWriteError("conflict", "The laboratory lead signs first.");
  if (v.leadSignedBy === signer.userId && !note && !v.exceptionNote)
    throw new EmrWriteError(
      "forbidden",
      "You signed as the lead: a different person signs as CSO, or record why no one else can.",
    );
  await tx
    .update(criticalLimitVersions)
    .set({ status: "superseded", supersededAt: now })
    .where(
      and(
        eq(criticalLimitVersions.hospitalId, v.hospitalId),
        eq(criticalLimitVersions.status, "signed"),
        ne(criticalLimitVersions.id, v.id),
      ),
    );
  await tx
    .update(criticalLimitVersions)
    .set({
      status: "signed",
      csoSignedBy: signer.userId,
      csoSignedAt: now,
      inForceFrom: now,
      ...(note ? { exceptionNote: note } : {}),
    })
    .where(eq(criticalLimitVersions.id, v.id));
}

/**
 * The signed limits' verdict on each value of a report just written, as at the specimen's
 * collection (DT-5) and the patient's age then. Reads the report's snapshots (Step 5), so only
 * values entered against the catalogue are judged; coded and text never are (FL-7).
 */
export async function evaluateReport(
  tx: EmrTx,
  input: { hospitalId: string; reportId: string; patientUserId: string; collectedAt: Date },
): Promise<Record<string, CriticalEvaluation>> {
  const versions = await limitVersions(tx, input.hospitalId);
  if (versions.length === 0) return {};
  const snaps = await tx
    .select({
      conceptId: clinicalObservations.conceptId,
      value: labResultSnapshots.valueDecimal,
      unit: labResultSnapshots.unitUcum,
      measureId: labResultSnapshots.measureId,
    })
    .from(labResultSnapshots)
    .innerJoin(clinicalObservations, eq(clinicalObservations.id, labResultSnapshots.observationId))
    .where(eq(labResultSnapshots.reportId, input.reportId));
  if (snaps.length === 0) return {};
  const measures = await tx
    .select({ id: labComponentMeasures.id, testId: labComponentMeasures.testId })
    .from(labComponentMeasures)
    .where(
      inArray(
        labComponentMeasures.id,
        snaps.map((s) => s.measureId),
      ),
    );
  const testOf = new Map(measures.map((m) => [m.id, m.testId]));
  const { ageDays } = await patientSexAge(tx, input.patientUserId, input.collectedAt);
  const out: Record<string, CriticalEvaluation> = {};
  for (const s of snaps) {
    if (!s.conceptId) continue;
    out[s.conceptId] = evaluateCritical(
      {
        value: s.value,
        resultType: "number",
        testId: testOf.get(s.measureId) ?? "",
        conceptId: s.conceptId,
        unitUcum: s.unit,
        hospitalId: input.hospitalId,
        ageDays,
        at: input.collectedAt,
      },
      versions,
    );
  }
  return out;
}

/** CF-1: the hospital's signed limits and response times decide whether MedSync flags. */
export async function flaggingActiveFor(
  hospitalId: string,
  database: EmrDb,
  at = new Date(),
): Promise<boolean> {
  return database.transaction(async (tx) => {
    const [limits, responses] = await Promise.all([
      limitVersions(tx, hospitalId),
      tx
        .select()
        .from(criticalResponseVersions)
        .where(eq(criticalResponseVersions.hospitalId, hospitalId)),
    ]);
    return flaggingActiveFrom({
      hospitalId,
      at,
      limitVersions: limits,
      responseVersions: responses
        .filter((r) => r.status !== "draft")
        .map((r) => ({
          hospitalId: r.hospitalId,
          status: r.status as "signed" | "superseded",
          inForceFrom: r.csoSignedAt,
          supersededAt: r.supersededAt,
        })),
    });
  });
}

/** What the limits set-up shows. */
export async function loadLimitsSetup(tx: EmrTx, hospitalId: string) {
  const versions = await tx
    .select()
    .from(criticalLimitVersions)
    .where(eq(criticalLimitVersions.hospitalId, hospitalId))
    .orderBy(desc(criticalLimitVersions.version));
  const ids = versions.filter((v) => v.status !== "superseded").map((v) => v.id);
  const limits = ids.length
    ? await tx
        .select()
        .from(criticalLimits)
        .where(inArray(criticalLimits.versionId, ids))
        .orderBy(asc(criticalLimits.testId))
    : [];
  return { versions, limits };
}

/** When the order's specimen was collected (DT-5: limits and ages as at then); else now. */
export async function collectedAtFor(tx: EmrTx, orderId: string, fallback: Date): Promise<Date> {
  const [s] = await tx
    .select({ at: specimens.collectedAt })
    .from(specimens)
    .where(eq(specimens.orderId, orderId))
    .limit(1);
  return s?.at ?? fallback;
}

/**
 * S31 (CM-3): a final release with a value at or beyond a signed limit and no recorded check is
 * refused, in the release's own transaction. Inert unless both Phase 1 flags are live here.
 */
export async function refuseUncheckedCritical(
  tx: EmrTx,
  input: {
    hospitalId: string;
    reportId: string;
    patientUserId: string;
    orderId: string;
    now: Date;
  },
): Promise<void> {
  const evaluations = await evaluateReport(tx, {
    hospitalId: input.hospitalId,
    reportId: input.reportId,
    patientUserId: input.patientUserId,
    collectedAt: await collectedAtFor(tx, input.orderId, input.now),
  });
  if (Object.values(evaluations).some((e) => e.kind === "critical"))
    throw new EmrWriteError(
      "invalid",
      "A critical value needs a check before release. Use Check and release.",
    );
}
