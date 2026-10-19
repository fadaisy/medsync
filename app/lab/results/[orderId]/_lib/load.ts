import "server-only";

import type { LabTechScope } from "@/lib/lab-tech/scope";
import { notFound } from "next/navigation";

import { db } from "@/db";
import { emrV1LiveFor } from "@/lib/emr/feature";
import { loadResultEntry } from "@/lib/emr/read/results";
import { criticalFlaggingActive } from "@/lib/lab/critical-flagging";
import { alertsForOrder, loadLabCriticals, previewRecipients } from "@/lib/lab/criticals/read";
import { criticalsLive, unitsRangesLive } from "@/lib/lab/criticals/readiness";
import { flagsForOrder } from "@/lib/lab/delta-read";
import {
  labBenchLiveFor,
  labDeltaChecksLiveFor,
  labHighRiskLiveFor,
  labQcLiveFor,
} from "@/lib/lab/feature";
import { flaggingActiveFor } from "@/lib/lab/limits";
import { LAB_TIME_ZONE, requestNow } from "@/lib/lab/page-data";
import { holdFor } from "@/lib/lab/qc-read";
import { highRiskForOrder, loadBenchContext, loadRejectableSpecimen } from "@/lib/lab/read";
import { fixedForOrder } from "@/lib/lab/units-read";

/**
 * Everything the result screen reads, once (Lab Phases 0–5). Shared by the old result page and the Lab
 * Workspace v2 bench work pane, so both read exactly the same gates, holds, flags and alerts (Law 4).
 * `releaseBlockedWords` is the line shown when a delta check waits (the screen's own words).
 */
export async function loadResultScreen(
  scope: LabTechScope,
  orderId: string,
  releaseBlockedWords: string,
) {
  if (!emrV1LiveFor(scope.hospitalId)) notFound();
  const loaded = await loadResultEntry(scope, orderId, {
    mode: "direct",
    surface: "lab_result_entry",
  });
  if (!loaded) notFound();
  // Lab Phase 1 §5.1 (LAB_UNITS_RANGES): the catalogue's unit and the signed range, while entering.
  const fixed =
    scope.workspaceLive && loaded.mode === "direct" && (await unitsRangesLive(scope.hospitalId))
      ? await fixedForOrder(
          scope.hospitalId,
          orderId,
          loaded.patientUserId,
          scope.access.permissions.has("lab.manage"),
          undefined,
          // Released: each value as its snapshot holds it (Law 8).
          loaded.report?.released ? loaded.report.id : undefined,
          await criticalsLive(scope.hospitalId),
        )
      : null;
  const withFixed = fixed
    ? {
        ...loaded,
        components: loaded.components.map((c) =>
          fixed[c.conceptId] ? { ...c, fixed: fixed[c.conceptId] } : c,
        ),
      }
    : loaded;
  const workspace = scope.workspaceLive;
  // Lab Phase 3 (§5.3, labQc): the QC column, the hold block and the override, read from the cached rows.
  const qcHeld = new Set(withFixed.report?.released ? (withFixed.report.qcHeld ?? []) : []);
  const qc =
    workspace && withFixed.mode === "direct" && labQcLiveFor(scope.hospitalId)
      ? await db.transaction((t) =>
          holdFor(
            t as never,
            scope.hospitalId,
            {
              orderId,
              concepts: withFixed.components
                .filter((c) => c.valueType === "quantity")
                .map((c) => c.conceptId),
              priority: withFixed.priority,
            },
            requestNow(),
          ),
        )
      : null;
  // Before release every blocked component is held; after it, only those the report still holds.
  const blocked = (qc?.components ?? []).filter(
    (c) => c.blocked && (!withFixed.report?.released || qcHeld.has(c.conceptId)),
  );
  const base = qc
    ? {
        ...withFixed,
        components: withFixed.components.map((c) => {
          const s = qc.components.find((x) => x.conceptId === c.conceptId);
          return s ? { ...c, qc: qcEntryWord(s, qcHeld.has(c.conceptId)) } : c;
        }),
      }
    : withFixed;
  // Lab Phase 5 (§5.6, DL-6): delta checks on this order; Release waits for a decision on each.
  const delta =
    workspace && labDeltaChecksLiveFor(scope.hospitalId)
      ? await db.transaction((tx) => flagsForOrder(tx, scope.hospitalId, orderId))
      : [];
  const data = {
    ...base,
    releaseBlocked: delta.some((f) => !f.outcome) ? releaseBlockedWords : null,
  };
  // Lab Phase 1 (§5.2): the mark panel on a result not yet released, and the alert's status after.
  const criticals = workspace && data.mode === "direct" && (await criticalsLive(scope.hospitalId));
  const now = requestNow();
  const preview =
    criticals && !data.report?.released && scope.access.permissions.has("lab.result.release")
      ? await previewRecipients(
          scope,
          { orderId, patientUserId: data.patientUserId, restricted: false },
          now,
        )
      : null;
  const [alerts, list] =
    criticals && data.report?.released
      ? await Promise.all([
          alertsForOrder(scope.hospitalId, orderId),
          loadLabCriticals(scope.hospitalId, now, LAB_TIME_ZONE),
        ])
      : [[], null];
  // Lab Phase 2 §5.6, HR-3: the high-risk warning above the results while it is on.
  const highRisk = labHighRiskLiveFor(scope.hospitalId)
    ? await highRiskForOrder(scope.hospitalId, orderId)
    : null;
  // Lab Phase 2 §5.6 (labBench): the clinical question and this specimen, beside the results.
  const bench = labBenchLiveFor(scope.hospitalId)
    ? await loadBenchContext(scope.hospitalId, orderId)
    : null;
  const specimenId =
    workspace && !data.report?.released
      ? await loadRejectableSpecimen(scope.hospitalId, orderId)
      : null;
  const flagging = workspace
    ? criticals
      ? (await flaggingActiveFor(scope.hospitalId, db as never))
        ? "on"
        : "off"
      : !criticalFlaggingActive(scope.hospitalId)
        ? "notice"
        : null
    : null;
  return {
    data,
    qc,
    blocked,
    qcHeld,
    delta,
    criticals,
    now,
    preview,
    alerts,
    list,
    highRisk,
    bench,
    specimenId,
    flagging,
    workspace,
  };
}

/** §5.3's QC column: Held (amber) and the other statuses, each a word. */
function qcEntryWord(
  c: { status: string; blocked: boolean },
  heldInReport: boolean,
): { word: string; tone: "passed" | "amber" | "none" } {
  if (heldInReport || c.blocked) return { word: "Held", tone: "amber" };
  if (c.status === "passed" || c.status === "provisional_target")
    return { word: "Passed", tone: "passed" };
  if (c.status === "warning") return { word: "Warning 1-2s", tone: "amber" };
  if (c.status === "failed") return { word: "QC failed", tone: "amber" };
  if (c.status === "no_plan") return { word: "No QC plan", tone: "amber" };
  return { word: "QC not run today", tone: "none" };
}
