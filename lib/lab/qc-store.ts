import "server-only";

import { randomUUID } from "node:crypto";
import type { LookBackDecision } from "./lookback";
import type { QcPlan } from "./qc";
import type { KitQcRule, KitTrigger, ObservedControl } from "./qc-kits";
import type { RunDecision } from "./qc-rules";
import type { Payload, SignedConfig } from "./signed-config";
import type { LotState } from "./stock";
import type { EmrTx } from "@/lib/emr/db";
import { and, asc, desc, eq, gt, inArray, isNull, lte, or, sql } from "drizzle-orm";

import {
  analyserProfiles,
  clinicalObservations,
  devices,
  diagnosticReports,
  labControlChecks,
  labLookbackItems,
  labNcEvents,
  labNonconformities,
  labQcRuns,
  labQcStatus,
  labResultSnapshots,
  labSignedConfigs,
  labStockItems,
  labStockLots,
} from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { conceptDef } from "@/lib/facts/project/shared";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { loadConfigs, saveConfigDraft } from "./catalogue-v2";
import { limitVersions } from "./limits";
import { biasEstimate, lookBack, sortLookBack } from "./lookback";
import { labLeadOf, nextNcNumber, openAutomaticNc } from "./nc-store";
import { closeErrors, resumptionErrors } from "./nonconformity";
import { labTarget, qcStatusFor, targetFor } from "./qc";
import { evaluateKitCheck } from "./qc-kits";
import { evaluateRules, runDecision, zScore } from "./qc-rules";
import { inForce, PAYLOADS } from "./signed-config";
import { dayOf } from "./stock";
import { acceptLot, assertSelectable, quarantineLot } from "./stock-store";

/**
 * Quality control on the database (Lab Phase 3 Step 6, §6.5, §6.6, §6.8; GATE A §5.2–§5.4, P4–P7). One
 * append-only row per QC run, the cached status row beside it in the same transaction (QH-1, E-LAB3-04), kit and
 * stain checks with quarantine, nonconformities with their events and look-back items. The engines decide;
 * nothing here holds a target, SD, rule or minimum (Law 3).
 */

type Actor = { userId: string; hospitalId: string };
const TZ = DEFAULT_TIME_ZONE;
const invalid = (m: string) => new EmrWriteError("invalid", m);
const notFound = (m: string) => new EmrWriteError("not_found", m);
export const planKey = (deviceId: string, conceptId: string) => `${deviceId}:${conceptId}`;
export const analyteName = (conceptId: string) => conceptDef(conceptId)?.display ?? conceptId;

/** The stored values of one run: the z and the target it was read against (the chart's lines). */
export interface RunValue {
  level: number;
  lotId: string;
  value: number;
  z: number;
  mean: number;
  sd: number;
}

export const toPlan = (c: SignedConfig<"qc_plan">): QcPlan & Payload<"qc_plan"> => ({
  ...c.payload,
  version: c.version,
});

async function planFor(
  tx: EmrTx,
  hospitalId: string,
  deviceId: string,
  conceptId: string,
  now: Date,
) {
  return inForce(await loadConfigs(tx, hospitalId), "qc_plan", planKey(deviceId, conceptId), now);
}

async function deviceOf(tx: EmrTx, hospitalId: string, deviceId: string) {
  const [d] = await tx
    .select({ id: devices.id, model: devices.model, state: devices.state })
    .from(devices)
    .where(and(eq(devices.id, deviceId), eq(devices.hospitalId, hospitalId)));
  if (!d) throw notFound("That analyser is not registered here.");
  return d;
}

/* ─── The release path (QH-1): one round trip for every component ─────────── */

export interface QcRow {
  conceptId: string;
  plan: QcPlan | null;
  latestRun: { id: string; decision: RunDecision; runAt: Date } | null;
  held: boolean;
}

/**
 * The plan in force and the cached status row for each component on one analyser, in one query (§11: no extra
 * round trip per component). `qcStatusFor` (pure) then reads them.
 */
export async function qcRowsFor(
  tx: EmrTx,
  hospitalId: string,
  deviceId: string,
  concepts: readonly string[],
  now: Date,
): Promise<QcRow[]> {
  if (concepts.length === 0) return [];
  const rows = await tx
    .select({
      key: labSignedConfigs.key,
      version: labSignedConfigs.version,
      payload: labSignedConfigs.payload,
      runId: labQcStatus.runId,
      held: labQcStatus.held,
      decision: labQcRuns.decision,
      runAt: labQcRuns.runAt,
    })
    .from(labSignedConfigs)
    .leftJoin(
      labQcStatus,
      and(
        eq(labQcStatus.hospitalId, hospitalId),
        sql`${labQcStatus.deviceId}::text || ':' || ${labQcStatus.conceptId} = ${labSignedConfigs.key}`,
      ),
    )
    .leftJoin(labQcRuns, eq(labQcRuns.id, labQcStatus.runId))
    .where(
      and(
        eq(labSignedConfigs.hospitalId, hospitalId),
        eq(labSignedConfigs.kind, "qc_plan"),
        eq(labSignedConfigs.status, "signed"),
        inArray(
          labSignedConfigs.key,
          concepts.map((c) => planKey(deviceId, c)),
        ),
        lte(labSignedConfigs.inForceFrom, now),
        or(isNull(labSignedConfigs.supersededAt), gt(labSignedConfigs.supersededAt, now)),
      ),
    );
  return concepts.map((conceptId) => {
    const r = rows.find((x) => x.key === planKey(deviceId, conceptId));
    const p = r ? PAYLOADS.qc_plan.safeParse(r.payload) : null;
    return {
      conceptId,
      plan: r && p?.success ? { ...p.data, version: r.version } : null,
      latestRun:
        r?.runId && r.runAt
          ? { id: r.runId, decision: r.decision as RunDecision, runAt: r.runAt }
          : null,
      held: r?.held ?? false,
    };
  });
}

/* ─── A run (QR-1..QR-4, QH-1, §5.2 steps 1–6) ──────────────────────────── */

export interface RunInput {
  deviceId: string;
  conceptId: string;
  values: { level: number; lotId: string; value: number }[];
  /** What the screen showed: the server evaluates again and refuses a different answer. */
  expect: RunDecision;
  firstStep: string | null;
  note: string | null;
  runAt: Date;
  clientKey: string;
}

/** The runs of a device × component, oldest first, as the rule engine reads them. */
async function history(tx: EmrTx, hospitalId: string, deviceId: string, conceptId: string) {
  const rows = await tx
    .select({ id: labQcRuns.id, planVersion: labQcRuns.planVersion, values: labQcRuns.values })
    .from(labQcRuns)
    .where(
      and(
        eq(labQcRuns.hospitalId, hospitalId),
        eq(labQcRuns.deviceId, deviceId),
        eq(labQcRuns.conceptId, conceptId),
      ),
    )
    .orderBy(desc(labQcRuns.runAt))
    // ponytail: the longest rule (12-x) needs 12 runs; 60 leaves room for lot and version cuts.
    .limit(60);
  return rows.reverse().map((r) => ({
    id: r.id,
    planVersion: r.planVersion,
    values: (r.values as RunValue[]).map((v) => ({ level: v.level, lotId: v.lotId, z: v.z })),
  }));
}

export async function recordQcRun(
  tx: EmrTx,
  a: Actor,
  input: RunInput,
  now: Date,
): Promise<{ id: string; decision: RunDecision; ncId: string | null }> {
  const [dup] = await tx
    .select({ id: labQcRuns.id, decision: labQcRuns.decision })
    .from(labQcRuns)
    .where(eq(labQcRuns.clientKey, input.clientKey));
  if (dup) return { id: dup.id, decision: dup.decision as RunDecision, ncId: null };
  const device = await deviceOf(tx, a.hospitalId, input.deviceId);
  const name = analyteName(input.conceptId);
  const config = await planFor(tx, a.hospitalId, input.deviceId, input.conceptId, now);
  if (!config)
    throw new EmrWriteError(
      "config",
      `${name} on ${device.model} has no signed QC plan. The laboratory lead sets one.`,
    );
  const plan = toPlan(config);
  if (input.runAt.getTime() > now.getTime()) throw invalid("The run cannot be in the future.");
  const lots = await tx
    .select()
    .from(labStockLots)
    .where(
      and(
        eq(labStockLots.hospitalId, a.hospitalId),
        inArray(
          labStockLots.id,
          input.values.map((v) => v.lotId),
        ),
      ),
    );
  const values: RunValue[] = plan.levels.map((l) => {
    const v = input.values.find((x) => x.level === l.level);
    if (!v || !Number.isFinite(v.value)) throw invalid(`Enter the result for ${l.label}.`);
    const lot = lots.find((x) => x.id === v.lotId);
    if (!lot || lot.itemId !== l.controlItemId)
      throw invalid(`${l.label}: choose a lot of the plan's control material.`);
    assertSelectable({ ...lot, state: lot.state as LotState }, input.runAt);
    const t = targetFor(plan, l.level, v.lotId);
    // Law 8: a control lot with no target cannot be scored; the lead adds it to the plan.
    if (!t) throw invalid(`${l.label}: lot ${lot.lot} has no target in the signed plan.`);
    return {
      level: l.level,
      lotId: v.lotId,
      value: v.value,
      z: zScore(v.value, t),
      mean: t.mean,
      sd: t.sd,
    };
  });
  const id = randomUUID();
  const breaks = evaluateRules(
    plan,
    { id, planVersion: plan.version, values },
    await history(tx, a.hospitalId, input.deviceId, input.conceptId),
  );
  const decision = runDecision(breaks);
  if (decision !== input.expect)
    throw new EmrWriteError("conflict", "The rules give a different answer now. Reload the run.");
  const firstStep = input.firstStep?.trim() || null;
  if (decision === "rejected" && !firstStep) throw invalid("Say what you will check first.");
  await tx.insert(labQcRuns).values({
    id,
    hospitalId: a.hospitalId,
    deviceId: input.deviceId,
    conceptId: input.conceptId,
    planConfigId: config.id,
    planVersion: plan.version,
    values,
    breaks,
    decision,
    firstStep: decision === "rejected" ? firstStep : null,
    note: input.note?.trim() || null,
    runAt: input.runAt,
    recordedBy: a.userId,
    clientKey: input.clientKey,
  });
  // QH-1: the cache, in the same transaction. A reject holds; only the lead's resumption lifts it (NC-3).
  const status = qcStatusFor({
    plan,
    latestRun: { id, decision, runAt: input.runAt },
    at: input.runAt,
    timeZone: TZ,
  }).status;
  const row = {
    hospitalId: a.hospitalId,
    deviceId: input.deviceId,
    conceptId: input.conceptId,
    status,
    runId: id,
    planConfigId: config.id,
    updatedAt: now,
  };
  await tx
    .insert(labQcStatus)
    .values({ ...row, held: decision === "rejected" })
    .onConflictDoUpdate({
      target: [labQcStatus.hospitalId, labQcStatus.deviceId, labQcStatus.conceptId],
      set:
        decision === "rejected"
          ? { ...row, held: true }
          : { status, runId: id, planConfigId: config.id, updatedAt: now },
    });
  if (decision !== "rejected") return { id, decision, ncId: null };

  // §5.2 step 6: the nonconformity (owner the lead), the hold as MedSync's action, and the look-back.
  const rules = [...new Set(breaks.filter((b) => b.kind === "reject").map((b) => b.rule))].join(
    ", ",
  );
  const nc = await openAutomaticNc(
    tx,
    a.hospitalId,
    {
      source: "qc_reject",
      sourceRef: id,
      deviceId: input.deviceId,
      conceptId: input.conceptId,
      title: `QC rejected: ${name} on ${device.model}`,
      whatHappened: `Rules broken: ${rules}. First step: ${firstStep}.`,
    },
    now,
  );
  const today = dayOf(now, TZ);
  await tx.insert(labNcEvents).values([
    {
      ncId: nc.id,
      hospitalId: a.hospitalId,
      kind: "action_added",
      payload: {
        actionId: "hold",
        what: `Hold release of ${name} on ${device.model}`,
        who: "MedSync",
        by: today,
      },
      at: now,
    },
    {
      ncId: nc.id,
      hospitalId: a.hospitalId,
      kind: "action_updated",
      payload: { actionId: "hold", state: "done" },
      at: now,
    },
  ]);
  await fillLookBack(tx, a.hospitalId, {
    ncId: nc.id,
    deviceId: input.deviceId,
    conceptId: input.conceptId,
    rejectedRun: { id, runAt: input.runAt },
    breaks,
    sdByLevel: new Map(values.map((v) => [v.level, v.sd])),
  });
  return { id, decision, ncId: nc.id };
}

/* ─── The look-back (LB-1, LB-2) ───────────────────────────────────────── */

/** Released numeric results of a component made on a device (first release of each value), oldest first. */
async function releasedOn(tx: EmrTx, hospitalId: string, deviceId: string, conceptId: string) {
  const o = clinicalObservations;
  return tx
    .selectDistinctOn([o.logicalId], {
      id: o.id,
      reportId: o.reportId,
      patientUserId: o.patientUserId,
      value: o.valueNum,
      releasedAt: o.recordedAt,
      qc: labResultSnapshots.qc,
      low: labResultSnapshots.rangeLow,
      high: labResultSnapshots.rangeHigh,
    })
    .from(o)
    .innerJoin(labResultSnapshots, eq(labResultSnapshots.observationId, o.id))
    .innerJoin(analyserProfiles, eq(analyserProfiles.id, labResultSnapshots.profileId))
    .where(
      and(
        eq(o.hospitalId, hospitalId),
        eq(o.conceptId, conceptId),
        eq(analyserProfiles.deviceId, deviceId),
        inArray(o.status, ["final", "amended", "corrected"]),
        sql`${o.valueNum} IS NOT NULL`,
      ),
    )
    .orderBy(o.logicalId, asc(o.recordedAt));
}

/** Signed critical limits for the component (every age band: the look-back only sorts, LB-2). */
async function criticalValues(tx: EmrTx, hospitalId: string, conceptId: string, now: Date) {
  const v = (await limitVersions(tx, hospitalId)).filter(
    (x) => x.status === "signed" && (!x.inForceFrom || x.inForceFrom <= now),
  );
  return v.flatMap((x) =>
    x.limits.filter((l) => l.conceptId === conceptId).flatMap((l) => [l.low, l.high]),
  );
}

async function fillLookBack(
  tx: EmrTx,
  hospitalId: string,
  input: {
    ncId: string;
    deviceId: string;
    conceptId: string;
    rejectedRun: { id: string; runAt: Date };
    breaks: Parameters<typeof biasEstimate>[0];
    sdByLevel: Map<number, number>;
  },
) {
  const [runs, results, critical] = await Promise.all([
    tx
      .select({ id: labQcRuns.id, runAt: labQcRuns.runAt, decision: labQcRuns.decision })
      .from(labQcRuns)
      .where(
        and(
          eq(labQcRuns.hospitalId, hospitalId),
          eq(labQcRuns.deviceId, input.deviceId),
          eq(labQcRuns.conceptId, input.conceptId),
        ),
      ),
    releasedOn(tx, hospitalId, input.deviceId, input.conceptId),
    criticalValues(tx, hospitalId, input.conceptId, input.rejectedRun.runAt),
  ]);
  // ponytail: a downtime result's window time is its entry time, not the paper form's result time.
  const inWindow = lookBack({
    hospitalId,
    deviceId: input.deviceId,
    conceptId: input.conceptId,
    runs: runs.map((r) => ({ ...r, decision: r.decision as RunDecision })),
    rejectedRunId: input.rejectedRun.id,
    results: results.map((r) => ({
      hospitalId,
      deviceId: input.deviceId,
      conceptId: input.conceptId,
      reportId: r.reportId!,
      observationId: r.id,
      patientUserId: r.patientUserId,
      releasedAt: r.releasedAt,
      value: r.value!,
      override: !!(r.qc as { override?: unknown } | null)?.override,
    })),
  });
  const bias = biasEstimate(input.breaks, input.sdByLevel);
  const band = new Map(results.map((r) => [r.id, { low: r.low, high: r.high }]));
  const items = inWindow.map((r) => ({
    ncId: input.ncId,
    hospitalId,
    patientUserId: r.patientUserId,
    reportId: r.reportId,
    observationId: r.observationId,
    releasedAt: r.releasedAt,
    value: r.value,
    sort: sortLookBack([r], bias, { band: band.get(r.observationId) ?? null, critical })[0]!.sort,
  }));
  if (items.length) await tx.insert(labLookbackItems).values(items).onConflictDoNothing();
}

/** The open QC nonconformity of a device × component, if any. */
export async function openQcNc(tx: EmrTx, hospitalId: string, deviceId: string, conceptId: string) {
  const [nc] = await tx
    .select({ id: labNonconformities.id })
    .from(labNonconformities)
    .where(
      and(
        eq(labNonconformities.hospitalId, hospitalId),
        eq(labNonconformities.source, "qc_reject"),
        eq(labNonconformities.subjectDeviceId, deviceId),
        eq(labNonconformities.subjectConceptId, conceptId),
        eq(labNonconformities.state, "open"),
      ),
    )
    .orderBy(desc(labNonconformities.openedAt))
    .limit(1);
  return nc?.id ?? null;
}

/**
 * QH-4: a result released past the hold joins the look-back of the open QC nonconformity, and the override is
 * recorded there as an event (who, which report, why).
 */
export async function joinLookBackOnOverride(
  tx: EmrTx,
  a: Actor,
  input: {
    deviceId: string;
    conceptId: string;
    patientUserId: string;
    reportId: string;
    observationId: string;
    value: string | null;
    reason: string;
  },
  now: Date,
) {
  const ncId = await openQcNc(tx, a.hospitalId, input.deviceId, input.conceptId);
  if (!ncId) return;
  await tx.insert(labNcEvents).values({
    ncId,
    hospitalId: a.hospitalId,
    kind: "note",
    payload: { override: { by: a.userId, reportId: input.reportId, reason: input.reason } },
    actor: a.userId,
    at: now,
  });
  if (input.value === null) return;
  await tx
    .insert(labLookbackItems)
    .values({
      ncId,
      hospitalId: a.hospitalId,
      patientUserId: input.patientUserId,
      reportId: input.reportId,
      observationId: input.observationId,
      releasedAt: now,
      value: input.value,
      sort: "unchanged",
    })
    .onConflictDoNothing();
}

/** LB-3: one decision per result. Amend is recorded once the Phase 1 amendment exists (CA-10 sent there). */
export async function decideLookbackItem(
  tx: EmrTx,
  a: Actor,
  input: { itemId: string; decision: "stands" | "repeat" | "amend" },
  now: Date,
) {
  const [item] = await tx
    .select()
    .from(labLookbackItems)
    .where(
      and(eq(labLookbackItems.id, input.itemId), eq(labLookbackItems.hospitalId, a.hospitalId)),
    );
  if (!item) throw notFound("That result is not in this look-back.");
  if (item.decision) throw new EmrWriteError("conflict", "This result is already decided.");
  let amendmentReportId: string | null = null;
  if (input.decision === "amend") {
    const [rep] = await tx
      .select({ logicalId: diagnosticReports.logicalId })
      .from(diagnosticReports)
      .where(eq(diagnosticReports.id, item.reportId));
    const [amended] = rep
      ? await tx
          .select({ id: diagnosticReports.id })
          .from(diagnosticReports)
          .where(
            and(
              eq(diagnosticReports.logicalId, rep.logicalId),
              inArray(diagnosticReports.status, ["amended", "corrected"]),
              gt(diagnosticReports.recordedAt, item.releasedAt),
            ),
          )
          .orderBy(desc(diagnosticReports.version))
          .limit(1)
      : [];
    if (!amended)
      throw invalid("Amend the result first (open it and amend), then record the decision.");
    amendmentReportId = amended.id;
  }
  await tx
    .update(labLookbackItems)
    .set({ decision: input.decision, decidedBy: a.userId, decidedAt: now, amendmentReportId })
    .where(eq(labLookbackItems.id, item.id));
  return item.id;
}

/**
 * LB-3 "Repeat when QC passes": a repeat decision is a task on the worklist once the analyte's QC on that analyser is
 * not failed (an EQA nonconformity has no analyser: at once), until someone records the repeat as done (a `note`
 * event on the nonconformity, append-only and audited) or the result has a later version (it was amended). No
 * task table: the task is derived from the decision, the cached QC status and the events.
 */
export async function repeatTasks(tx: EmrTx, hospitalId: string, itemId: string | null = null) {
  const raw = (await tx.execute(sql`
    SELECT i.id, i.nc_id AS "ncId", i.patient_user_id AS "patientUserId", i.value::text AS value,
           i.released_at AS "releasedAt", d.order_id AS "orderId", n.subject_concept_id AS "conceptId",
           n.number
      FROM lab_lookback_items i
      JOIN lab_nonconformities n ON n.id = i.nc_id
      JOIN diagnostic_reports d ON d.id = i.report_id
      LEFT JOIN lab_qc_status q ON q.hospital_id = i.hospital_id AND q.device_id = n.subject_device_id
                               AND q.concept_id = n.subject_concept_id
     WHERE i.hospital_id = ${hospitalId} AND i.decision = 'repeat'
       AND (${itemId}::uuid IS NULL OR i.id = ${itemId}::uuid)
       AND (n.subject_device_id IS NULL OR q.status IS DISTINCT FROM 'failed')
       AND NOT EXISTS (SELECT 1 FROM lab_nc_events e WHERE e.nc_id = i.nc_id AND e.kind = 'note'
                          AND e.payload ->> 'repeatDone' = i.id::text)
       AND NOT EXISTS (SELECT 1 FROM diagnostic_reports v WHERE v.logical_id = d.logical_id
                          AND v.version > d.version AND v.status IN ('amended','corrected'))
     ORDER BY i.released_at`)) as unknown;
  const rows = (Array.isArray(raw) ? raw : ((raw as { rows?: unknown[] }).rows ?? [])) as {
    id: string;
    ncId: string;
    patientUserId: string;
    value: string;
    releasedAt: string | Date;
    orderId: string | null;
    conceptId: string | null;
    number: string;
  }[];
  return rows.map((r) => ({ ...r, releasedAt: new Date(r.releasedAt) }));
}

/** LB-3: the repeat is done (the result stands, or was amended on its page); recorded once, on the NC. */
export async function repeatDone(tx: EmrTx, a: Actor, input: { itemId: string }, now: Date) {
  const [task] = await repeatTasks(tx, a.hospitalId, input.itemId);
  if (!task)
    throw new EmrWriteError(
      "conflict",
      "There is no repeat to record: QC has not passed yet, or the repeat is already recorded.",
    );
  await tx.insert(labNcEvents).values({
    ncId: task.ncId,
    hospitalId: a.hospitalId,
    kind: "note",
    payload: { repeatDone: task.id },
    actor: a.userId,
    at: now,
  });
  return task.id;
}

/* ─── This lab's target (QQ-3) ─────────────────────────────────────────── */

/**
 * "Set this lab's target": the mean and SD of the accepted runs on this control lot and level, once the signed
 * policy's minimum runs and days are reached. Writes a new plan version as a draft (lead and CSO sign it); no
 * target ever changes otherwise.
 */
export async function setLabTarget(
  tx: EmrTx,
  a: Actor,
  input: { deviceId: string; conceptId: string; level: number; controlLotId: string },
  now: Date,
): Promise<string> {
  const configs = await loadConfigs(tx, a.hospitalId);
  const key = planKey(input.deviceId, input.conceptId);
  const plan = inForce(configs, "qc_plan", key, now);
  if (!plan) throw new EmrWriteError("config", "This analyte has no signed QC plan.");
  const policy = inForce(configs, "qc_policy", "hospital", now);
  if (!policy)
    throw new EmrWriteError(
      "config",
      "No signed QC policy: the laboratory lead and the CSO sign the minimum runs and days first.",
    );
  const runs = await tx
    .select({ decision: labQcRuns.decision, runAt: labQcRuns.runAt, values: labQcRuns.values })
    .from(labQcRuns)
    .where(
      and(
        eq(labQcRuns.hospitalId, a.hospitalId),
        eq(labQcRuns.deviceId, input.deviceId),
        eq(labQcRuns.conceptId, input.conceptId),
      ),
    );
  const points = runs.flatMap((r) =>
    (r.values as RunValue[])
      .filter((v) => v.level === input.level && v.lotId === input.controlLotId)
      .map((v) => ({ decision: r.decision as RunDecision, runAt: r.runAt, value: v.value })),
  );
  const t = labTarget(points, policy.payload, TZ);
  if (t.kind === "not_enough")
    throw invalid(
      `Not enough accepted runs yet: ${t.runs} over ${t.days} days. The policy asks for ${policy.payload.minRunsForTarget} over ${policy.payload.minDaysForTarget}.`,
    );
  if (
    !plan.payload.targets.some(
      (x) => x.level === input.level && x.controlLotId === input.controlLotId,
    )
  )
    throw invalid("This control lot has no target on the plan to replace.");
  const payload = {
    ...plan.payload,
    targets: plan.payload.targets.map((x) =>
      x.level === input.level && x.controlLotId === input.controlLotId
        ? {
            ...x,
            mean: t.mean,
            sd: t.sd,
            source: "lab" as const,
            runs: t.runs,
            from: t.from.toISOString(),
            to: t.to.toISOString(),
          }
        : x,
    ),
  };
  return saveConfigDraft(tx, a, { kind: "qc_plan", key, payload, newVersion: true }, now);
}

/* ─── Kits and stains (KQ-1..KQ-5) ─────────────────────────────────────── */

export async function recordKitQc(
  tx: EmrTx,
  a: Actor,
  input: {
    lotId: string;
    trigger: KitTrigger["kind"];
    observed: ObservedControl[];
    clientKey: string;
  },
  now: Date,
): Promise<{ id: string; outcome: "pass" | "fail"; lotTo: string | null }> {
  const [dup] = await tx
    .select({ id: labControlChecks.id, outcome: labControlChecks.outcome })
    .from(labControlChecks)
    .where(eq(labControlChecks.clientKey, input.clientKey));
  if (dup) return { id: dup.id, outcome: dup.outcome as "pass" | "fail", lotTo: null };
  const [row] = await tx
    .select({ lot: labStockLots, item: labStockItems })
    .from(labStockLots)
    .innerJoin(labStockItems, eq(labStockItems.id, labStockLots.itemId))
    .where(and(eq(labStockLots.id, input.lotId), eq(labStockLots.hospitalId, a.hospitalId)));
  if (!row) throw notFound("That lot is not in this lab's stock.");
  const { lot, item } = row;
  if (item.kind !== "kit" && item.kind !== "stain")
    throw invalid("Kit and stain QC is for kits and stains.");
  const configs = await loadConfigs(tx, a.hospitalId);
  const rule = inForce(configs, "kit_qc_rule", item.id, now);
  if (!rule)
    throw new EmrWriteError(
      "config",
      `${item.name} has no signed QC rule. The laboratory lead sets one.`,
    );
  const ev = evaluateKitCheck({
    rule: rule.payload as KitQcRule,
    observed: input.observed,
    lotState: lot.state as Parameters<typeof evaluateKitCheck>[0]["lotState"],
    acceptanceMethod: inForce(configs, "acceptance_plan", item.id, now)?.payload.method ?? null,
  });
  const id = randomUUID();
  await tx.insert(labControlChecks).values({
    id,
    hospitalId: a.hospitalId,
    subject: item.kind === "stain" ? "stain" : "kit",
    itemId: item.id,
    lotId: lot.id,
    trigger: input.trigger,
    controls: rule.payload.controls.map((c) => ({
      name: c.name,
      expected: c.expected,
      observed: input.observed.find((o) => o.name === c.name) ?? null,
      pass: ev.controls.find((x) => x.name === c.name)?.pass ?? false,
    })),
    outcome: ev.outcome,
    hmisIqc: rule.payload.hmisIqc,
    operator: a.userId,
    at: now,
    clientKey: input.clientKey,
  });
  if (ev.lotTo === "quarantined") {
    // KQ-3: at once, and a nonconformity owned by the lead.
    await quarantineLot(tx, a, { lotId: lot.id, reason: "A control failed (kit QC)." }, now);
    await openAutomaticNc(
      tx,
      a.hospitalId,
      {
        source: "kit_qc_fail",
        sourceRef: id,
        deviceId: null,
        title: `Control failed: ${item.name} lot ${lot.lot}`,
        whatHappened: `A control failed on lot ${lot.lot}. The lot is quarantined.`,
      },
      now,
    );
  } else if (ev.lotTo === "accepted") {
    // KQ-4: a pass on a new lot under a qc_pass plan accepts it (LA-1).
    await acceptLot(tx, a, { lotId: lot.id, pairs: [], qcIds: [id], certificate: null }, now);
  }
  return { id, outcome: ev.outcome, lotTo: ev.lotTo };
}

/* ─── Nonconformities (NC-1..NC-5) ─────────────────────────────────────── */

async function ncOf(tx: EmrTx, hospitalId: string, ncId: string) {
  const [nc] = await tx
    .select()
    .from(labNonconformities)
    .where(and(eq(labNonconformities.id, ncId), eq(labNonconformities.hospitalId, hospitalId)));
  if (!nc) throw notFound("That nonconformity is not in this lab.");
  if (nc.state === "closed") throw new EmrWriteError("conflict", "This nonconformity is closed.");
  return nc;
}

/** NC-1: a manual nonconformity (equipment, complaint, specimen, other), owned by the lead. */
export async function openNonconformity(
  tx: EmrTx,
  a: Actor,
  input: {
    source: "equipment" | "complaint" | "specimen" | "other";
    title: string;
    whatHappened: string;
    riskText: string | null;
    deviceId: string | null;
  },
  now: Date,
) {
  if (input.deviceId) await deviceOf(tx, a.hospitalId, input.deviceId);
  const [nc] = await tx
    .insert(labNonconformities)
    .values({
      hospitalId: a.hospitalId,
      number: await nextNcNumber(tx, a.hospitalId, now),
      source: input.source,
      subjectDeviceId: input.deviceId,
      title: input.title,
      whatHappened: input.whatHappened,
      riskText: input.riskText,
      owner: (await labLeadOf(tx, a.hospitalId)) ?? a.userId,
      openedBy: a.userId,
      openedAt: now,
    })
    .returning({ id: labNonconformities.id });
  return nc!.id;
}

/** NC-2: actions are events; an action is added once and its state moves by later events. */
export async function ncAction(
  tx: EmrTx,
  a: Actor,
  input:
    | { ncId: string; add: { what: string; who: string; by: string } }
    | {
        ncId: string;
        update: { actionId: string; state: "done" | "cancelled"; reason: string | null };
      },
  now: Date,
) {
  await ncOf(tx, a.hospitalId, input.ncId);
  if ("update" in input && input.update.state === "cancelled" && !input.update.reason?.trim())
    throw invalid("Say why the action is cancelled.");
  const [e] = await tx
    .insert(labNcEvents)
    .values({
      ncId: input.ncId,
      hospitalId: a.hospitalId,
      kind: "add" in input ? "action_added" : "action_updated",
      payload:
        "add" in input
          ? { actionId: randomUUID(), ...input.add }
          : { ...input.update, reason: input.update.reason?.trim() || undefined },
      actor: a.userId,
      at: now,
    })
    .returning({ id: labNcEvents.id });
  return e!.id;
}

const ncEvents = async (tx: EmrTx, ncId: string) =>
  (
    await tx
      .select({ kind: labNcEvents.kind, payload: labNcEvents.payload })
      .from(labNcEvents)
      .where(eq(labNcEvents.ncId, ncId))
      .orderBy(asc(labNcEvents.at))
  ).map(
    (e) =>
      ({ kind: e.kind, ...(e.payload as object) }) as Parameters<
        typeof closeErrors
      >[0]["events"][number],
  );

const lookBackOf = async (tx: EmrTx, ncId: string) =>
  (await tx
    .select({ decision: labLookbackItems.decision })
    .from(labLookbackItems)
    .where(eq(labLookbackItems.ncId, ncId))) as { decision: LookBackDecision | null }[];

/** NC-3: a passing run on the device × component after the rejected run, for a QC nonconformity. */
export async function passingRunAfterReject(
  tx: EmrTx,
  nc: Pick<
    typeof labNonconformities.$inferSelect,
    "sourceRef" | "subjectDeviceId" | "subjectConceptId"
  >,
) {
  if (!nc.sourceRef || !nc.subjectDeviceId || !nc.subjectConceptId) return false;
  const [rejected] = await tx
    .select({ runAt: labQcRuns.runAt })
    .from(labQcRuns)
    .where(eq(labQcRuns.id, nc.sourceRef));
  if (!rejected) return false;
  const [pass] = await tx
    .select({ id: labQcRuns.id })
    .from(labQcRuns)
    .where(
      and(
        eq(labQcRuns.deviceId, nc.subjectDeviceId),
        eq(labQcRuns.conceptId, nc.subjectConceptId),
        inArray(labQcRuns.decision, ["accepted", "warning"]),
        gt(labQcRuns.runAt, rejected.runAt),
      ),
    )
    .limit(1);
  return !!pass;
}

/** NC-3: the lead authorises resumption once a run passes after the reject and the look-back is finished. */
export async function authoriseResumption(tx: EmrTx, a: Actor, input: { ncId: string }, now: Date) {
  const nc = await ncOf(tx, a.hospitalId, input.ncId);
  if (!nc.testingHalted || nc.resumedAt)
    throw new EmrWriteError("conflict", "Testing is not halted by this nonconformity.");
  const errors = resumptionErrors({
    actorIsLead: true,
    passingRunAfterReject: await passingRunAfterReject(tx, nc),
    lookBack: await lookBackOf(tx, nc.id),
  });
  if (errors.length)
    throw invalid(
      errors.includes("no_passing_run")
        ? "No QC run has passed since the rejected run. Rerun QC after the corrective action."
        : "The look-back is not finished: decide every result first.",
    );
  await tx
    .update(labNonconformities)
    .set({ resumedAt: now, resumedBy: a.userId })
    .where(eq(labNonconformities.id, nc.id));
  await tx
    .insert(labNcEvents)
    .values({ ncId: nc.id, hospitalId: a.hospitalId, kind: "resumed", actor: a.userId, at: now });
  if (nc.subjectDeviceId && nc.subjectConceptId)
    await tx
      .update(labQcStatus)
      .set({ held: false, updatedAt: now })
      .where(
        and(
          eq(labQcStatus.hospitalId, a.hospitalId),
          eq(labQcStatus.deviceId, nc.subjectDeviceId),
          eq(labQcStatus.conceptId, nc.subjectConceptId),
        ),
      );
  return nc.id;
}

const CLOSE_WORDS: Record<string, string> = {
  no_cause: "Choose the cause category.",
  lookback_undecided: "Decide every result in the look-back first.",
  actions_open: "Mark every action done, or cancel it with a reason.",
  cancel_without_reason: "A cancelled action needs its reason.",
  effectiveness_not_met: "Record the effectiveness check as met.",
};

/** NC-4: closed only by the lead, with every condition met. Nothing auto-closes (NC-5). */
export async function closeNonconformity(
  tx: EmrTx,
  a: Actor,
  input: {
    ncId: string;
    causeCategory: string;
    effectivenessPlan: string;
    effectivenessMet: boolean;
  },
  now: Date,
) {
  const nc = await ncOf(tx, a.hospitalId, input.ncId);
  if (nc.testingHalted && !nc.resumedAt)
    throw invalid("Authorise resumption before closing: testing is still halted.");
  const errors = closeErrors({
    actorIsLead: true,
    causeCategory: input.causeCategory,
    effectivenessMet: input.effectivenessMet,
    events: await ncEvents(tx, nc.id),
    lookBack: await lookBackOf(tx, nc.id),
  });
  if (errors.length) throw invalid(CLOSE_WORDS[errors[0]!] ?? "This cannot close yet.");
  await tx
    .update(labNonconformities)
    .set({
      causeCategory: input.causeCategory,
      effectivenessPlan: input.effectivenessPlan.trim(),
      effectivenessMet: true,
      state: "closed",
      closedAt: now,
      closedBy: a.userId,
    })
    .where(eq(labNonconformities.id, nc.id));
  await tx
    .insert(labNcEvents)
    .values({ ncId: nc.id, hospitalId: a.hospitalId, kind: "closed", actor: a.userId, at: now });
  return nc.id;
}
