"use server";

import { z } from "zod";

import { runEmrWrite } from "@/lib/emr/write/orders";
import * as results from "@/lib/emr/write/results";
import { criticalsLive } from "@/lib/lab/criticals/readiness";

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

const ReleaseResults = z.object({ ...base, reportId: uuid, clientKey });

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

export async function enterResults(raw: unknown) {
  return runEmrWrite(EnterResults, raw, (ctx, input) => results.enterResults(ctx, input));
}

export async function releaseResults(raw: unknown) {
  return runEmrWrite(ReleaseResults, raw, (ctx, input) => results.releaseResults(ctx, input));
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
