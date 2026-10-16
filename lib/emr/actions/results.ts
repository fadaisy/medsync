"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";

import { diagnosticReports } from "@/db/schema/emr";
import { runEmrWrite } from "@/lib/emr/write/orders";
import * as results from "@/lib/emr/write/results";
import { criticalsLive, unitsRangesLive } from "@/lib/lab/criticals/readiness";

/**
 * Results, acknowledgement and critical-result communication (PROMPT §8, D-EMR-06/07/08). Same
 * contract as lib/emr/actions/orders.ts. Warnings (a critical value, a re-acknowledgement) are
 * returned, never thrown.
 */

const surface = z.enum(["doctor", "nurse", "clinician", "lab"]);
const uuid = z.uuid();
const clientKey = z.string().trim().min(8).max(120);
const base = { surface, patientUserId: uuid };

const Value = z.object({
  conceptId: z.string().trim().min(3).max(80),
  value: z.string().trim().max(200).optional(),
  unit: z.string().trim().max(40).optional(),
  unitConfirmed: z.boolean().optional(),
  code: z.string().trim().max(60).optional(),
  method: z.string().trim().max(60).optional(),
  referenceRange: z
    .object({ low: z.number().optional(), high: z.number().optional(), unit: z.string().max(40) })
    .optional(),
  labInterpretation: z.enum(["L", "H", "LL", "HH", "N", "A"]).optional(),
  restricted: z.boolean().optional(),
  name: z.string().trim().max(120).optional(),
  replaces: uuid.optional(),
  // Lab Phase 1 Step 5 (UN-6, FL-3).
  entryCheckConfirmed: z.boolean().optional(),
  flagChange: z
    .object({ flag: z.enum(["low", "high", "normal"]), reason: z.string().trim().min(3).max(200) })
    .optional(),
});
const values = z.array(Value).max(40);
const conclusion = {
  conclusionCode: z.enum(["normal", "abnormal", "indeterminate"]).optional(),
  conclusionText: z.string().trim().max(4000).optional(),
};

const EnterResults = z.object({
  ...base,
  orderId: uuid,
  status: z.enum(["preliminary", "final"]),
  values,
  ...conclusion,
  performerLabName: z.string().trim().max(120).optional(),
  clientKey,
});

const ReleaseResults = z.object({
  ...base,
  reportId: uuid,
  clientKey,
  // Lab Phase 3 (QH-4): release past a QC hold; the server checks lab.qc.override.
  qcOverride: z.object({ reason: z.string().trim().min(3, "Say why.").max(300) }).optional(),
});

const AmendResults = z.object({
  ...base,
  reportId: uuid,
  status: z.enum(["amended", "corrected"]),
  values,
  reasonText: z.string().trim().min(3).max(500),
  ...conclusion,
  clientKey,
});

const AcknowledgeResults = z.object({
  ...base,
  items: z
    .array(
      z.object({
        reportId: uuid,
        action: z.enum(["seen", "acted", "forwarded"]),
        forwardedToUserId: uuid.optional(),
        note: z.string().trim().max(1000).optional(),
      }),
    )
    .min(1)
    .max(50),
  clientKey,
});

const CriticalCommunication = z.object({
  ...base,
  reportId: uuid,
  communicatedToUserId: uuid,
  communicatedToRole: z.enum(["orderer", "covering_clinician", "in_charge"]),
  method: z.enum(["in_app", "phone", "in_person"]),
  readBack: z.boolean(),
  communicatedAt: z.coerce.date().optional(),
  clientKey,
});

/**
 * Lab Phase 1 Step 6 (S31): with LAB_CRITICALS and LAB_UNITS_RANGES live, a final release by the lab
 * with a value at or beyond a signed limit is refused unless it goes through Check and release.
 */
async function guardUncheckedCritical(
  ctx: Parameters<Parameters<typeof runEmrWrite>[2]>[0],
  r: { id: string },
  patientUserId: string,
) {
  if (ctx.actor.surface !== "lab") return;
  if (
    !(await criticalsLive(ctx.actor.hospitalId)) ||
    !(await unitsRangesLive(ctx.actor.hospitalId))
  )
    return;
  const [order] = await ctx.tx
    .select({ orderId: diagnosticReports.orderId })
    .from(diagnosticReports)
    .where(eq(diagnosticReports.id, r.id));
  if (!order?.orderId) return;
  const { refuseUncheckedCritical } = await import("@/lib/lab/limits");
  await refuseUncheckedCritical(ctx.tx, {
    hospitalId: ctx.actor.hospitalId,
    reportId: r.id,
    patientUserId,
    orderId: order.orderId,
    now: ctx.now,
  });
}

export async function enterResults(raw: unknown) {
  return runEmrWrite(EnterResults, raw, async (ctx, input) => {
    const r = await results.enterResults(ctx, input);
    if (input.status === "final") await guardUncheckedCritical(ctx, r, input.patientUserId);
    return r;
  });
}

export async function releaseResults(raw: unknown) {
  return runEmrWrite(ReleaseResults, raw, async (ctx, input) => {
    const r = await results.releaseResults(ctx, input);
    await guardUncheckedCritical(ctx, r, input.patientUserId);
    return r;
  });
}

/**
 * Lab Phase 1 (CA-10): with LAB_CRITICALS on, amending a result that was alerted opens a linked
 * correction alert in the same transaction; delivery follows commit and never throws.
 */
export async function amendResults(raw: unknown) {
  const r = await runEmrWrite(AmendResults, raw, async (ctx, input) => {
    const amended = await results.amendResults(ctx, input);
    if (!(await criticalsLive(ctx.actor.hospitalId))) return { ...amended, jobs: [] };
    const { correctAlerts } = await import("@/lib/lab/criticals/store");
    const c = await correctAlerts(ctx, {
      patientUserId: input.patientUserId,
      priorReportId: input.reportId,
      newReportId: amended.id,
    });
    return { ...amended, jobs: c.jobs };
  });
  if (!r.ok) return r;
  const { jobs, ...data } = r.data!;
  if (jobs.length) {
    const { deliverAfterCommit } = await import("@/lib/lab/criticals/store");
    const { db } = await import("@/db");
    await deliverAfterCommit(db as unknown as Parameters<typeof deliverAfterCommit>[0], jobs).catch(
      () => undefined,
    );
  }
  return { ...r, data };
}

export async function acknowledgeResults(raw: unknown) {
  return runEmrWrite(AcknowledgeResults, raw, results.acknowledgeResults);
}

export async function recordCriticalCommunication(raw: unknown) {
  return runEmrWrite(CriticalCommunication, raw, results.recordCriticalCommunication);
}
