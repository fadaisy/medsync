import "server-only";

import type { MarkInput } from "./criticals/marks";
import type { EmrTx } from "@/lib/emr/db";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { ResultValueInput } from "@/lib/emr/write/results";
import { and, asc, desc, eq, gte, inArray, max, sql } from "drizzle-orm";

import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { specimens } from "@/db/schema/emr";
import {
  downtimeDrills,
  downtimeEntries,
  downtimeFormNumbers,
  downtimePeriods,
  labBriefings,
} from "@/db/schema/lab-safety";
import { cadres } from "@/db/schema/reference-data";
import { EmrWriteError } from "@/lib/emr/write/context";
import { loadOrder, orderStatus, placeOrders } from "@/lib/emr/write/orders";
import { enterResults } from "@/lib/emr/write/results";
import { collectSpecimen, receiveSpecimen } from "@/lib/emr/write/specimens";
import { criticalsLive, unitsRangesLive } from "./criticals/readiness";
import { createAlertOnRelease, logCriticalCall } from "./criticals/store";
import { checkFormTimes, formNumberMove, nextFormNumbers, periodErrors } from "./downtime";
import { collectedAtFor, evaluateReport } from "./limits";

/**
 * Downtime (Lab Phase 1 Step 7, §5.9; DT-1 to DT-8; ADR 0248). A downtime period is a record; form
 * numbers are reserved on the server before printing, one per sheet, and entered once; a paper form
 * is back-entered through the existing engines in one transaction, keeping the form's collection
 * and result times beside the server's entry time (Law 9). Drills and briefings are records only.
 */

type Actor = { userId: string; hospitalId: string };
const invalid = (m: string) => new EmrWriteError("invalid", m);

export async function recordPeriod(
  tx: EmrTx,
  actor: Actor,
  input: {
    startsAt: Date;
    endsAt: Date;
    reason: "network" | "power" | "system" | "other";
    note: string | null;
  },
  now: Date,
) {
  const errors = periodErrors({ ...input, now });
  if (errors.length)
    throw invalid(
      errors.includes("order")
        ? "The downtime ends after it starts."
        : "Record a downtime that has ended, with its reason.",
    );
  const [row] = await tx
    .insert(downtimePeriods)
    .values({
      hospitalId: actor.hospitalId,
      ...input,
      note: input.note?.trim() || null,
      recordedBy: actor.userId,
      createdAt: now,
    })
    .returning({ id: downtimePeriods.id });
  return row!.id;
}

/** DT-2: a run of numbers after the highest ever reserved here, one per printed sheet. */
export async function reserveFormNumbers(
  tx: EmrTx,
  actor: Actor,
  count: number,
  now: Date,
): Promise<number[]> {
  // Serialise reservations per hospital: two printers never get the same numbers.
  await tx.execute(
    sql`SELECT pg_advisory_xact_lock(hashtext(${`downtime-forms:${actor.hospitalId}`}))`,
  );
  const [{ n }] = (await tx
    .select({ n: max(downtimeFormNumbers.number) })
    .from(downtimeFormNumbers)
    .where(eq(downtimeFormNumbers.hospitalId, actor.hospitalId))) as [{ n: number | null }];
  const numbers = nextFormNumbers(n, count);
  await tx.insert(downtimeFormNumbers).values(
    numbers.map((number) => ({
      hospitalId: actor.hospitalId,
      number,
      reservedBy: actor.userId,
      reservedAt: now,
    })),
  );
  return numbers;
}

export async function voidFormNumber(
  tx: EmrTx,
  actor: Actor,
  input: { number: number; reason: string },
) {
  const [f] = await tx
    .select()
    .from(downtimeFormNumbers)
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, actor.hospitalId),
        eq(downtimeFormNumbers.workspace, "lab"),
        eq(downtimeFormNumbers.number, input.number),
      ),
    )
    .for("update");
  const move = formNumberMove(f ? (f.state as "unused" | "entered" | "voided") : null);
  if (!move.ok)
    throw invalid(
      move.reason === "not_reserved"
        ? "That form number was never printed here."
        : `Form ${input.number} is ${f!.state}.`,
    );
  if (input.reason.trim().length < 3) throw invalid("Say why the form is voided.");
  await tx
    .update(downtimeFormNumbers)
    .set({ state: "voided", voidedReason: input.reason.trim() })
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, actor.hospitalId),
        eq(downtimeFormNumbers.workspace, "lab"),
        eq(downtimeFormNumbers.number, input.number),
      ),
    );
}

/** DT-8: a drill writes a drill record and nothing else. */
export async function recordDrill(
  tx: EmrTx,
  actor: Actor,
  input: { heldOn: string; participants: string; whatWasDone: string; problems: string | null },
  now: Date,
) {
  const [row] = await tx
    .insert(downtimeDrills)
    .values({
      hospitalId: actor.hospitalId,
      ...input,
      problems: input.problems?.trim() || null,
      recordedBy: actor.userId,
      createdAt: now,
    })
    .returning({ id: downtimeDrills.id });
  return row!.id;
}

export async function recordBriefing(
  tx: EmrTx,
  actor: Actor,
  input: { heldOn: string; audience: string; notes: string | null },
  now: Date,
) {
  const [row] = await tx
    .insert(labBriefings)
    .values({
      hospitalId: actor.hospitalId,
      ...input,
      notes: input.notes?.trim() || null,
      recordedBy: actor.userId,
      createdAt: now,
    })
    .returning({ id: labBriefings.id });
  return row!.id;
}

export interface DowntimeFormInput {
  patientUserId: string;
  formNumber: number;
  collectedAt: Date;
  resultedAt: Date;
  releasedOnPaperBy: string;
  outsidePeriodReason: string | null;
  /** The MedSync order the paper form answers; or a new one transcribed from the paper request. */
  orderId: string | null;
  newOrder: {
    encounterId: string;
    testId: string;
    requestedByUserId: string;
    priority: "routine" | "urgent" | "immediate";
  } | null;
  values: ResultValueInput[];
  /** DT-6: the components marked critical on the paper form, with the check written on it. */
  marks: MarkInput[];
  /** DT-6: the call written on the form. With read-back to a clinician who may acknowledge, the
   *  alert is created already acknowledged by phone at that time. */
  call: { toUserId: string; at: Date; readBack: boolean } | null;
  clientKey: string;
}

/**
 * DT-3 to DT-7: one paper form, back-entered in one transaction as the lab user: the form number is
 * taken, the order found or transcribed, the specimen collected at the form's time and received, the
 * report entered as final through the result engine (units, ranges and flags as at collection), the
 * form's times kept, and any critical alerted as a live result would be.
 */
export async function enterDowntimeForm(ctx: WriteCtx, input: DowntimeFormInput) {
  const { tx, actor, now } = ctx;
  const [form] = await tx
    .select()
    .from(downtimeFormNumbers)
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, actor.hospitalId),
        eq(downtimeFormNumbers.workspace, "lab"),
        eq(downtimeFormNumbers.number, input.formNumber),
      ),
    )
    .for("update");
  const move = formNumberMove(form ? (form.state as "unused" | "entered" | "voided") : null);
  if (!move.ok)
    throw invalid(
      move.reason === "not_reserved"
        ? `Form ${input.formNumber} was never printed here.`
        : `Form ${input.formNumber} is already ${move.reason === "already_entered" ? "entered" : "voided"}.`,
    ); // S39

  const periods = await tx
    .select()
    .from(downtimePeriods)
    .where(eq(downtimePeriods.hospitalId, actor.hospitalId));
  const times = checkFormTimes(
    { collectedAt: input.collectedAt, resultedAt: input.resultedAt },
    { now, periods, outsidePeriodReason: input.outsidePeriodReason },
  );
  if (!times.ok)
    throw invalid(
      times.errors.includes("future")
        ? "A time on the form is in the future."
        : times.errors.includes("result_before_collection")
          ? "The result time is before the collection time."
          : "These times are outside any recorded downtime: say why.",
    ); // S40, DT-4
  if (input.releasedOnPaperBy.trim().length < 2) throw invalid("Who released the result on paper?");

  // The order: the one in MedSync, or transcribed from the paper request on the open visit.
  let orderId = input.orderId;
  if (!orderId) {
    if (!input.newOrder) throw invalid("Choose the request this form answers.");
    const [requester] = await tx
      .select({ code: cadres.code })
      .from(staffAffiliations)
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(
        and(
          eq(staffAffiliations.userId, input.newOrder.requestedByUserId),
          eq(staffAffiliations.hospitalId, actor.hospitalId),
          inArray(staffAffiliations.state, ["active", "approved"]),
        ),
      )
      .limit(1);
    if (!requester) throw invalid("The requesting clinician must be staff here.");
    const placed = await placeOrders(
      ctx,
      {
        patientUserId: input.patientUserId,
        encounterId: input.newOrder.encounterId,
        orders: [
          {
            clientKey: `${input.clientKey}:order`,
            testId: input.newOrder.testId,
            priority: input.newOrder.priority,
            reasonText: `Paper request, downtime form ${input.formNumber}`,
          },
        ],
      },
      {
        downtime: {
          requestedByUserId: input.newOrder.requestedByUserId,
          requesterCadre: requester.code,
        },
      },
    );
    orderId = placed.id;
  }
  const order = await loadOrder(ctx, input.patientUserId, orderId);
  const status = await orderStatus(tx, order);
  if (
    status.state === "resulted" ||
    status.state === "acknowledged" ||
    status.state === "cancelled"
  )
    throw new EmrWriteError(
      "conflict",
      "That request already has a result in MedSync, or was cancelled.",
    );

  // The specimen, at the form's collection time (Law 9), then received.
  let specimenId = "specimenId" in status ? status.specimenId : null;
  if (!specimenId) {
    const sp = await collectSpecimen(ctx, {
      patientUserId: input.patientUserId,
      orderId,
      identifiersConfirmed: true,
      fastingState: "unknown",
      collectedAt: input.collectedAt,
      clientKey: `${input.clientKey}:specimen`,
    });
    specimenId = sp.id;
  } else {
    const [sp] = await tx
      .select({ at: specimens.collectedAt })
      .from(specimens)
      .where(eq(specimens.id, specimenId));
    if (sp && sp.at > input.resultedAt)
      throw invalid("The specimen in MedSync was collected after the form's result time.");
  }
  if (status.state !== "in_progress")
    await receiveSpecimen(ctx, {
      patientUserId: input.patientUserId,
      specimenId,
      clientKey: `${input.clientKey}:receive`,
    });

  const report = await enterResults(ctx, {
    patientUserId: input.patientUserId,
    orderId,
    status: "final",
    values: input.values,
    clientKey: `${input.clientKey}:report`,
  });

  await tx.insert(downtimeEntries).values({
    reportId: report.id,
    hospitalId: actor.hospitalId,
    patientUserId: input.patientUserId,
    formNumber: input.formNumber,
    collectedAt: input.collectedAt,
    resultedAt: input.resultedAt,
    enteredAt: now,
    releasedOnPaperBy: input.releasedOnPaperBy.trim(),
    outsidePeriodReason: times.insidePeriod ? null : input.outsidePeriodReason?.trim() || null,
    enteredBy: actor.userId,
  });
  await tx
    .update(downtimeFormNumbers)
    .set({ state: "entered", reportId: report.id })
    .where(
      and(
        eq(downtimeFormNumbers.hospitalId, actor.hospitalId),
        eq(downtimeFormNumbers.workspace, "lab"),
        eq(downtimeFormNumbers.number, input.formNumber),
      ),
    );

  // DT-5, DT-6: criticals as a live result would be, judged as at the form's collection.
  let alert: Awaited<ReturnType<typeof createAlertOnRelease>> | null = null;
  let jobs: Awaited<ReturnType<typeof createAlertOnRelease>>["jobs"] = [];
  if (await criticalsLive(actor.hospitalId)) {
    const evaluations = (await unitsRangesLive(actor.hospitalId))
      ? await evaluateReport(tx, {
          hospitalId: actor.hospitalId,
          reportId: report.id,
          patientUserId: input.patientUserId,
          collectedAt: await collectedAtFor(tx, orderId, input.collectedAt),
        })
      : undefined;
    alert = await createAlertOnRelease(ctx, {
      patientUserId: input.patientUserId,
      reportId: report.id,
      orderId,
      marks: input.marks,
      note: `Entered after downtime, paper form ${input.formNumber}`,
      clientKey: `${input.clientKey}:alert`,
      ...(evaluations ? { evaluations } : {}),
    });
    jobs = alert.jobs;
    if (alert.alertId && input.call) {
      if (input.call.at > now || input.call.at < input.resultedAt)
        throw invalid("The call on the form must be after the result and not in the future.");
      const logged = await logCriticalCall(tx, actor, {
        alertId: alert.alertId,
        to: { userId: input.call.toUserId },
        readBack: input.call.readBack,
        now: input.call.at,
      });
      jobs = [...jobs, ...logged.jobs];
    }
  } else if (input.marks.length) {
    throw invalid(
      "Critical alerts are not switched on here: phone the ward and record the call as before.",
    );
  }

  return {
    reportId: report.id,
    orderId,
    alertId: alert?.alertId ?? null,
    jobs,
    resultedAt: input.resultedAt,
    enteredAt: now,
  };
}

/* ─── What the downtime page shows ────────────────────────────────────── */

export async function loadDowntime(tx: EmrTx, hospitalId: string, since: Date) {
  const [periods, unused, entries, drills, briefings] = await Promise.all([
    tx
      .select()
      .from(downtimePeriods)
      .where(eq(downtimePeriods.hospitalId, hospitalId))
      .orderBy(desc(downtimePeriods.startsAt))
      .limit(20),
    tx
      .select({ number: downtimeFormNumbers.number, reservedAt: downtimeFormNumbers.reservedAt })
      .from(downtimeFormNumbers)
      .where(
        and(
          eq(downtimeFormNumbers.hospitalId, hospitalId),
          eq(downtimeFormNumbers.workspace, "lab"),
          eq(downtimeFormNumbers.state, "unused"),
        ),
      )
      .orderBy(asc(downtimeFormNumbers.number)),
    tx
      .select()
      .from(downtimeEntries)
      .where(and(eq(downtimeEntries.hospitalId, hospitalId), gte(downtimeEntries.enteredAt, since)))
      .orderBy(desc(downtimeEntries.enteredAt))
      .limit(50),
    tx
      .select()
      .from(downtimeDrills)
      .where(and(eq(downtimeDrills.hospitalId, hospitalId), eq(downtimeDrills.workspace, "lab")))
      .orderBy(desc(downtimeDrills.heldOn))
      .limit(10),
    tx
      .select()
      .from(labBriefings)
      .where(eq(labBriefings.hospitalId, hospitalId))
      .orderBy(desc(labBriefings.heldOn))
      .limit(10),
  ]);
  return { periods, unused, entries, drills, briefings };
}

export const formLabel = (n: number) => `DT-${String(n).padStart(5, "0")}`;
