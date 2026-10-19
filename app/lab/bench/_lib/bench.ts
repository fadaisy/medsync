import "server-only";

import type { labV2 } from "../../_lib/places";
import type { PatientIdentity } from "@/components/emr/orders/model";
import type { SectionKey, WorklistRow } from "@/lib/lab/worklist";
import { and, eq, inArray, isNotNull, notExists, sql } from "drizzle-orm";

import { db } from "@/db";
import { deltaFlags, deltaOutcomes, diagnosticReports } from "@/db/schema";
import { identitiesFor } from "@/lib/emr/read/results";
import { labWorklistFor, rejectedFor, releasedTodayFor, requestNow } from "@/lib/lab/page-data";
import { computeWorklist, LAB_STAGES } from "@/lib/lab/worklist";

export type BenchStage = "to_receive" | "to_result" | "preliminary" | "released" | "rejected";
export const BENCH_STAGES: readonly BenchStage[] = [
  "to_receive",
  "to_result",
  "preliminary",
  "released",
  "rejected",
];

export interface QueueRow {
  orderId: string;
  specimenId: string | null;
  patientUserId: string;
  name: string;
  mrn: string;
  test: string;
  from: string | null;
  stage: WorklistRow["stage"];
  waitingMinutes: number;
  /** The turnaround engine's overrun in minutes (amber "Late"), never computed here. */
  lateBy: number | null;
  received: boolean;
  pills: ("delta" | "qcHold" | "immediate" | "restricted" | "highRisk")[];
  action: WorklistRow["action"];
  highRisk: boolean;
}

/**
 * The bench queue (prompt 5.5): the worklist exactly as the worklist engine orders it (urgent and late first),
 * in the viewer's section by default (Phase 0), with each row's one pill read from existing state: a delta flag
 * without an outcome, a report still holding components for QC, an immediate priority, a restricted test, a
 * high-risk encounter. Identities revealed once, as on the worklist (one batched audit insert).
 */
export async function loadBench(
  v2: Awaited<ReturnType<typeof labV2>>,
  q: { stage: string | undefined; section: string | undefined; patient: string | undefined },
) {
  const { scope } = v2;
  const now = requestNow();
  const data = await labWorklistFor(scope.hospitalId);
  const viewer = {
    hospitalId: scope.hospitalId,
    permissions: scope.access.permissions,
    sectionIds: scope.sectionIds,
  };
  const stage: BenchStage = BENCH_STAGES.find((s) => s === q.stage) ?? "to_result";
  const workStage = (LAB_STAGES as readonly string[]).includes(stage)
    ? (stage as WorklistRow["stage"])
    : null;
  const wl = computeWorklist({
    rows: data.inputs,
    sections: data.sections,
    viewer,
    filters: { section: (q.section as SectionKey | undefined) ?? null, stage: workStage ?? "all" },
    serverNow: now,
  });
  const rows = q.patient ? wl.rows.filter((r) => r.patientUserId === q.patient) : wl.rows;
  const orderIds = data.inputs.map((i) => i.orderId);
  const [ids, flagged, held, released, rejected] = await Promise.all([
    identitiesFor(
      scope,
      rows.map((r) => r.patientUserId),
      "lab_worklist",
    ),
    orderIds.length
      ? db
          .selectDistinct({ orderId: deltaFlags.orderId })
          .from(deltaFlags)
          .where(
            and(
              eq(deltaFlags.hospitalId, scope.hospitalId),
              inArray(deltaFlags.orderId, orderIds),
              notExists(
                db
                  .select({ x: sql`1` })
                  .from(deltaOutcomes)
                  .where(eq(deltaOutcomes.flagId, deltaFlags.id)),
              ),
            ),
          )
      : [],
    orderIds.length
      ? db
          .selectDistinct({ orderId: diagnosticReports.orderId })
          .from(diagnosticReports)
          .where(
            and(
              eq(diagnosticReports.hospitalId, scope.hospitalId),
              inArray(diagnosticReports.orderId, orderIds),
              isNotNull(diagnosticReports.qcHeld),
              sql`not exists (select 1 from ${diagnosticReports} n where n.supersedes_id = ${diagnosticReports.id})`,
            ),
          )
      : [],
    releasedTodayFor(scope.hospitalId),
    rejectedFor(scope.hospitalId),
  ]);
  const delta = new Set(flagged.map((f) => f.orderId));
  const qc = new Set(held.map((h) => h.orderId));
  const queue: QueueRow[] = rows.map((r) => {
    const who: PatientIdentity | undefined = ids.get(r.patientUserId);
    const pills: QueueRow["pills"] = [];
    if (delta.has(r.orderId)) pills.push("delta");
    if (qc.has(r.orderId)) pills.push("qcHold");
    if (r.priority === "immediate" || r.priority === "emergency") pills.push("immediate");
    if (data.restricted.has(r.orderId)) pills.push("restricted");
    if (data.highRisk.has(r.orderId)) pills.push("highRisk");
    return {
      orderId: r.orderId,
      specimenId: r.specimenId,
      patientUserId: r.patientUserId,
      name: who?.name ?? "",
      mrn: who?.mrn ?? "",
      test: r.test,
      from: r.from?.name ?? null,
      stage: r.stage,
      waitingMinutes: r.clock.kind === "not_received" ? r.clock.sinceCollection : r.clock.elapsed,
      lateBy: r.clock.kind === "running" ? r.clock.lateBy : null,
      received: r.clock.kind === "running",
      pills,
      action: r.action,
      highRisk: data.highRisk.has(r.orderId),
    };
  });
  return {
    stage,
    section: wl.section,
    sectionTabs: wl.sectionTabs,
    stageCounts: { ...wl.stageCounts, released: released.length, rejected: rejected.length },
    queue,
    procedure: data.procedure,
    noSectionAssigned: wl.noSectionAssigned,
    now,
  };
}
