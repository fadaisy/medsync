import "server-only";

import type { ActionKind, AlertEntry, SignedEntry } from "./lab-alerts";
import type { EmrTx } from "@/lib/emr/db";
import { and, eq, sql } from "drizzle-orm";

import { ipcAlertActions, ipcAlerts, patientIpcFlagEvents } from "@/db/schema";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/exchange/store";
import { loadConfigs } from "@/lib/lab/catalogue-v2";
import {
  alertState,
  closeErrors,
  correctionCloses,
  escalationDue,
  isClosed,
  matchReferral,
  matchResult,
} from "./lab-alerts";

/**
 * The infection prevention feed on the database (Lab Phase 5 Step 5; IC-2..IC-9). Alerts are raised in the same
 * transaction as the release or the outbreak referral that triggers them (within the minute, S11), one per patient
 * per condition per episode; their state is their append-only actions; the patient flag is append-only events. The
 * alert carries the minimum dataset's references only (place, times), never a value (Law 8).
 */

type Actor = { userId: string; hospitalId: string };

export async function signedEntries(
  tx: EmrTx,
  hospitalId: string,
  now: Date,
): Promise<SignedEntry[]> {
  return (await loadConfigs(tx, hospitalId))
    .filter(
      (c) =>
        c.kind === "ipc_alert_entry" &&
        c.hospitalId === hospitalId &&
        c.status === "signed" &&
        c.inForceFrom !== null &&
        c.inForceFrom <= now,
    )
    .map((c) => ({ key: c.key, configId: c.id, entry: c.payload as AlertEntry }));
}

/** IC-3, IC-5: the episode and the place — the open admission (ward, bed) or the order's visit. */
async function episodeOf(
  tx: EmrTx,
  hospitalId: string,
  patientUserId: string,
  encounterId: string | null,
) {
  const [adm] = rowsOf<{ id: string; ward: string | null; bed: string | null; at: Date }>(
    await tx.execute(sql`SELECT a.id, a.ward_id AS ward,
        (SELECT b.bed_id FROM bed_assignments b WHERE b.patient_user_id = a.patient_user_id AND b.ended_at IS NULL
          ORDER BY b.started_at DESC LIMIT 1) AS bed,
        coalesce(a.arrived_at, a.decided_at) AS at
      FROM admissions a
     WHERE a.hospital_id = ${hospitalId} AND a.patient_user_id = ${patientUserId} AND a.status <> 'cancelled'
     ORDER BY a.created_at DESC LIMIT 1`),
  );
  if (adm)
    return { key: `admission:${adm.id}`, wardId: adm.ward, bedId: adm.bed, admittedAt: adm.at };
  return {
    key: encounterId ? `encounter:${encounterId}` : `patient:${patientUserId}`,
    wardId: null,
    bedId: null,
    admittedAt: null,
  };
}

async function insertAlert(
  tx: EmrTx,
  values: typeof ipcAlerts.$inferInsert,
): Promise<string | null> {
  const [a] = await tx
    .insert(ipcAlerts)
    .values(values)
    .onConflictDoNothing()
    .returning({ id: ipcAlerts.id });
  return a?.id ?? null;
}

/**
 * IC-2: a released laboratory result (typed, bedside, referred or, later, interfaced). New matches raise an alert,
 * a later matching result in the same episode attaches to it, and an amendment that removes the triggering answer
 * closes the alerts it raised with "Result corrected" (S19).
 */
export async function raiseIpcAlerts(
  tx: EmrTx,
  r: {
    hospitalId: string;
    patientUserId: string;
    reportId: string;
    logicalId: string;
    encounterId: string | null;
    testCode: string | null;
    restrictedClass: string | null;
    components: { concept: string; answer: string | null }[];
    specimenAt: Date | null;
    releasedAt: Date;
    amended: boolean;
  },
): Promise<string[]> {
  if (!r.testCode) return [];
  const list = await signedEntries(tx, r.hospitalId, r.releasedAt);
  if (!list.length) return [];
  const result = { testCode: r.testCode, components: r.components };
  if (r.amended) {
    const earlier = rowsOf<{ id: string; key: string }>(
      await tx.execute(sql`SELECT a.id, a.entry_key AS key FROM ipc_alerts a JOIN diagnostic_reports d ON d.id = a.report_id
        WHERE d.logical_id = ${r.logicalId} AND a.hospital_id = ${r.hospitalId}`),
    );
    for (const e of earlier) {
      const entry = list.find((l) => l.key === e.key)?.entry;
      if (entry && correctionCloses(entry, result))
        await tx.insert(ipcAlertActions).values({
          hospitalId: r.hospitalId,
          alertId: e.id,
          kind: "result_corrected",
          detail: {},
          at: r.releasedAt,
        });
    }
  }
  const raised: string[] = [];
  const ep = await episodeOf(tx, r.hospitalId, r.patientUserId, r.encounterId);
  for (const m of matchResult(list, result)) {
    const id = await insertAlert(tx, {
      hospitalId: r.hospitalId,
      patientUserId: r.patientUserId,
      entryKey: m.key,
      entryConfigId: m.configId,
      trigger: "result",
      episodeKey: ep.key,
      reportId: r.reportId,
      wardId: ep.wardId,
      bedId: ep.bedId,
      admittedAt: ep.admittedAt,
      specimenAt: r.specimenAt,
      releasedAt: r.releasedAt,
      route: m.entry.route.kind,
      idsrItem: m.entry.route.idsrItem,
      screening: m.entry.confirmationNeeded,
      restrictedClass: r.restrictedClass === "tb" ? "tb" : null,
    });
    if (id) {
      raised.push(id);
      continue;
    }
    // IC-3: the episode already has this alert; a later result of another order attaches to it.
    const [existing] = await tx
      .select({ id: ipcAlerts.id, reportId: ipcAlerts.reportId })
      .from(ipcAlerts)
      .where(
        and(
          eq(ipcAlerts.hospitalId, r.hospitalId),
          eq(ipcAlerts.patientUserId, r.patientUserId),
          eq(ipcAlerts.entryKey, m.key),
          eq(ipcAlerts.episodeKey, ep.key),
        ),
      );
    if (existing && existing.reportId !== r.reportId) {
      const [same] = rowsOf<{ same: boolean }>(
        await tx.execute(
          sql`SELECT d.logical_id = ${r.logicalId} AS same FROM diagnostic_reports d WHERE d.id = ${existing.reportId}`,
        ),
      );
      if (!same?.same)
        await tx.insert(ipcAlertActions).values({
          hospitalId: r.hospitalId,
          alertId: existing.id,
          kind: "attached",
          detail: { reportId: r.reportId },
          at: r.releasedAt,
        });
    }
  }
  return raised;
}

/** IC-2, S18: an outbreak referral (Phase 4 RF-7) raises its entries at referral, before any result. */
export async function raiseForOutbreakReferral(
  tx: EmrTx,
  r: {
    hospitalId: string;
    patientUserId: string;
    referralId: string;
    encounterId: string | null;
    at: Date;
  },
): Promise<string[]> {
  const list = await signedEntries(tx, r.hospitalId, r.at);
  const ep = await episodeOf(tx, r.hospitalId, r.patientUserId, r.encounterId);
  const raised: string[] = [];
  for (const m of matchReferral(list)) {
    const id = await insertAlert(tx, {
      hospitalId: r.hospitalId,
      patientUserId: r.patientUserId,
      entryKey: m.key,
      entryConfigId: m.configId,
      trigger: "referral",
      episodeKey: ep.key,
      referralId: r.referralId,
      wardId: ep.wardId,
      bedId: ep.bedId,
      admittedAt: ep.admittedAt,
      route: m.entry.route.kind,
      idsrItem: m.entry.route.idsrItem,
      screening: m.entry.confirmationNeeded,
    });
    if (id) raised.push(id);
  }
  return raised;
}

/** IC-6, IC-8, IC-14: an IPC action; precautions started sets the patient flag; viewing a `tb` alert is recorded. */
export async function recordIpcAction(
  tx: EmrTx,
  a: Actor,
  i: { alertId: string; kind: ActionKind; detail: Record<string, unknown>; clientKey: string },
  now: Date,
): Promise<string> {
  const [alert] = await tx
    .select()
    .from(ipcAlerts)
    .where(and(eq(ipcAlerts.id, i.alertId), eq(ipcAlerts.hospitalId, a.hospitalId)));
  if (!alert) throw new EmrWriteError("not_found", "That alert was not found.");
  if (["escalated", "result_corrected", "attached"].includes(i.kind))
    throw new EmrWriteError("invalid", "MedSync records that itself.");
  const errors = closeErrors(i.kind, i.detail);
  if (errors.length) throw new EmrWriteError("invalid", "Fill in what was done, where, or why.");
  const [row] = await tx
    .insert(ipcAlertActions)
    .values({
      hospitalId: a.hospitalId,
      alertId: alert.id,
      kind: i.kind,
      detail: i.detail,
      byUser: a.userId,
      at: now,
      clientKey: i.clientKey,
    })
    .onConflictDoNothing()
    .returning({ id: ipcAlertActions.id });
  if (i.kind === "precautions_started") {
    const entry = (await signedEntries(tx, a.hospitalId, now)).find(
      (e) => e.key === alert.entryKey,
    )?.entry;
    await tx.insert(patientIpcFlagEvents).values({
      hospitalId: a.hospitalId,
      patientUserId: alert.patientUserId,
      entryKey: alert.entryKey,
      condition: entry?.condition ?? alert.entryKey,
      precaution: String(i.detail.type ?? entry?.precaution.type ?? "standard"),
      kind: "set",
      alertId: alert.id,
      byUser: a.userId,
      at: now,
    });
  }
  return String(row?.id ?? "replayed");
}

/** IC-8: only IPC clears a flag, with a reason; the history stays. */
export async function clearPatientFlag(
  tx: EmrTx,
  a: Actor,
  i: { patientUserId: string; entryKey: string; reason: string },
  now: Date,
) {
  const [last] = await tx
    .select()
    .from(patientIpcFlagEvents)
    .where(
      and(
        eq(patientIpcFlagEvents.patientUserId, i.patientUserId),
        eq(patientIpcFlagEvents.entryKey, i.entryKey),
        eq(patientIpcFlagEvents.hospitalId, a.hospitalId),
      ),
    )
    .orderBy(sql`${patientIpcFlagEvents.id} DESC`)
    .limit(1);
  if (!last || last.kind !== "set")
    throw new EmrWriteError("conflict", "There is no flag to clear.");
  await tx.insert(patientIpcFlagEvents).values({
    hospitalId: last.hospitalId,
    patientUserId: last.patientUserId,
    entryKey: last.entryKey,
    condition: last.condition,
    precaution: last.precaution,
    kind: "clear",
    reason: i.reason,
    byUser: a.userId,
    at: now,
    alertId: null,
  });
}

/** IC-7: alerts with no action within the operational window escalate once. Returns how many. */
export async function escalateIpcAlerts(tx: EmrTx, now: Date): Promise<number> {
  const open = rowsOf<{ id: string; hospital: string; created: Date }>(
    await tx.execute(sql`SELECT a.id, a.hospital_id AS hospital, a.created_at AS created FROM ipc_alerts a
      WHERE NOT EXISTS (SELECT 1 FROM ipc_alert_actions x WHERE x.alert_id = a.id AND x.kind NOT IN ('viewed','attached'))
        AND a.created_at > ${new Date(now.getTime() - 14 * 86_400_000).toISOString()}::timestamptz`),
  );
  let n = 0;
  for (const a of open)
    if (escalationDue(new Date(a.created), [], now)) {
      await tx
        .insert(ipcAlertActions)
        .values({ hospitalId: a.hospital, alertId: a.id, kind: "escalated", detail: {}, at: now });
      n++;
    }
  return n;
}

/** The alert's state for lists (IC-6), from its actions. */
export async function stateOf(
  tx: EmrTx,
  alertId: string,
  entry: Pick<AlertEntry, "ipcAlert" | "route">,
) {
  const acts = await tx.select().from(ipcAlertActions).where(eq(ipcAlertActions.alertId, alertId));
  const s = alertState(
    entry,
    acts.map((x) => ({
      kind: x.kind as ActionKind,
      at: x.at,
      detail: x.detail as Record<string, unknown>,
    })),
  );
  return { state: s, closed: isClosed(s) };
}
