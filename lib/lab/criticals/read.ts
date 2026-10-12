import "server-only";

import type { Level, SubState } from "./alerts";
import type { ResponseTimes } from "./escalation";
import type { LadderResult } from "./recipients";
import type { EmrDb } from "@/lib/emr/db";
import { and, asc, desc, eq, gte, inArray, or, sql } from "drizzle-orm";

import { db as appDb } from "@/db";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { diagnosticReports } from "@/db/schema/emr";
import { encounterOrders } from "@/db/schema/encounter";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { criticalAlertEvents, criticalAlerts, criticalMarks } from "@/db/schema/lab-safety";
import { clinicalObservations } from "@/db/schema/nurse-workspace";
import { cadres } from "@/db/schema/reference-data";
import { encounters } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { unitWords } from "@/lib/emr/unit-words";
import { decrypt } from "@/lib/encryption";
import { conceptDef } from "@/lib/facts/project/shared";
import { logger } from "@/lib/logger";
import { startOfLocalDay } from "@/supabase/functions/_shared/slots";
import { dueAtFor } from "./escalation";
import { resolveFrom } from "./recipients";
import {
  deliverAfterCommit,
  lastHeartbeat,
  loadLadder,
  runEscalations,
  settingsOf,
  signedTimes,
} from "./store";

/**
 * Lab Phase 1 reads for the criticals screens. Hospital scope is in every query; the pages decide who
 * may see what (the lab sees its hospital's alerts; a clinician sees an alert they received or whose
 * patient they may open, D-LAB1-29) and reveal identities once per page (identitiesFor). Every read
 * of alerts first runs the lazy escalation path for the hospital (ES-3), which never breaks the read.
 */

const defaultDb = () => appDb as unknown as EmrDb;

/** ES-3: the lazy path. Escalates what is due, then delivers; any failure is logged, never thrown. */
export async function escalateLazily(
  hospitalId: string,
  now = new Date(),
  database: EmrDb = defaultDb(),
): Promise<void> {
  try {
    const { jobs } = await runEscalations(database, { now, source: "lazy", hospitalId });
    await deliverAfterCommit(database, jobs);
  } catch (e) {
    logger.error("lab.criticals.lazy_escalation_failed", {
      message: e instanceof Error ? e.message : String(e),
    });
  }
}

export interface MarkedValue {
  conceptId: string;
  /** A correction: the value it replaces. */
  was?: string;
  display: string;
  value: string;
  unit: string | null;
  direction: "low" | "high" | null;
  check: "repeated" | "checked_not_repeated" | "could_not_check";
  repeatValue: string | null;
  couldNotCheck: string | null;
  source: "manual" | "auto";
}

export interface AlertSummary {
  id: string;
  patientUserId: string;
  reportId: string;
  orderId: string | null;
  test: string;
  place: string | null;
  state: "open" | "acknowledged";
  subState: SubState | null;
  level: Level;
  sentAt: Date;
  dueAt: Date | null;
  escalatedAt: Date | null;
  /** The level the last escalation came from: who had it and did not acknowledge. */
  escalatedFrom: Level | null;
  acknowledgedAt: Date | null;
  acknowledgedBy: string | null;
  acknowledgedVia: "app" | "phone" | null;
  acknowledgedByCadre: string | null;
  loggedByCadre: string | null;
  markedByCadre: string | null;
  correctionOf: string | null;
  restricted: boolean;
  deliveryFailed: boolean;
  marked: MarkedValue[];
}

type AlertRow = typeof criticalAlerts.$inferSelect;

/** Turns alert rows into summaries in a fixed number of round trips. */
async function summarise(
  database: EmrDb,
  hospitalId: string,
  rows: readonly AlertRow[],
): Promise<AlertSummary[]> {
  if (rows.length === 0) return [];
  // CA-10: a correction alert carries no marks of its own. Walk back to the alert it corrects (and
  // that one's root) for the marked components, and to its report for the value it replaces.
  const chain = new Map<string, AlertRow>();
  let frontier = rows.map((r) => r.correctionOf).filter((x): x is string => !!x);
  while (frontier.length > 0) {
    const got = await database
      .select()
      .from(criticalAlerts)
      .where(inArray(criticalAlerts.id, frontier));
    for (const g of got) chain.set(g.id, g);
    frontier = got.map((g) => g.correctionOf).filter((x): x is string => !!x && !chain.has(x));
  }
  const rootOf = (r: AlertRow): AlertRow => {
    let a = r;
    while (a.correctionOf && chain.has(a.correctionOf)) a = chain.get(a.correctionOf)!;
    return a;
  };
  const ids = rows.map((r) => r.id);
  const reportIds = [...rows.map((r) => r.reportId), ...[...chain.values()].map((c) => c.reportId)];
  const orderIds = rows.map((r) => r.orderId).filter((o): o is string => !!o);
  const [marks, observations, orders, events] = await Promise.all([
    database
      .select()
      .from(criticalMarks)
      .where(inArray(criticalMarks.alertId, [...ids, ...chain.keys()])),
    database
      .select({
        reportId: clinicalObservations.reportId,
        conceptId: clinicalObservations.conceptId,
        valueNum: clinicalObservations.valueNum,
        comparator: clinicalObservations.valueComparator,
        unit: clinicalObservations.valueUnit,
        code: clinicalObservations.valueCode,
        context: clinicalObservations.context,
      })
      .from(clinicalObservations)
      .where(inArray(clinicalObservations.reportId, reportIds)),
    orderIds.length
      ? database
          .select({
            id: encounterOrders.id,
            text: encounterOrders.text,
            place: hospitalDepartments.name,
          })
          .from(encounterOrders)
          .leftJoin(encounters, eq(encounters.id, encounterOrders.encounterId))
          .leftJoin(hospitalDepartments, eq(hospitalDepartments.id, encounters.departmentId))
          .where(inArray(encounterOrders.id, orderIds))
      : Promise.resolve([]),
    database
      .select({
        alertId: criticalAlertEvents.alertId,
        kind: criticalAlertEvents.kind,
        channel: criticalAlertEvents.channel,
        outcome: criticalAlertEvents.outcome,
        at: criticalAlertEvents.at,
        level: criticalAlertEvents.level,
        data: criticalAlertEvents.data,
      })
      .from(criticalAlertEvents)
      .where(
        and(
          inArray(criticalAlertEvents.alertId, ids),
          inArray(criticalAlertEvents.kind, ["escalated", "notified"]),
        ),
      )
      .orderBy(asc(criticalAlertEvents.at)),
  ]);
  const people = [
    ...new Set(
      rows
        .flatMap((r) => [r.acknowledgedBy, r.loggedBy, r.createdBy])
        .filter((u): u is string => !!u),
    ),
  ];
  const cadreOf = await cadreNames(database, hospitalId, people);
  const order = new Map(orders.map((o) => [o.id, o]));
  return rows.map((r) => {
    const obs = observations.filter((o) => o.reportId === r.reportId);
    const evs = events.filter((e) => e.alertId === r.id);
    const appAtLevel = evs.filter(
      (e) => e.kind === "notified" && e.channel === "app" && e.level === r.level,
    );
    const failed = appAtLevel.filter((e) => e.outcome === "failed").length;
    const queued = appAtLevel.filter((e) => e.outcome === "queued").length;
    return {
      id: r.id,
      patientUserId: r.patientUserId,
      reportId: r.reportId,
      orderId: r.orderId,
      test: (r.orderId && order.get(r.orderId)?.text) || "Result",
      place: (r.orderId && order.get(r.orderId)?.place) || null,
      state: r.state as AlertSummary["state"],
      subState: r.subState as SubState | null,
      level: r.level as Level,
      sentAt: r.sentAt,
      dueAt: r.dueAt,
      escalatedAt: [...evs].reverse().find((e) => e.kind === "escalated")?.at ?? null,
      escalatedFrom:
        ((([...evs].reverse().find((e) => e.kind === "escalated")?.data ?? {}) as { from?: number })
          .from as Level | undefined) ?? null,
      acknowledgedAt: r.acknowledgedAt,
      acknowledgedBy: r.acknowledgedBy,
      acknowledgedVia: r.acknowledgedVia as AlertSummary["acknowledgedVia"],
      acknowledgedByCadre: r.acknowledgedBy ? (cadreOf.get(r.acknowledgedBy) ?? null) : null,
      loggedByCadre: r.loggedBy ? (cadreOf.get(r.loggedBy) ?? null) : null,
      markedByCadre: cadreOf.get(r.createdBy) ?? null,
      correctionOf: r.correctionOf,
      restricted: r.restricted,
      // CA-3, Law 4: every in-app delivery at this level failed after commit.
      deliveryFailed: queued > 0 && failed >= queued,
      marked: marks
        .filter((m) => m.alertId === rootOf(r).id)
        .map((m) => {
          const o = obs.find((x) => x.conceptId === m.conceptId);
          const before = r.correctionOf
            ? observations.find(
                (x) =>
                  x.reportId === chain.get(r.correctionOf!)?.reportId &&
                  x.conceptId === m.conceptId,
              )
            : undefined;
          return {
            ...(before ? { was: valueWords(before) } : {}),
            conceptId: m.conceptId,
            display: conceptDef(m.conceptId)?.display ?? m.conceptId,
            value: o ? valueWords(o) : "",
            unit: unitWords(o?.unit) ?? o?.unit ?? null,
            direction: (m.direction as "low" | "high" | null) ?? directionOf(o),
            check: m.checkKind as MarkedValue["check"],
            repeatValue: m.repeatValue,
            couldNotCheck: m.couldNotCheckReason,
            source: m.source as "manual" | "auto",
          };
        }),
    };
  });
}

function valueWords(o: {
  valueNum: string | null;
  comparator: string | null;
  code: string | null;
}): string {
  if (o.valueNum !== null)
    return `${o.comparator && o.comparator !== "=" ? o.comparator : ""}${Number(o.valueNum)}`;
  return o.code ?? "";
}

/** A hand mark carries no direction: the lab's flag says it, or the typed range does. */
function directionOf(
  o: { valueNum: string | null; context: unknown } | undefined,
): "low" | "high" | null {
  if (!o) return null;
  const ctx = (o.context ?? {}) as {
    labInterpretation?: string;
    referenceRange?: { low?: number; high?: number };
  };
  if (ctx.labInterpretation === "L" || ctx.labInterpretation === "LL") return "low";
  if (ctx.labInterpretation === "H" || ctx.labInterpretation === "HH") return "high";
  const v = o.valueNum === null ? null : Number(o.valueNum);
  if (v === null) return null;
  if (ctx.referenceRange?.low !== undefined && v < ctx.referenceRange.low) return "low";
  if (ctx.referenceRange?.high !== undefined && v > ctx.referenceRange.high) return "high";
  return null;
}

async function cadreNames(database: EmrDb, hospitalId: string, userIds: readonly string[]) {
  if (userIds.length === 0) return new Map<string, string>();
  const rows = await database
    .select({ userId: staffAffiliations.userId, cadre: cadres.name })
    .from(staffAffiliations)
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.userId, [...userIds]),
      ),
    );
  return new Map(rows.map((r) => [r.userId, r.cadre]));
}

/* ─── The lab's list (§5.3) ───────────────────────────────────────────── */

export interface LabCriticalsData {
  open: AlertSummary[];
  acknowledgedToday: AlertSummary[];
  times: ResponseTimes | null;
  heartbeatAt: Date | null;
  smsLive: boolean;
  labPhone: string | null;
}

/** Open alerts first, longest open first; then today's acknowledged (they leave at local midnight). */
export async function loadLabCriticals(
  hospitalId: string,
  now: Date,
  timeZone: string,
  database: EmrDb = defaultDb(),
): Promise<LabCriticalsData> {
  await escalateLazily(hospitalId, now, database);
  const since = startOfLocalDay(now, timeZone);
  const rows = await database
    .select()
    .from(criticalAlerts)
    .where(
      and(
        eq(criticalAlerts.hospitalId, hospitalId),
        or(eq(criticalAlerts.state, "open"), gte(criticalAlerts.acknowledgedAt, since)),
      ),
    )
    .orderBy(asc(criticalAlerts.sentAt));
  const [summaries, extra] = await Promise.all([
    summarise(database, hospitalId, rows),
    database.transaction(async (tx) => ({
      times: await signedTimes(tx, hospitalId),
      heartbeatAt: await lastHeartbeat(tx),
      settings: await settingsOf(tx, hospitalId),
    })),
  ]);
  return {
    open: summaries.filter((s) => s.state === "open"),
    acknowledgedToday: summaries
      .filter((s) => s.state === "acknowledged")
      .sort((a, b) => +b.acknowledgedAt! - +a.acknowledgedAt!),
    times: extra.times,
    heartbeatAt: extra.heartbeatAt,
    smsLive: extra.settings.smsLive,
    labPhone: extra.settings.labPhone,
  };
}

export async function countOpenCriticals(
  hospitalId: string,
  database: EmrDb = defaultDb(),
): Promise<number> {
  const [r] = await database
    .select({ n: sql<number>`count(*)::int` })
    .from(criticalAlerts)
    .where(and(eq(criticalAlerts.hospitalId, hospitalId), eq(criticalAlerts.state, "open")));
  return r?.n ?? 0;
}

/* ─── One alert, with its timeline ────────────────────────────────────── */

export interface TimelineEntry {
  id: string;
  kind: string;
  at: Date;
  level: number | null;
  actor: string | null;
  recipient: string | null;
  channel: string | null;
  outcome: string | null;
  detail: Record<string, unknown>;
}

export interface ReportLine {
  conceptId: string;
  display: string;
  value: string;
  unit: string | null;
  range: string | null;
  flag: string | null;
}

export interface AlertDetail {
  alert: AlertSummary;
  /** The whole report, with the lab's ranges and flags (§5.4). */
  report: ReportLine[];
  timeline: TimelineEntry[];
  noteFromLab: string | null;
  ackNote: string | null;
  recipients: string[];
}

/** People on the timeline by cadre and place, never by phone (§12). */
export async function loadAlertDetail(
  hospitalId: string,
  alertId: string,
  database: EmrDb = defaultDb(),
): Promise<AlertDetail | null> {
  const [row] = await database
    .select()
    .from(criticalAlerts)
    .where(and(eq(criticalAlerts.id, alertId), eq(criticalAlerts.hospitalId, hospitalId)));
  if (!row) return null;
  const [summary] = await summarise(database, hospitalId, [row]);
  const events = await database
    .select()
    .from(criticalAlertEvents)
    .where(eq(criticalAlertEvents.alertId, alertId))
    .orderBy(asc(criticalAlertEvents.at), asc(criticalAlertEvents.kind));
  const people = [
    ...new Set(events.flatMap((e) => [e.actorId, e.recipientId]).filter((u): u is string => !!u)),
  ];
  const [cadreOf, names] = await Promise.all([
    cadreNames(database, hospitalId, people),
    people.length
      ? database
          .select({ id: users.id, name: users.fullName })
          .from(users)
          .where(inArray(users.id, people))
      : Promise.resolve([]),
  ]);
  const obs = await database
    .select({
      conceptId: clinicalObservations.conceptId,
      valueNum: clinicalObservations.valueNum,
      comparator: clinicalObservations.valueComparator,
      unit: clinicalObservations.valueUnit,
      code: clinicalObservations.valueCode,
      context: clinicalObservations.context,
    })
    .from(clinicalObservations)
    .where(eq(clinicalObservations.reportId, row.reportId));
  const nameOf = new Map(names.map((n) => [n.id, n.name]));
  const who = (u: string | null) =>
    u ? [nameOf.get(u), cadreOf.get(u)].filter(Boolean).join(", ") || "Staff" : null;
  const created = events.find((e) => e.kind === "created");
  const noteCipher = (created?.data as { noteCiphertext?: string } | null)?.noteCiphertext;
  return {
    alert: summary!,
    report: obs
      .filter((o) => o.conceptId)
      .map((o) => {
        const ctx = (o.context ?? {}) as {
          labInterpretation?: string;
          referenceRange?: { low?: number; high?: number };
        };
        const r = ctx.referenceRange;
        return {
          conceptId: o.conceptId!,
          display: conceptDef(o.conceptId!)?.display ?? o.conceptId!,
          value: valueWords(o),
          unit: unitWords(o.unit) ?? o.unit,
          range:
            r && (r.low !== undefined || r.high !== undefined)
              ? `${r.low ?? "…"}–${r.high ?? "…"}`
              : null,
          flag: ctx.labInterpretation ?? null,
        };
      }),
    timeline: events.map((e) => {
      const data = { ...((e.data ?? {}) as Record<string, unknown>) };
      if (typeof data.nameCiphertext === "string") {
        data.name = safeDecrypt(data.nameCiphertext);
        delete data.nameCiphertext;
      }
      delete data.noteCiphertext;
      return {
        id: e.id,
        kind: e.kind,
        at: e.at,
        level: e.level,
        actor: who(e.actorId),
        recipient: who(e.recipientId),
        channel: e.channel,
        outcome: e.outcome,
        detail: data,
      };
    }),
    noteFromLab: noteCipher ? safeDecrypt(noteCipher) : null,
    ackNote: row.noteCiphertext ? safeDecrypt(row.noteCiphertext) : null,
    recipients: [
      ...new Set(
        events.filter((e) => e.kind === "notified" && e.recipientId).map((e) => e.recipientId!),
      ),
    ],
  };
}

function safeDecrypt(c: string): string | null {
  try {
    return decrypt(c);
  } catch {
    return null;
  }
}

/* ─── The clinician's alerts (§5.4) ───────────────────────────────────── */

export interface MyAlerts {
  /** Open alerts I received (pinned, header count). */
  open: (AlertSummary & { escalatedToMe: boolean; minutesOpen: number })[];
  /** Today: phone acknowledgements naming me (the dispute line), and alerts I acknowledged (one line). */
  phoneAckedForMe: AlertSummary[];
  acknowledgedByMe: AlertSummary[];
}

export async function loadMyAlerts(
  viewer: { userId: string; hospitalId: string },
  now: Date,
  timeZone: string,
  database: EmrDb = defaultDb(),
): Promise<MyAlerts> {
  await escalateLazily(viewer.hospitalId, now, database);
  const since = startOfLocalDay(now, timeZone);
  const received = database
    .selectDistinct({ alertId: criticalAlertEvents.alertId, level: criticalAlertEvents.level })
    .from(criticalAlertEvents)
    .where(
      and(
        eq(criticalAlertEvents.hospitalId, viewer.hospitalId),
        eq(criticalAlertEvents.kind, "notified"),
        eq(criticalAlertEvents.channel, "app"),
        eq(criticalAlertEvents.recipientId, viewer.userId),
      ),
    );
  const mine = await received;
  const ids = [...new Set(mine.map((m) => m.alertId))];
  const rows = await database
    .select()
    .from(criticalAlerts)
    .where(
      and(
        eq(criticalAlerts.hospitalId, viewer.hospitalId),
        or(
          ids.length
            ? and(inArray(criticalAlerts.id, ids), eq(criticalAlerts.state, "open"))
            : sql`false`,
          and(
            eq(criticalAlerts.acknowledgedBy, viewer.userId),
            gte(criticalAlerts.acknowledgedAt, since),
          ),
        ),
      ),
    )
    .orderBy(asc(criticalAlerts.sentAt));
  const all = await summarise(database, viewer.hospitalId, rows);
  const levelsFor = (id: string) => mine.filter((m) => m.alertId === id).map((m) => m.level ?? 0);
  return {
    open: all
      .filter((a) => a.state === "open")
      .map((a) => ({
        ...a,
        escalatedToMe:
          a.level > 0 && levelsFor(a.id).includes(a.level) && !levelsFor(a.id).includes(0),
        minutesOpen: Math.max(0, Math.floor((now.getTime() - a.sentAt.getTime()) / 60_000)),
      })),
    phoneAckedForMe: all.filter(
      (a) =>
        a.state === "acknowledged" &&
        a.acknowledgedVia === "phone" &&
        a.acknowledgedBy === viewer.userId,
    ),
    acknowledgedByMe: all.filter((a) => a.state === "acknowledged" && a.acknowledgedVia === "app"),
  };
}

export async function countMyOpenAlerts(
  viewer: { userId: string; hospitalId: string },
  database: EmrDb = defaultDb(),
): Promise<number> {
  const [r] = await database
    .select({ n: sql<number>`count(DISTINCT ${criticalAlerts.id})::int` })
    .from(criticalAlerts)
    .innerJoin(
      criticalAlertEvents,
      and(
        eq(criticalAlertEvents.alertId, criticalAlerts.id),
        eq(criticalAlertEvents.kind, "notified"),
        eq(criticalAlertEvents.channel, "app"),
        eq(criticalAlertEvents.recipientId, viewer.userId),
      ),
    )
    .where(and(eq(criticalAlerts.hospitalId, viewer.hospitalId), eq(criticalAlerts.state, "open")));
  return r?.n ?? 0;
}

/** The chart (§5.4): open alerts on this patient, for any clinician who may open the chart. */
export async function openAlertsForPatient(
  hospitalId: string,
  patientUserId: string,
  database: EmrDb = defaultDb(),
) {
  const rows = await database
    .select()
    .from(criticalAlerts)
    .where(
      and(
        eq(criticalAlerts.hospitalId, hospitalId),
        eq(criticalAlerts.patientUserId, patientUserId),
        eq(criticalAlerts.state, "open"),
      ),
    )
    .orderBy(desc(criticalAlerts.sentAt));
  return summarise(database, hospitalId, rows);
}

/** CA-12: which of these reports carry an open critical alert (never in a batch acknowledgement). */
export async function reportsWithOpenAlert(
  hospitalId: string,
  reportIds: readonly string[],
  database: EmrDb = defaultDb(),
) {
  if (reportIds.length === 0) return new Set<string>();
  const rows = await database
    .select({ reportId: criticalAlerts.reportId })
    .from(criticalAlerts)
    .where(
      and(
        eq(criticalAlerts.hospitalId, hospitalId),
        eq(criticalAlerts.state, "open"),
        inArray(criticalAlerts.reportId, [...reportIds]),
      ),
    );
  return new Set(rows.map((r) => r.reportId));
}

/* ─── The mark panel's preview of who is alerted (§5.2) ───────────────── */

export interface RecipientPreview {
  level0: { name: string; role: string }[];
  next: { level: Level; people: { name: string; role: string }[]; at: Date | null } | null;
  emptyLevels: Level[];
  reachedNobody: boolean;
  times: ResponseTimes | null;
  smsLive: boolean;
  secondCheck: boolean;
  labUsers: { userId: string; name: string }[];
}

export async function previewRecipients(
  scope: { userId: string; hospitalId: string },
  order: { orderId: string; patientUserId: string; restricted: boolean },
  now: Date,
  database: EmrDb = defaultDb(),
): Promise<RecipientPreview> {
  return database.transaction(async (tx) => {
    const ladder = await loadLadder(tx, {
      hospitalId: scope.hospitalId,
      patientUserId: order.patientUserId,
      orderId: order.orderId,
      restricted: order.restricted,
    });
    const first = resolveFrom(0, ladder.input);
    const next: LadderResult | null =
      first.level < 2 && !first.reachedNobody
        ? resolveFrom((first.level + 1) as Level, ladder.input)
        : null;
    const times = await signedTimes(tx, scope.hospitalId);
    const settings = await settingsOf(tx, scope.hospitalId);
    const people = [...new Set([...first.recipients, ...(next?.recipients ?? [])])];
    const labRows = await tx
      .select({ userId: staffAffiliations.userId, name: users.fullName, code: cadres.code })
      .from(staffAffiliations)
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .innerJoin(users, eq(users.id, staffAffiliations.userId))
      .where(
        and(
          eq(staffAffiliations.hospitalId, scope.hospitalId),
          inArray(staffAffiliations.state, ["active", "approved"]),
          inArray(cadres.code, ["LAB_TECH", "LAB_TECHNOLOGIST"]),
        ),
      );
    const [cadreOf, names] = await Promise.all([
      cadreNames(tx as unknown as EmrDb, scope.hospitalId, people),
      people.length
        ? tx
            .select({ id: users.id, name: users.fullName })
            .from(users)
            .where(inArray(users.id, people))
        : Promise.resolve([]),
    ]);
    const nameOf = new Map(names.map((n) => [n.id, n.name]));
    // Levels 0 and 1 belong to the ordering ward; level 2 is the hospital's list.
    const person = (level: Level) => (u: string) => ({
      name: nameOf.get(u) ?? "Staff",
      role: [cadreOf.get(u), level < 2 ? ladder.place : "hospital contact"]
        .filter(Boolean)
        .join(", "),
    });
    return {
      level0: first.recipients.map(person(first.level)),
      next: next
        ? {
            level: next.level,
            people: next.recipients.map(person(next.level)),
            at: first.level === 0 ? dueAtFor(0, now, times) : dueAtFor(first.level, now, times),
          }
        : null,
      emptyLevels: [...first.emptyLevels, ...(next?.emptyLevels ?? [])],
      reachedNobody: first.reachedNobody,
      times,
      smsLive: settings.smsLive,
      secondCheck: settings.secondCheck,
      labUsers: labRows
        .filter((r) => r.userId !== scope.userId)
        .map((r) => ({ userId: r.userId, name: r.name })),
    };
  });
}

/** Reports flagged restricted keep their alert in the app only (Law 12). */
export async function reportSensitivity(reportId: string, database: EmrDb = defaultDb()) {
  const [r] = await database
    .select({ s: diagnosticReports.sensitivity })
    .from(diagnosticReports)
    .where(eq(diagnosticReports.id, reportId));
  return r?.s === "restricted";
}

/** §5.3: who the lab may have phoned: clinical staff at this hospital, by name and cadre. */
export async function callTargets(hospitalId: string, database: EmrDb = defaultDb()) {
  const rows = await database
    .selectDistinct({
      userId: staffAffiliations.userId,
      name: users.fullName,
      cadre: cadres.name,
      code: cadres.code,
    })
    .from(staffAffiliations)
    .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
    .innerJoin(users, eq(users.id, staffAffiliations.userId))
    .where(
      and(
        eq(staffAffiliations.hospitalId, hospitalId),
        inArray(staffAffiliations.state, ["active", "approved"]),
        eq(cadres.isClinical, true),
      ),
    )
    .orderBy(asc(users.fullName));
  return rows
    .filter((r) => !["LAB_TECH", "LAB_TECHNOLOGIST"].includes(r.code))
    .map((r) => ({ userId: r.userId, name: r.name, cadre: r.cadre }));
}

/** The alerts raised on this order's reports, newest first (the released result's status, §5.2). */
export async function alertsForOrder(
  hospitalId: string,
  orderId: string,
  database: EmrDb = defaultDb(),
) {
  const rows = await database
    .select()
    .from(criticalAlerts)
    .where(and(eq(criticalAlerts.hospitalId, hospitalId), eq(criticalAlerts.orderId, orderId)))
    .orderBy(desc(criticalAlerts.sentAt));
  return summarise(database, hospitalId, rows);
}
