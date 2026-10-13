import "server-only";

import type { QcStatus } from "./qc";
import type { KitQcRule, KitTrigger } from "./qc-kits";
import type { RuleBreak, RunDecision } from "./qc-rules";
import type { RunValue } from "./qc-store";
import type { Payload, SignedConfig } from "./signed-config";
import type { EmrTx } from "@/lib/emr/db";
import { and, asc, desc, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";

import {
  devices,
  diagnosticReports,
  encounterOrders,
  labControlChecks,
  labLookbackItems,
  labNcEvents,
  labNonconformities,
  labQcRuns,
  labQcStatus,
  labResultSnapshots,
  labStockItems,
  labStockLots,
  users,
} from "@/db/schema";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { loadConfigs, pinnedProfile } from "./catalogue-v2";
import { labQcHoldLiveFor } from "./feature";
import { biasEstimate, lookBackProgress } from "./lookback";
import { foldNc, overdueActions } from "./nonconformity";
import { labTarget, otherAnalysers, qcStatusFor } from "./qc";
import { kitQcBlocks, kitQcDue } from "./qc-kits";
import { analyteName, passingRunAfterReject, planKey, qcRowsFor, toPlan } from "./qc-store";
import { inForce } from "./signed-config";
import { dayOf, lotRefusal } from "./stock";

/**
 * Quality control, read (Lab Phase 3 §5.1–§5.4, §5.9). One read per page. Statuses are the engine's
 * (`qcStatusFor` over the cached row); nothing here decides a hold the server would not.
 */
const TZ = DEFAULT_TIME_ZONE;

/** Whether the server would hold a release of this status now (QH-2, QH-3). */
export const blocks = (
  s: { status: QcStatus; held: boolean; holdWhenNotRun: boolean },
  holdOn: boolean,
) =>
  holdOn &&
  (s.held || s.status === "failed" || (s.status === "not_run_in_window" && s.holdWhenNotRun));

const breakRules = (breaks: unknown) => [
  ...new Set((breaks as RuleBreak[]).filter((b) => b.kind === "reject").map((b) => b.rule)),
];

/* ─── Plans and their status (§5.1, §5.2) ─────────────────────────────── */

export interface PlanRow {
  configId: string;
  deviceId: string;
  conceptId: string;
  analyte: string;
  device: string;
  status: QcStatus;
  held: boolean;
  blocked: boolean;
  lastRun: { at: Date; decision: RunDecision; rules: string[] } | null;
  holdWhenNotRun: boolean;
}

export async function loadQcPlans(tx: EmrTx, hospitalId: string, now: Date) {
  const configs = await loadConfigs(tx, hospitalId);
  const keys = [...new Set(configs.filter((c) => c.kind === "qc_plan").map((c) => c.key))];
  const [statuses, devs] = await Promise.all([
    tx
      .select({
        s: labQcStatus,
        runAt: labQcRuns.runAt,
        decision: labQcRuns.decision,
        breaks: labQcRuns.breaks,
      })
      .from(labQcStatus)
      .leftJoin(labQcRuns, eq(labQcRuns.id, labQcStatus.runId))
      .where(eq(labQcStatus.hospitalId, hospitalId)),
    tx
      .select({ id: devices.id, model: devices.model, state: devices.state })
      .from(devices)
      .where(eq(devices.hospitalId, hospitalId)),
  ]);
  const holdOn = labQcHoldLiveFor(hospitalId);
  const rows: PlanRow[] = [];
  const drafts: {
    id: string;
    key: string;
    analyte: string;
    device: string;
    signedByLead: boolean;
  }[] = [];
  for (const k of keys) {
    const [deviceId, conceptId] = k.split(":") as [string, string];
    const device = devs.find((d) => d.id === deviceId)?.model ?? "Analyser";
    const draft = configs.find((c) => c.kind === "qc_plan" && c.key === k && c.status === "draft");
    if (draft)
      drafts.push({
        id: draft.id,
        key: k,
        analyte: analyteName(conceptId),
        device,
        signedByLead: false,
      });
    const c = inForce(configs, "qc_plan", k, now);
    if (!c) continue;
    const st = statuses.find((x) => x.s.deviceId === deviceId && x.s.conceptId === conceptId);
    const plan = toPlan(c);
    const s = qcStatusFor({
      plan,
      latestRun:
        st?.s.runId && st.runAt
          ? { id: st.s.runId, decision: st.decision as RunDecision, runAt: st.runAt }
          : null,
      at: now,
      timeZone: TZ,
    });
    const held = st?.s.held ?? false;
    rows.push({
      configId: c.id,
      deviceId,
      conceptId,
      analyte: analyteName(conceptId),
      device,
      status: s.status,
      held,
      blocked: blocks({ status: s.status, held, holdWhenNotRun: plan.holdWhenNotRun }, holdOn),
      lastRun: st?.runAt
        ? { at: st.runAt, decision: st.decision as RunDecision, rules: breakRules(st.breaks) }
        : null,
      holdWhenNotRun: plan.holdWhenNotRun,
    });
  }
  const policy = inForce(configs, "qc_policy", "hospital", now);
  const policyDraft = configs.find((c) => c.kind === "qc_policy" && c.status === "draft") ?? null;
  return {
    rows: rows.sort(
      (a, b) => a.device.localeCompare(b.device) || a.analyte.localeCompare(b.analyte),
    ),
    drafts,
    policy: policy?.payload ?? null,
    policyDraft: policyDraft
      ? { id: policyDraft.id, payload: policyDraft.payload as Payload<"qc_policy"> }
      : null,
    analysers: devs.filter((d) => d.state !== "retired").map((d) => ({ id: d.id, model: d.model })),
  };
}

/* ─── One series: the chart, this run, the plan card (§5.2) ───────────── */

export async function loadQcSeries(
  tx: EmrTx,
  hospitalId: string,
  input: { deviceId: string; conceptId: string; days: number },
  now: Date,
) {
  const key = planKey(input.deviceId, input.conceptId);
  const configs = await loadConfigs(tx, hospitalId);
  const config = inForce(configs, "qc_plan", key, now) as SignedConfig<"qc_plan"> | null;
  const draft = (configs.find(
    (c) => c.kind === "qc_plan" && c.key === key && c.status === "draft",
  ) ?? null) as SignedConfig<"qc_plan"> | null;
  const [device] = await tx
    .select({ id: devices.id, model: devices.model })
    .from(devices)
    .where(and(eq(devices.id, input.deviceId), eq(devices.hospitalId, hospitalId)));
  if (!device) return null;
  const since = new Date(now.getTime() - input.days * 86_400_000);
  const plan = config ? toPlan(config) : null;
  const itemIds = [
    ...new Set(
      [...(plan?.levels ?? []), ...(draft?.payload.levels ?? [])].map((l) => l.controlItemId),
    ),
  ];
  const [runs, lots, items] = await Promise.all([
    tx
      .select({ r: labQcRuns, by: users.fullName })
      .from(labQcRuns)
      .leftJoin(users, eq(users.id, labQcRuns.recordedBy))
      .where(
        and(
          eq(labQcRuns.hospitalId, hospitalId),
          eq(labQcRuns.deviceId, input.deviceId),
          eq(labQcRuns.conceptId, input.conceptId),
          gte(labQcRuns.runAt, since),
        ),
      )
      .orderBy(asc(labQcRuns.runAt)),
    itemIds.length
      ? tx
          .select()
          .from(labStockLots)
          .where(
            and(eq(labStockLots.hospitalId, hospitalId), inArray(labStockLots.itemId, itemIds)),
          )
      : [],
    tx
      .select({ id: labStockItems.id, name: labStockItems.name })
      .from(labStockItems)
      .where(and(eq(labStockItems.hospitalId, hospitalId), eq(labStockItems.kind, "control"))),
  ]);
  const lotWords = new Map(lots.map((l) => [l.id, l.lot]));
  // QQ-3: progress towards this lab's own target, per level and control lot (accepted runs only).
  const policy = inForce(configs, "qc_policy", "hospital", now)?.payload ?? null;
  const allRuns = plan
    ? await tx
        .select({ decision: labQcRuns.decision, runAt: labQcRuns.runAt, values: labQcRuns.values })
        .from(labQcRuns)
        .where(
          and(eq(labQcRuns.deviceId, input.deviceId), eq(labQcRuns.conceptId, input.conceptId)),
        )
    : [];
  const targets = (config?.payload.targets ?? []).map((t) => {
    const points = allRuns.flatMap((r) =>
      (r.values as RunValue[])
        .filter((v) => v.level === t.level && v.lotId === t.controlLotId)
        .map((v) => ({ decision: r.decision as RunDecision, runAt: r.runAt, value: v.value })),
    );
    return {
      ...t,
      lot: lotWords.get(t.controlLotId) ?? "lot",
      progress: policy ? labTarget(points, policy, TZ) : null,
    };
  });
  return {
    device,
    analyte: analyteName(input.conceptId),
    configId: config?.id ?? null,
    version: config?.version ?? null,
    signedOn: config?.inForceFrom ?? null,
    plan,
    payload: config?.payload ?? null,
    draft: draft ? { id: draft.id, payload: draft.payload } : null,
    policy,
    targets,
    items,
    runs: runs.map(({ r, by }) => ({
      id: r.id,
      at: r.runAt,
      decision: r.decision as RunDecision,
      values: r.values as RunValue[],
      breaks: r.breaks as RuleBreak[],
      planVersion: r.planVersion,
      by: by ?? "Staff",
      firstStep: r.firstStep,
      lots: (r.values as RunValue[]).map((v) => `${lotWords.get(v.lotId) ?? "lot"}`),
    })),
    /** Selectable lots of each level's control material (the run form's choices). */
    lotsByLevel: Object.fromEntries(
      (plan?.levels ?? []).map((l) => [
        l.level,
        lots
          .filter(
            (x) =>
              x.itemId === l.controlItemId &&
              !lotRefusal({ ...x, state: x.state as never }, now, TZ),
          )
          .map((x) => ({ id: x.id, lot: x.lot })),
      ]),
    ) as Record<number, { id: string; lot: string }[]>,
    /** The engine's history for the client preview (QR-3 trims it). */
    history: (
      await tx
        .select({ id: labQcRuns.id, planVersion: labQcRuns.planVersion, values: labQcRuns.values })
        .from(labQcRuns)
        .where(
          and(eq(labQcRuns.deviceId, input.deviceId), eq(labQcRuns.conceptId, input.conceptId)),
        )
        .orderBy(desc(labQcRuns.runAt))
        .limit(60)
    )
      .reverse()
      .map((r) => ({
        id: r.id,
        planVersion: r.planVersion,
        values: (r.values as RunValue[]).map((v) => ({ level: v.level, lotId: v.lotId, z: v.z })),
      })),
  };
}

/* ─── The hold on one order (§5.3, QH-2..QH-5) ─────────────────────────── */

export interface HoldView {
  device: { id: string; model: string };
  components: {
    conceptId: string;
    analyte: string;
    status: QcStatus;
    blocked: boolean;
    failedAt: Date | null;
    rules: string[];
  }[];
  /** QH-5: other in-service analysers with an accepted run today, for an Immediate order only. */
  others: { id: string; model: string }[];
  holdOn: boolean;
}

export async function holdFor(
  tx: EmrTx,
  hospitalId: string,
  input: { orderId: string; concepts: readonly string[]; priority: string | null },
  now: Date,
): Promise<HoldView | null> {
  const profile = await pinnedProfile(tx, input.orderId);
  if (!profile?.deviceId) return null;
  const [device] = await tx
    .select({ id: devices.id, model: devices.model })
    .from(devices)
    .where(and(eq(devices.id, profile.deviceId), eq(devices.hospitalId, hospitalId)));
  if (!device) return null;
  const holdOn = labQcHoldLiveFor(hospitalId);
  const rows = await qcRowsFor(tx, hospitalId, device.id, input.concepts, now);
  const runIds = rows.flatMap((r) => (r.latestRun ? [r.latestRun.id] : []));
  const breaks = runIds.length
    ? await tx
        .select({ id: labQcRuns.id, breaks: labQcRuns.breaks })
        .from(labQcRuns)
        .where(inArray(labQcRuns.id, runIds))
    : [];
  const components = rows.map((r) => {
    const s = qcStatusFor({ plan: r.plan, latestRun: r.latestRun, at: now, timeZone: TZ });
    return {
      conceptId: r.conceptId,
      analyte: analyteName(r.conceptId),
      status: s.status,
      blocked: blocks(
        { status: s.status, held: r.held, holdWhenNotRun: r.plan?.holdWhenNotRun ?? false },
        holdOn,
      ),
      failedAt: s.status === "failed" ? (r.latestRun?.runAt ?? null) : null,
      rules: breakRules(breaks.find((b) => b.id === r.latestRun?.id)?.breaks ?? []),
    };
  });
  const others =
    input.priority === "immediate" && components.some((c) => c.blocked)
      ? await otherAnalysersFor(
          tx,
          hospitalId,
          device.id,
          components.filter((c) => c.blocked).map((c) => c.conceptId),
          now,
        )
      : [];
  return { device, components, others, holdOn };
}

/** QH-5: analysers in service whose latest run for every given component was accepted today. */
export async function otherAnalysersFor(
  tx: EmrTx,
  hospitalId: string,
  deviceId: string,
  concepts: readonly string[],
  now: Date,
) {
  const rows = await tx
    .select({ s: labQcStatus, runAt: labQcRuns.runAt, model: devices.model, state: devices.state })
    .from(labQcStatus)
    .innerJoin(devices, eq(devices.id, labQcStatus.deviceId))
    .leftJoin(labQcRuns, eq(labQcRuns.id, labQcStatus.runId))
    .where(
      and(eq(labQcStatus.hospitalId, hospitalId), inArray(labQcStatus.conceptId, [...concepts])),
    );
  const today = dayOf(now, TZ);
  const statuses = rows.map((r) => ({
    hospitalId: r.s.hospitalId,
    deviceId: r.s.deviceId,
    conceptId: r.s.conceptId,
    // "passed today": a run on another day is not run in the window.
    status: (r.runAt && dayOf(r.runAt, TZ) === today
      ? r.s.status
      : "not_run_in_window") as QcStatus,
    held: r.s.held,
    inService: r.state === "in_use",
  }));
  const ok = concepts
    .map((c) => new Set(otherAnalysers(statuses, { hospitalId, conceptId: c, deviceId })))
    .reduce((a, b) => new Set([...a].filter((x) => b.has(x))));
  return [...ok].map((id) => ({ id, model: rows.find((r) => r.s.deviceId === id)!.model }));
}

/* ─── Quality today (§5.1) ─────────────────────────────────────────────── */

/** Released reports whose current version still holds components for QC (the tile and its list). */
export async function heldReports(tx: EmrTx, hospitalId: string) {
  const r = diagnosticReports;
  return tx
    .select({
      reportId: r.id,
      orderId: r.orderId,
      patientUserId: r.patientUserId,
      held: r.qcHeld,
      at: r.recordedAt,
      test: encounterOrders.text,
    })
    .from(r)
    .innerJoin(encounterOrders, eq(encounterOrders.id, r.orderId))
    .where(
      and(
        eq(r.hospitalId, hospitalId),
        isNotNull(r.qcHeld),
        sql`not exists (select 1 from ${diagnosticReports} n where n.supersedes_id = ${r.id})`,
      ),
    )
    .orderBy(asc(r.recordedAt));
}

/* ─── Kits and stains (§5.4, KQ-*) ─────────────────────────────────────── */

export async function loadKits(tx: EmrTx, hospitalId: string, operatorId: string, now: Date) {
  const [items, configs] = await Promise.all([
    tx
      .select()
      .from(labStockItems)
      .where(
        and(
          eq(labStockItems.hospitalId, hospitalId),
          eq(labStockItems.active, true),
          inArray(labStockItems.kind, ["kit", "stain"]),
        ),
      )
      .orderBy(labStockItems.name),
    loadConfigs(tx, hospitalId),
  ]);
  const ids = items.map((i) => i.id);
  const [lots, checks] = ids.length
    ? await Promise.all([
        tx
          .select()
          .from(labStockLots)
          .where(
            and(
              inArray(labStockLots.itemId, ids),
              inArray(labStockLots.state, [
                "received",
                "in_acceptance",
                "accepted",
                "in_use",
                "quarantined",
              ]),
            ),
          ),
        tx
          .select()
          .from(labControlChecks)
          .where(
            and(eq(labControlChecks.hospitalId, hospitalId), inArray(labControlChecks.itemId, ids)),
          )
          .orderBy(desc(labControlChecks.at)),
      ])
    : [[], []];
  return items.map((i) => {
    const rule = inForce(configs, "kit_qc_rule", i.id, now);
    const draft = configs.find(
      (c) => c.kind === "kit_qc_rule" && c.key === i.id && c.status === "draft",
    );
    const mine = checks.filter((c) => c.itemId === i.id);
    return {
      id: i.id,
      name: i.name,
      kind: i.kind as "kit" | "stain",
      conceptIds: i.conceptIds,
      rule: rule ? (rule.payload as Payload<"kit_qc_rule">) : null,
      draft: draft ? { id: draft.id, payload: draft.payload as Payload<"kit_qc_rule"> } : null,
      lots: lots
        .filter((l) => l.itemId === i.id)
        .map((l) => {
          const due = rule
            ? kitQcDue({
                rule: rule.payload as KitQcRule,
                hospitalId,
                itemId: i.id,
                lot: { id: l.id, lastReceivedAt: l.receivedAt },
                operatorId,
                at: now,
                timeZone: TZ,
                checks: mine.map((c) => ({
                  hospitalId: c.hospitalId,
                  itemId: c.itemId!,
                  lotId: c.lotId!,
                  operatorId: c.operator,
                  outcome: c.outcome as "pass" | "fail",
                  at: c.at,
                })),
                lastMaintenanceAt: null,
              })
            : [];
          const last = mine.find((c) => c.lotId === l.id) ?? null;
          return {
            id: l.id,
            lot: l.lot,
            useBy: l.useBy,
            state: l.state,
            due: due as KitTrigger["kind"][],
            blocks: rule ? kitQcBlocks(rule.payload as KitQcRule, due) : false,
            last: last ? { at: last.at, outcome: last.outcome as "pass" | "fail" } : null,
          };
        }),
    };
  });
}

/* ─── Nonconformities (§5.9) ───────────────────────────────────────────── */

export async function loadNcs(tx: EmrTx, hospitalId: string, now: Date) {
  const [ncs, events] = await Promise.all([
    tx
      .select()
      .from(labNonconformities)
      .where(eq(labNonconformities.hospitalId, hospitalId))
      .orderBy(desc(labNonconformities.openedAt)),
    tx
      .select({ ncId: labNcEvents.ncId, kind: labNcEvents.kind, payload: labNcEvents.payload })
      .from(labNcEvents)
      .where(eq(labNcEvents.hospitalId, hospitalId))
      .orderBy(asc(labNcEvents.at)),
  ]);
  return ncs.map((n) => ({
    ...n,
    overdue: overdueActions(
      events
        .filter((e) => e.ncId === n.id)
        .map((e) => ({ kind: e.kind, ...(e.payload as object) }) as never),
      now,
      TZ,
    ).length,
  }));
}

export async function loadNc(tx: EmrTx, hospitalId: string, ncId: string) {
  const [nc] = await tx
    .select({ n: labNonconformities, owner: users.fullName })
    .from(labNonconformities)
    .leftJoin(users, eq(users.id, labNonconformities.owner))
    .where(and(eq(labNonconformities.id, ncId), eq(labNonconformities.hospitalId, hospitalId)));
  if (!nc) return null;
  const [events, items, run] = await Promise.all([
    tx
      .select({ e: labNcEvents, actor: users.fullName })
      .from(labNcEvents)
      .leftJoin(users, eq(users.id, labNcEvents.actor))
      .where(eq(labNcEvents.ncId, ncId))
      .orderBy(asc(labNcEvents.at)),
    tx
      .select({
        i: labLookbackItems,
        orderId: diagnosticReports.orderId,
        unit: labResultSnapshots.unitDisplay,
      })
      .from(labLookbackItems)
      .innerJoin(diagnosticReports, eq(diagnosticReports.id, labLookbackItems.reportId))
      .leftJoin(
        labResultSnapshots,
        eq(labResultSnapshots.observationId, labLookbackItems.observationId),
      )
      .where(eq(labLookbackItems.ncId, ncId))
      .orderBy(asc(labLookbackItems.releasedAt)),
    nc.n.source === "qc_reject" && nc.n.sourceRef
      ? tx.select().from(labQcRuns).where(eq(labQcRuns.id, nc.n.sourceRef))
      : [],
  ]);
  const r = run[0];
  // LB-1: the window opens at the last accepted run before the rejected one.
  const [from] = r
    ? await tx
        .select({ at: labQcRuns.runAt })
        .from(labQcRuns)
        .where(
          and(
            eq(labQcRuns.deviceId, r.deviceId),
            eq(labQcRuns.conceptId, r.conceptId),
            inArray(labQcRuns.decision, ["accepted", "warning"]),
            lt(labQcRuns.runAt, r.runAt),
          ),
        )
        .orderBy(desc(labQcRuns.runAt))
        .limit(1)
    : [];
  const folded = foldNc(
    events.map((x) => ({ kind: x.e.kind, ...(x.e.payload as object) }) as never),
  );
  const bias = r
    ? biasEstimate(
        r.breaks as RuleBreak[],
        new Map((r.values as RunValue[]).map((v) => [v.level, v.sd])),
      )
    : null;
  const ORDER = ["flag_might_change", "critical_nearby", "unchanged"];
  return {
    nc: nc.n,
    owner: nc.owner,
    actions: folded.actions,
    automatic: events.filter((x) => x.e.actor === null).map((x) => x.e.kind),
    overrides: events
      .filter((x) => x.e.kind === "note" && (x.e.payload as { override?: unknown }).override)
      .map((x) => ({ at: x.e.at, by: x.actor ?? "Staff" })),
    run: r
      ? {
          id: r.id,
          at: r.runAt,
          from: from?.at ?? null,
          rules: breakRules(r.breaks),
          firstStep: r.firstStep,
        }
      : null,
    bias,
    unit: items[0]?.unit ?? null,
    lookBack: items
      .map((x) => ({ ...x.i, orderId: x.orderId }))
      .sort((a, b) => ORDER.indexOf(a.sort) - ORDER.indexOf(b.sort)),
    progress: lookBackProgress(items.map((x) => ({ decision: x.i.decision as never }))),
    passingRun: nc.n.source === "qc_reject" ? await passingRunAfterReject(tx, nc.n) : null,
  };
}
