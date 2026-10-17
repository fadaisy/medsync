import "server-only";

import type { ActionKind, AlertEntry, AlertState } from "./lab-alerts";
import type { IpcScope } from "./scope";
import { sql } from "drizzle-orm";

import { db } from "@/db";
import { identitiesFor } from "@/lib/emr/read/results";
import { rowsOf } from "@/lib/exchange/store";
import { activeFlags, alertState, epiWeekStart, idsrCounts, isClosed } from "./lab-alerts";

/**
 * The infection prevention workspace, read (Lab Phase 5 §5.10–§5.12; IC-4, IC-5, IC-10, IC-13). The minimum dataset
 * only (Law 8): two identifiers, sex and age, place, admission date, condition, specimen and release times, the
 * precaution. No result value, no other result, no chart. Names come through the audited reveal.
 */

export interface AlertRow {
  id: string;
  patientUserId: string;
  name: string;
  mrn: string;
  ageSex: string;
  ward: string | null;
  bed: string | null;
  admittedAt: Date | null;
  condition: string;
  precaution: string;
  stopLine: string;
  route: string;
  idsrItem: string | null;
  screening: boolean;
  trigger: "result" | "referral" | "readmission";
  episodeKey: string;
  specimenAt: Date | null;
  releasedAt: Date | null;
  createdAt: Date;
  restricted: boolean;
  state: AlertState;
  closed: boolean;
  contacts: number | null;
  referralState: string | null;
}

export async function loadAlerts(scope: IpcScope, o: { since?: Date } = {}): Promise<AlertRow[]> {
  const rows = rowsOf<{
    id: string;
    patient: string;
    ward: string | null;
    bed: string | null;
    admitted: Date | null;
    key: string;
    payload: AlertEntry;
    route: string;
    idsr: string | null;
    screening: boolean;
    trigger: AlertRow["trigger"];
    episode: string;
    specimen: Date | null;
    released: Date | null;
    created: Date;
    restricted: string | null;
    referral: string | null;
    ward_id: string | null;
  }>(
    await db.execute(sql`SELECT a.id, a.patient_user_id AS patient, w.name AS ward, b.label AS bed,
        a.admitted_at AS admitted, a.entry_key AS key, c.payload, a.route, a.idsr_item AS idsr, a.screening,
        a.trigger, a.episode_key AS episode, a.specimen_at AS specimen, a.released_at AS released,
        a.created_at AS created, a.restricted_class AS restricted, a.ward_id,
        (SELECT r.state FROM lab_referrals r WHERE r.id = a.referral_id) AS referral
      FROM ipc_alerts a JOIN lab_signed_configs c ON c.id = a.entry_config_id
      LEFT JOIN hospital_wards w ON w.id = a.ward_id
      LEFT JOIN hospital_beds b ON b.id = a.bed_id
     WHERE a.hospital_id = ${scope.hospitalId}
       AND a.created_at >= ${(o.since ?? new Date(Date.now() - 90 * 86_400_000)).toISOString()}::timestamptz
     ORDER BY a.created_at DESC LIMIT 500`),
  ).filter(
    (r) =>
      scope.all ||
      (r.ward_id !== null && scope.wardIds.includes(r.ward_id)) ||
      (scope.roles.includes("focal") && (r.route === "notify_now" || r.route === "weekly_item")),
  );
  if (!rows.length) return [];
  const actions = rowsOf<{
    alert: string;
    kind: ActionKind;
    at: Date;
    detail: Record<string, unknown>;
  }>(
    await db.execute(sql`SELECT alert_id AS alert, kind, at, detail FROM ipc_alert_actions
      WHERE alert_id IN (${sql.join(
        rows.map((r) => sql`${r.id}::uuid`),
        sql`, `,
      )})`),
  );
  const ids = await identitiesFor(
    { userId: scope.userId, hospitalId: scope.hospitalId },
    rows.map((r) => r.patient),
    "ipc",
  );
  return rows.map((r) => {
    const acts = actions
      .filter((x) => x.alert === r.id)
      .map((x) => ({ kind: x.kind, at: new Date(x.at), detail: x.detail }));
    const state = alertState(r.payload, acts);
    const contacts = acts.filter((x) => x.kind === "contacts_listed").at(-1)?.detail?.count;
    const who = ids.get(r.patient);
    return {
      id: r.id,
      patientUserId: r.patient,
      name: who?.name ?? "Name withheld",
      mrn: who?.mrn ?? "",
      ageSex: who?.ageSex ?? "",
      ward: r.ward,
      bed: r.bed,
      admittedAt: r.admitted ? new Date(r.admitted) : null,
      condition: r.payload.condition,
      precaution: r.payload.precaution.type.replace(/_/g, " "),
      stopLine: r.payload.precaution.stopLine,
      route: r.route,
      idsrItem: r.idsr,
      screening: r.screening,
      trigger: r.trigger,
      episodeKey: r.episode,
      specimenAt: r.specimen ? new Date(r.specimen) : null,
      releasedAt: r.released ? new Date(r.released) : null,
      createdAt: new Date(r.created),
      restricted: r.restricted === "tb",
      state,
      closed: isClosed(state),
      contacts: typeof contacts === "number" ? contacts : null,
      referralState: r.referral,
    };
  });
}

/** IC-8: patients with a flag in force at this hospital. */
export async function flaggedPatients(scope: IpcScope) {
  const ev = rowsOf<{
    patient: string;
    key: string;
    condition: string;
    precaution: string;
    kind: "set" | "clear";
    at: Date;
  }>(
    await db.execute(sql`SELECT patient_user_id AS patient, entry_key AS key, condition, precaution, kind, at
      FROM patient_ipc_flag_events WHERE hospital_id = ${scope.hospitalId} ORDER BY id`),
  );
  const byPatient = new Map<string, typeof ev>();
  for (const e of ev) byPatient.set(e.patient, [...(byPatient.get(e.patient) ?? []), e]);
  const out: { patientUserId: string; flags: ReturnType<typeof activeFlags> }[] = [];
  for (const [p, list] of byPatient) {
    const flags = activeFlags(
      list.map((e) => ({
        entryKey: e.key,
        condition: e.condition,
        precaution: e.precaution,
        kind: e.kind,
        at: new Date(e.at),
      })),
    );
    if (flags.length) out.push({ patientUserId: p, flags });
  }
  const ids = await identitiesFor(
    { userId: scope.userId, hospitalId: scope.hospitalId },
    out.map((o) => o.patientUserId),
    "ipc",
  );
  return out.map((o) => ({
    ...o,
    name: ids.get(o.patientUserId)?.name ?? "Name withheld",
    mrn: ids.get(o.patientUserId)?.mrn ?? "",
  }));
}

/** IC-8 elsewhere: the flags in force for these patients (ward lists, registration, triage, the lab). */
export async function ipcFlagsFor(hospitalId: string, patientIds: readonly string[]) {
  if (!patientIds.length) return new Map<string, string[]>();
  const ev = rowsOf<{
    patient: string;
    key: string;
    condition: string;
    precaution: string;
    kind: "set" | "clear";
    at: Date;
  }>(
    await db.execute(sql`SELECT patient_user_id AS patient, entry_key AS key, condition, precaution, kind, at
      FROM patient_ipc_flag_events WHERE hospital_id = ${hospitalId}
        AND patient_user_id IN (${sql.join(
          patientIds.map((p) => sql`${p}::uuid`),
          sql`, `,
        )}) ORDER BY id`),
  );
  const out = new Map<string, string[]>();
  for (const p of new Set(ev.map((e) => e.patient))) {
    const flags = activeFlags(
      ev
        .filter((e) => e.patient === p)
        .map((e) => ({
          entryKey: e.key,
          condition: e.condition,
          precaution: e.precaution,
          kind: e.kind,
          at: new Date(e.at),
        })),
    );
    if (flags.length)
      out.set(
        p,
        flags.map((f) => `${f.condition} · ${f.precaution.replace(/_/g, " ")}`),
      );
  }
  return out;
}

/** §5.12, IC-10: this epi-week's lab-confirmed counts by IDSR item, and the tiles. */
export async function surveillance(scope: IpcScope, now: Date) {
  const alerts = await loadAlerts(scope, { since: new Date(now.getTime() - 60 * 86_400_000) });
  const week = epiWeekStart(now);
  const inWeek = alerts.filter((a) => epiWeekStart(a.createdAt) === week);
  const toPrecaution = alerts
    .filter((a) => a.state.state === "precautions_started" && a.releasedAt)
    .map((a) => ((a.state as { at: Date }).at.getTime() - a.releasedAt!.getTime()) / 60_000)
    .sort((x, y) => x - y);
  return {
    week,
    open: inWeek.filter((a) => !a.closed).length,
    closed: inWeek.filter((a) => a.closed).length,
    medianMinutes: toPrecaution.length ? toPrecaution[Math.floor(toPrecaution.length / 2)]! : null,
    withTime: toPrecaution.length,
    readmitted: alerts.filter((a) => a.trigger === "readmission").length,
    counts: idsrCounts(
      alerts.map((a) => ({
        idsrItem: a.idsrItem,
        route: a.route as never,
        releasedAt: a.releasedAt,
        createdAt: a.createdAt,
      })),
      week,
    ),
  };
}

/** §5.11: the alert list entries with their signatures and the focal person's check. */
export async function alertList(hospitalId: string) {
  return rowsOf<{
    id: string;
    key: string;
    version: number;
    status: string;
    payload: AlertEntry;
    lead: string | null;
    second: string | null;
    authored: string;
    checked: Date | null;
  }>(
    await db.execute(sql`SELECT c.id, c.key, c.version, c.status, c.payload, c.lead_signed_by AS lead,
        c.cso_signed_by AS second, c.authored_by AS authored,
        (SELECT max(k.checked_at) FROM ipc_list_checks k WHERE k.config_id = c.id) AS checked
      FROM lab_signed_configs c
     WHERE c.hospital_id = ${hospitalId} AND c.kind = 'ipc_alert_entry' AND c.status <> 'superseded'
     ORDER BY c.key, c.version DESC`),
  );
}

/** The menu's test codes (A14: an entry whose test is not here never fires). */
export async function menuTestCodes(hospitalId: string): Promise<string[]> {
  return rowsOf<{ code: string }>(
    await db.execute(sql`SELECT DISTINCT t.code FROM lab_test_services s JOIN test_catalogue t ON t.code = s.test_code
      WHERE s.hospital_id = ${hospitalId}
      UNION SELECT t.code FROM test_catalogue t WHERE t.kind = 'lab' AND t.hospital_id IS NULL AND t.active`),
  ).map((r) => r.code);
}
