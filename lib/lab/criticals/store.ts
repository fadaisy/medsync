import "server-only";

import type { Acknowledger, AlertEvent, AlertState, Level, ResponseCode, SubState } from "./alerts";
import type { OpenAlert, ResponseTimes } from "./escalation";
import type { MarkInput } from "./marks";
import type { LadderInput, LadderResult, StaffNow } from "./recipients";
import type { EmrActor } from "@/lib/emr/actor";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { WriteCtx } from "@/lib/emr/write/context";
import type { EnterResultsInput } from "@/lib/emr/write/results";
import type { CriticalEvaluation } from "@/lib/lab/flags";
import { and, desc, eq, inArray, lte, sql } from "drizzle-orm";

import { staffAffiliations } from "@/db/schema/clinician-profiles";
import { diagnosticReports, resultAcknowledgements, testCatalogue } from "@/db/schema/emr";
import { encounterOrders } from "@/db/schema/encounter";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import {
  criticalAlertEvents,
  criticalAlerts,
  criticalContacts,
  criticalMarks,
  criticalResponseVersions,
  escalationHeartbeats,
  labSettings,
  labSmsTemplates,
  ucumUnits,
} from "@/db/schema/lab-safety";
import { clinicalObservations } from "@/db/schema/nurse-workspace";
import { cadres } from "@/db/schema/reference-data";
import { encounters } from "@/db/schema/scheduling";
import { users } from "@/db/schema/users";
import { resolveEmrAccess } from "@/lib/emr/access";
import { EmrWriteError } from "@/lib/emr/write/context";
import { LAB_CADRES } from "@/lib/emr/write/orders";
import { enterResults, releaseResults } from "@/lib/emr/write/results";
import { encrypt } from "@/lib/encryption";
import {
  applyEvent,
  correctionRecipients,
  decideAcknowledge,
  mayAcknowledge,
  logCall as planCall,
} from "./alerts";
import { dueAtFor, escalateByHand, planEscalations } from "./escalation";
import { planRelease } from "./marks";
import { renderSms, smsDecision } from "./messages";
import { resolveFrom } from "./recipients";

/**
 * The criticals store (Lab Phase 1, Step 4; ADRs 0242–0245): the pure engines in ./alerts, ./marks,
 * ./recipients, ./escalation and ./messages applied to the tables of migration 0102.
 *
 * Every function takes the transaction it writes in, so the release, its marks and its alert commit
 * together (CM-2, CA-3) and the PGlite lane drives them as the app does. Delivery is planned inside
 * the transaction as `notified … queued` events and performed after commit by `deliverAfterCommit`,
 * which never throws: a failure is written as an event and shown to the lab (Law 4).
 */

type AlertRow = typeof criticalAlerts.$inferSelect;
export type DeliveryKind =
  | "created"
  | "escalated"
  | "corrected"
  | "acknowledged"
  | "phone_ack"
  | "disputed";

/** A message to send after commit. SMS text is rendered and scanned before it is queued. */
export interface Delivery {
  alertId: string;
  hospitalId: string;
  userId: string;
  kind: DeliveryKind;
  level: Level | null;
  sms: { to: string; text: string } | null;
}

const ACTIVE_AFFILIATION = ["active", "approved"] as const;
const GONE = new Set(["suspended", "deactivated", "rejected", "offboarded"]);

/* ─── Small reads ──────────────────────────────────────────────────────── */

export function stateOf(a: AlertRow): AlertState {
  if (a.state === "acknowledged")
    return {
      state: "acknowledged",
      level: a.level as Level,
      at: a.acknowledgedAt!,
      by: a.acknowledgedBy!,
      via: a.acknowledgedVia as "app" | "phone",
      loggedBy: a.loggedBy,
      response: (a.responseCode as ResponseCode | null) ?? null,
    };
  return {
    state: "open",
    subState: a.subState as SubState,
    level: a.level as Level,
    dueAt: a.dueAt,
  };
}

/** The signed response times in force (one signed set per hospital, 0102 crv_one_signed). */
export async function signedTimes(tx: EmrTx, hospitalId: string): Promise<ResponseTimes | null> {
  const [v] = await tx
    .select()
    .from(criticalResponseVersions)
    .where(
      and(
        eq(criticalResponseVersions.hospitalId, hospitalId),
        eq(criticalResponseVersions.status, "signed"),
      ),
    )
    .limit(1);
  return v
    ? {
        ackWithinMin: v.ackWithinMin,
        level1AfterMin: v.level1AfterMin,
        level2AfterMin: v.level2AfterMin,
      }
    : null;
}

export async function settingsOf(tx: EmrTx, hospitalId: string) {
  const [s] = await tx
    .select()
    .from(labSettings)
    .where(eq(labSettings.hospitalId, hospitalId))
    .limit(1);
  return {
    labPhone: s?.labPhone ?? null,
    secondCheck: s?.secondCheck ?? false,
    smsLive: s?.smsLive ?? false,
  };
}

async function lockAlert(tx: EmrTx, alertId: string, hospitalId: string): Promise<AlertRow> {
  const [a] = await tx
    .select()
    .from(criticalAlerts)
    .where(and(eq(criticalAlerts.id, alertId), eq(criticalAlerts.hospitalId, hospitalId)))
    .for("update");
  if (!a) throw new EmrWriteError("not_found", "This alert was not found.");
  return a;
}

/** Staff now, for the ladder and for whoever a call names: account, affiliation, cadre, phone. */
async function staffNow(tx: EmrTx, hospitalId: string, userIds: readonly string[]) {
  const ids = [...new Set(userIds)];
  if (ids.length === 0)
    return new Map<
      string,
      { active: boolean; affiliatedHere: boolean; cadreCode: string | null; phone: string | null }
    >();
  const [accounts, affiliations] = await Promise.all([
    tx
      .select({ id: users.id, state: users.state, phone: users.phone })
      .from(users)
      .where(inArray(users.id, ids)),
    tx
      .select({ userId: staffAffiliations.userId, code: cadres.code })
      .from(staffAffiliations)
      .innerJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(
        and(
          inArray(staffAffiliations.userId, ids),
          eq(staffAffiliations.hospitalId, hospitalId),
          inArray(staffAffiliations.state, [...ACTIVE_AFFILIATION]),
        ),
      ),
  ]);
  const account = new Map(accounts.map((a) => [a.id, a]));
  const cadre = new Map(affiliations.map((a) => [a.userId, a.code]));
  return new Map(
    ids.map((id) => [
      id,
      {
        active: !GONE.has(account.get(id)?.state ?? ""),
        affiliatedHere: cadre.has(id),
        cadreCode: cadre.get(id) ?? null,
        phone: account.get(id)?.phone ?? null,
      },
    ]),
  );
}

export async function acknowledgerOf(
  tx: EmrTx,
  hospitalId: string,
  userId: string,
): Promise<Acknowledger | null> {
  const s = (await staffNow(tx, hospitalId, [userId])).get(userId);
  if (!s || !s.affiliatedHere) return null;
  return { userId, hospitalId, cadreCode: s.cadreCode, active: s.active };
}

/** Everything the ladder needs, read now (RC-6), with phones kept server-side for SMS only. */
export async function loadLadder(
  tx: EmrTx,
  a: { hospitalId: string; patientUserId: string; orderId: string | null; restricted: boolean },
): Promise<{ input: LadderInput; phones: Map<string, string | null>; place: string }> {
  const [order] = a.orderId
    ? await tx
        .select({
          orderedBy: encounterOrders.authoredByUserId,
          encounterId: encounterOrders.encounterId,
        })
        .from(encounterOrders)
        .where(eq(encounterOrders.id, a.orderId))
    : [];
  const [enc] = order?.encounterId
    ? await tx
        .select({
          clinician: encounters.clinicianUserId,
          state: encounters.state,
          departmentId: encounters.departmentId,
        })
        .from(encounters)
        .where(eq(encounters.id, order.encounterId))
    : [];
  const [dept] = enc?.departmentId
    ? await tx
        .select({ name: hospitalDepartments.name })
        .from(hospitalDepartments)
        .where(eq(hospitalDepartments.id, enc.departmentId))
    : [];
  const contacts = await tx
    .select()
    .from(criticalContacts)
    .where(eq(criticalContacts.hospitalId, a.hospitalId));
  const responsible = enc && enc.state === "in_progress" ? enc.clinician : null;
  const candidates = [order?.orderedBy, responsible, ...contacts.map((c) => c.userId)].filter(
    (u): u is string => !!u,
  );
  const now = await staffNow(tx, a.hospitalId, candidates);
  const access = new Map<string, boolean>();
  if (a.restricted)
    for (const u of new Set(candidates))
      access.set(
        u,
        (
          await resolveEmrAccess(tx, {
            userId: u,
            patientUserId: a.patientUserId,
            hospitalId: a.hospitalId,
          })
        ).allowed,
      );
  const staff = (u: string): StaffNow | undefined => {
    const s = now.get(u);
    return (
      s && {
        active: s.active,
        affiliatedHere: s.affiliatedHere,
        mayOpenChart: access.get(u) ?? true,
      }
    );
  };
  return {
    input: {
      hospitalId: a.hospitalId,
      orderedBy: order?.orderedBy ?? null,
      responsibleClinician: responsible,
      orderDepartmentId: enc?.departmentId ?? null,
      restricted: a.restricted,
      staff,
      contacts: contacts.map((c) => ({
        hospitalId: c.hospitalId,
        level: c.level as 1 | 2,
        departmentId: c.departmentId,
        userId: c.userId,
        position: c.position,
      })),
    },
    phones: new Map([...now].map(([id, s]) => [id, s.phone])),
    place: dept?.name ?? "your ward",
  };
}

/* ─── Delivery (MS-3, MS-4; CA-3) ─────────────────────────────────────── */

async function smsTerms(tx: EmrTx) {
  const [tests, units] = await Promise.all([
    tx.select({ display: testCatalogue.display }).from(testCatalogue),
    tx.select({ code: ucumUnits.code, display: ucumUnits.display }).from(ucumUnits),
  ]);
  return {
    names: [],
    testNames: tests.map((t) => t.display),
    units: units.flatMap((u) => [u.code, u.display]),
  };
}

/** Writes `notified` events for one level's recipients and returns what to send after commit. */
async function notify(
  tx: EmrTx,
  alert: { id: string; hospitalId: string; restricted: boolean },
  recipients: readonly string[],
  level: Level,
  kind: DeliveryKind,
  ctx: { now: Date; phones: Map<string, string | null>; place: string },
): Promise<Delivery[]> {
  if (recipients.length === 0) return [];
  const settings = await settingsOf(tx, alert.hospitalId);
  const templateKind = level === 0 && kind !== "escalated" ? "level0" : "escalation";
  const [template] = settings.smsLive
    ? await tx
        .select()
        .from(labSmsTemplates)
        .where(
          and(
            eq(labSmsTemplates.hospitalId, alert.hospitalId),
            eq(labSmsTemplates.kind, templateKind),
            eq(labSmsTemplates.status, "approved"),
          ),
        )
        .orderBy(desc(labSmsTemplates.version))
        .limit(1)
    : [];
  const terms = template ? await smsTerms(tx) : null;
  const sent = await tx
    .select({ recipientId: criticalAlertEvents.recipientId })
    .from(criticalAlertEvents)
    .where(
      and(
        eq(criticalAlertEvents.alertId, alert.id),
        eq(criticalAlertEvents.kind, "notified"),
        eq(criticalAlertEvents.channel, "sms"),
        eq(criticalAlertEvents.level, level),
        eq(criticalAlertEvents.outcome, "queued"),
      ),
    );
  const jobs: Delivery[] = [];
  for (const userId of recipients) {
    const phone = ctx.phones.get(userId) ?? null;
    const decision = smsDecision({
      smsLive: settings.smsLive,
      templateApproved: !!template,
      staffPhone: phone,
      restricted: alert.restricted,
      alreadySent: sent.some((s) => s.recipientId === userId),
    });
    let sms: Delivery["sms"] = null;
    let outcome: "queued" | "off" | "skipped" = decision.send ? "queued" : decision.outcome;
    let reason = decision.send ? null : decision.reason;
    if (decision.send && template && terms) {
      const r = renderSms(
        template,
        { place: ctx.place, labNumber: settings.labPhone ?? "" },
        terms,
      );
      if (r.ok) sms = { to: phone!, text: r.text };
      else [outcome, reason] = ["skipped", r.reason];
    }
    await tx.insert(criticalAlertEvents).values([
      {
        alertId: alert.id,
        hospitalId: alert.hospitalId,
        kind: "notified",
        level,
        recipientId: userId,
        channel: "app",
        outcome: "queued",
        at: ctx.now,
      },
      {
        alertId: alert.id,
        hospitalId: alert.hospitalId,
        kind: "notified",
        level,
        recipientId: userId,
        channel: "sms",
        outcome,
        data: reason ? { reason } : {},
        at: ctx.now,
      },
    ]);
    jobs.push({ alertId: alert.id, hospitalId: alert.hospitalId, userId, kind, level, sms });
  }
  return jobs;
}

export interface Transport {
  push: (d: Delivery) => Promise<void>;
  sms: (to: string, text: string) => Promise<{ ok: boolean; reason?: string }>;
}

/** The app's transport: the per-user realtime topic (0106), and SMS through the provider or a log. */
export async function defaultTransport(db: EmrDb): Promise<Transport> {
  const { createAfricasTalkingSender } = await import("@/lib/notifications/africastalking");
  const { logger } = await import("@/lib/logger");
  const sender = createAfricasTalkingSender();
  return {
    push: async (d) => {
      await db.execute(
        sql`SELECT private.notify_user(${d.userId}::uuid, ${d.kind}, ${d.alertId}::uuid)`,
      );
    },
    sms: async (to, text) => {
      if (!sender) {
        logger.info("lab.critical_sms.mock", { length: text.length }); // never the number or the text
        return { ok: true };
      }
      const r = await sender.send({ toE164: to, body: text });
      return r.ok ? { ok: true } : { ok: false, reason: r.reason };
    },
  };
}

/**
 * After commit: push each delivery and send each SMS. Never throws (CA-3). A failure is written as a
 * `notified … failed` event, which the lab's list reads as "Not sent · phone the ward".
 */
export async function deliverAfterCommit(
  db: EmrDb,
  jobs: readonly Delivery[],
  transport?: Transport,
): Promise<{ failed: number }> {
  if (jobs.length === 0) return { failed: 0 };
  let failed = 0;
  let t: Transport;
  try {
    t = transport ?? (await defaultTransport(db));
  } catch {
    t = {
      push: () => Promise.reject(new Error("no transport")),
      sms: async () => ({ ok: false, reason: "no transport" }),
    };
  }
  for (const d of jobs) {
    const outcomes: { channel: "app" | "sms"; outcome: "delivered" | "failed"; reason?: string }[] =
      [];
    try {
      await t.push(d);
    } catch (e) {
      failed++;
      outcomes.push({
        channel: "app",
        outcome: "failed",
        reason: e instanceof Error ? e.message.slice(0, 120) : "push failed",
      });
    }
    if (d.sms) {
      try {
        const r = await t.sms(d.sms.to, d.sms.text);
        outcomes.push(
          r.ok
            ? { channel: "sms", outcome: "delivered" }
            : { channel: "sms", outcome: "failed", reason: r.reason },
        );
      } catch {
        outcomes.push({ channel: "sms", outcome: "failed", reason: "send threw" });
      }
    }
    if (outcomes.length === 0) continue;
    try {
      await db.insert(criticalAlertEvents).values(
        outcomes.map((o) => ({
          alertId: d.alertId,
          hospitalId: d.hospitalId,
          kind: "notified" as const,
          level: d.level,
          recipientId: d.userId,
          channel: o.channel,
          outcome: o.outcome,
          data: o.reason ? { reason: o.reason } : {},
        })),
      );
    } catch {
      // The record of a failed delivery could not be written either: the lab list still shows the
      // alert as open, and the heartbeat and lazy path keep running. Nothing is thrown to the caller.
    }
  }
  return { failed };
}

/* ─── Release with a mark (CM-1–CM-5, CA-1, CA-3, CA-8, CA-11, CA-13) ─── */

export interface ReleaseAlertInput {
  patientUserId: string;
  reportId: string;
  orderId: string | null;
  marks: MarkInput[];
  note: string | null;
  clientKey: string;
  /** Step 6: the signed limits' verdict per component; none by hand. */
  evaluations?: Record<string, CriticalEvaluation | null>;
}

export interface ReleaseAlertResult {
  alertId: string | null;
  subState: SubState | null;
  level: Level | null;
  emptyLevels: Level[];
  jobs: Delivery[];
}

/** In the release transaction: plan the marks, write the alert, its marks and its first events. */
export async function createAlertOnRelease(
  ctx: WriteCtx,
  input: ReleaseAlertInput,
): Promise<ReleaseAlertResult> {
  const { tx, actor, now } = ctx;
  const [replay] = await tx
    .select()
    .from(criticalAlerts)
    .where(eq(criticalAlerts.clientKey, input.clientKey))
    .limit(1);
  if (replay)
    return {
      alertId: replay.id,
      subState: replay.subState as SubState | null,
      level: replay.level as Level,
      emptyLevels: [],
      jobs: [],
    };

  const components = await tx
    .selectDistinct({ conceptId: clinicalObservations.conceptId })
    .from(clinicalObservations)
    .where(eq(clinicalObservations.reportId, input.reportId));
  const settings = await settingsOf(tx, actor.hospitalId);
  const seconds = input.marks.map((m) => m.secondCheckerId).filter((u): u is string => !!u);
  const lab = await staffNow(tx, actor.hospitalId, seconds);
  const plan = planRelease(
    components
      .map((c) => c.conceptId)
      .filter((c): c is string => c !== null)
      .map((conceptId) => ({ conceptId, evaluation: input.evaluations?.[conceptId] ?? null })),
    input.marks,
    {
      actorId: actor.userId,
      secondCheck: settings.secondCheck,
      mayRelease: (u) => {
        const s = lab.get(u);
        return !!s && s.active && s.affiliatedHere && LAB_CADRES.includes(s.cadreCode ?? "");
      },
    },
  );
  if (!plan.ok) throw new EmrWriteError("invalid", releaseRefusal(plan.errors));
  if (!plan.createsAlert)
    return { alertId: null, subState: null, level: null, emptyLevels: [], jobs: [] };

  const [report] = await tx
    .select({ sensitivity: diagnosticReports.sensitivity })
    .from(diagnosticReports)
    .where(eq(diagnosticReports.id, input.reportId));
  const restricted = report?.sensitivity === "restricted";
  const ladder = await loadLadder(tx, {
    hospitalId: actor.hospitalId,
    patientUserId: input.patientUserId,
    orderId: input.orderId,
    restricted,
  });
  const reached = resolveFrom(0, ladder.input);
  const times = await signedTimes(tx, actor.hospitalId);
  const subState: SubState = reached.reachedNobody ? "not_sent" : "sent";
  const [alert] = await tx
    .insert(criticalAlerts)
    .values({
      hospitalId: actor.hospitalId,
      patientUserId: input.patientUserId,
      reportId: input.reportId,
      orderId: input.orderId,
      restricted,
      state: "open",
      subState,
      level: reached.level,
      sentAt: now,
      dueAt: reached.reachedNobody ? null : dueAtFor(reached.level, now, times),
      createdBy: actor.userId,
      clientKey: input.clientKey,
    })
    .returning();
  await tx.insert(criticalMarks).values(
    plan.marks.map((m) => ({
      alertId: alert!.id,
      reportId: input.reportId,
      hospitalId: actor.hospitalId,
      patientUserId: input.patientUserId,
      conceptId: m.conceptId,
      source: m.source,
      limitId: m.limitId,
      limitVersion: m.limitVersion,
      direction: m.direction,
      checkKind: m.check.kind,
      repeatValue: m.check.kind === "repeated" ? m.check.repeatValue : null,
      couldNotCheckReason: m.check.kind === "could_not_check" ? m.check.reason : null,
      couldNotCheckText: m.check.kind === "could_not_check" ? m.check.text?.trim() || null : null,
      sampleChecked: m.sampleChecked,
      secondCheckerId: m.secondCheckerId ?? null,
      soloReason: m.soloReason?.trim() || null,
      actorId: actor.userId,
      createdAt: now,
    })),
  );
  const note = input.note?.trim();
  await tx.insert(criticalAlertEvents).values({
    alertId: alert!.id,
    hospitalId: actor.hospitalId,
    kind: "created",
    level: reached.level,
    actorId: actor.userId,
    data: {
      subState,
      emptyLevels: reached.emptyLevels,
      skipped: reached.skipped,
      ...(note ? { noteCiphertext: encrypt(note) } : {}),
    },
    at: now,
  });
  const jobs = await notify(tx, alert!, reached.recipients, reached.level, "created", {
    now,
    phones: ladder.phones,
    place: ladder.place,
  });
  return {
    alertId: alert!.id,
    subState,
    level: reached.level,
    emptyLevels: reached.emptyLevels,
    jobs,
  };
}

function releaseRefusal(errors: readonly string[]): string {
  const first = errors[0] ?? "";
  if (first.startsWith("check_required")) return "A critical value needs a check before release.";
  if (first.startsWith("second_check"))
    return "The second check is on: a second lab user confirms, or record why you are working alone.";
  if (first.startsWith("second_checker"))
    return "The second checker must be another lab user who may release results.";
  if (first.startsWith("repeat_value")) return "Type the repeat value as a number.";
  if (first.startsWith("could_not_check_text")) return "Say why the value could not be checked.";
  return "The critical mark could not be recorded. Check the marked results.";
}

/* ─── The clinician's side (CA-5–CA-9, CA-12) ─────────────────────────── */

async function isRecipient(tx: EmrTx, alertId: string, userId: string): Promise<boolean> {
  const [r] = await tx
    .select({ id: criticalAlertEvents.id })
    .from(criticalAlertEvents)
    .where(
      and(
        eq(criticalAlertEvents.alertId, alertId),
        eq(criticalAlertEvents.kind, "notified"),
        eq(criticalAlertEvents.recipientId, userId),
      ),
    )
    .limit(1);
  return !!r;
}

/** D-LAB1-29: a recipient, or anyone with an access basis for the patient. */
async function mayView(tx: EmrTx, alert: AlertRow, userId: string): Promise<boolean> {
  if (await isRecipient(tx, alert.id, userId)) return true;
  return (
    await resolveEmrAccess(tx, {
      userId,
      patientUserId: alert.patientUserId,
      hospitalId: alert.hospitalId,
    })
  ).allowed;
}

export interface AckResult {
  kind: "acknowledged" | "already";
  state: Extract<AlertState, { state: "acknowledged" }>;
  jobs: Delivery[];
}

/** CA-6, CA-7, CA-8, CA-12: one tap; first wins; the report counts as reviewed. */
export async function acknowledgeAlert(
  tx: EmrTx,
  actor: Pick<EmrActor, "userId" | "hospitalId" | "cadreCode">,
  input: { alertId: string; response: ResponseCode | null; note: string | null; now: Date },
): Promise<AckResult> {
  const alert = await lockAlert(tx, input.alertId, actor.hospitalId);
  if (!(await mayView(tx, alert, actor.userId)))
    throw new EmrWriteError("not_found", "This alert was not found.");
  const me = (await acknowledgerOf(tx, actor.hospitalId, actor.userId)) ?? {
    userId: actor.userId,
    hospitalId: actor.hospitalId,
    cadreCode: actor.cadreCode,
    active: true,
  };
  const d = decideAcknowledge(stateOf(alert), me, alert.hospitalId, {
    at: input.now,
    response: input.response,
  });
  if (d.kind === "already") return { kind: "already", state: d.state, jobs: [] };
  if (d.kind === "refused")
    throw new EmrWriteError(
      "forbidden",
      "Only a clinician who may order tests here can acknowledge a critical result.",
    );
  const note = input.note?.trim() || null;
  await tx
    .update(criticalAlerts)
    .set({
      state: "acknowledged",
      subState: null,
      acknowledgedAt: input.now,
      acknowledgedBy: actor.userId,
      acknowledgedVia: "app",
      responseCode: input.response,
      noteCiphertext: note ? encrypt(note) : null,
    })
    .where(eq(criticalAlerts.id, alert.id));
  await tx.insert(criticalAlertEvents).values({
    alertId: alert.id,
    hospitalId: alert.hospitalId,
    kind: "acknowledged",
    level: alert.level,
    actorId: actor.userId,
    channel: "app",
    data: { response: input.response },
    at: input.now,
  });
  await recordReviewed(tx, alert, actor, note, input.now);
  const next = applyEvent(stateOf(alert), d.event) as Extract<
    AlertState,
    { state: "acknowledged" }
  >;
  return { kind: "acknowledged", state: next, jobs: [labPing(alert, "acknowledged")] };
}

/** CA-12: the existing acknowledgement record, once per clinician per report version. */
async function recordReviewed(
  tx: EmrTx,
  alert: AlertRow,
  actor: Pick<EmrActor, "userId" | "hospitalId" | "cadreCode">,
  note: string | null,
  now: Date,
) {
  const [done] = await tx
    .select({ id: resultAcknowledgements.id })
    .from(resultAcknowledgements)
    .where(
      and(
        eq(resultAcknowledgements.reportId, alert.reportId),
        eq(resultAcknowledgements.acknowledgedByUserId, actor.userId),
      ),
    )
    .limit(1);
  if (done) return;
  await tx.insert(resultAcknowledgements).values({
    reportId: alert.reportId,
    hospitalId: alert.hospitalId,
    patientUserId: alert.patientUserId,
    acknowledgedByUserId: actor.userId,
    acknowledgerCadre: actor.cadreCode,
    action: "acted",
    noteCiphertext: note ? encrypt(note) : null,
    recordedAt: now,
    clientKey: `critical:${alert.id}:${actor.userId}`,
  });
}

/** The lab user who raised it hears that something changed (their list refreshes). */
const labPing = (alert: AlertRow, kind: DeliveryKind): Delivery => ({
  alertId: alert.id,
  hospitalId: alert.hospitalId,
  userId: alert.createdBy,
  kind,
  level: null,
  sms: null,
});

/** CA-5: once per recipient, when their screen renders the detail. Never shown to the lab as acknowledgement. */
export async function recordSeen(
  tx: EmrTx,
  actor: Pick<EmrActor, "userId" | "hospitalId">,
  alertId: string,
  now: Date,
): Promise<boolean> {
  const [alert] = await tx
    .select()
    .from(criticalAlerts)
    .where(and(eq(criticalAlerts.id, alertId), eq(criticalAlerts.hospitalId, actor.hospitalId)));
  if (!alert || !(await isRecipient(tx, alertId, actor.userId))) return false;
  const [already] = await tx
    .select({ id: criticalAlertEvents.id })
    .from(criticalAlertEvents)
    .where(
      and(
        eq(criticalAlertEvents.alertId, alertId),
        eq(criticalAlertEvents.kind, "seen"),
        eq(criticalAlertEvents.recipientId, actor.userId),
      ),
    )
    .limit(1);
  if (already) return false;
  await tx.insert(criticalAlertEvents).values({
    alertId,
    hospitalId: alert.hospitalId,
    kind: "seen",
    recipientId: actor.userId,
    level: alert.level,
    at: now,
  });
  return true;
}

/** CA-9: only the named clinician disputes a phone acknowledgement; the alert reopens at its level. */
export async function disputePhoneAck(
  tx: EmrTx,
  actor: Pick<EmrActor, "userId" | "hospitalId">,
  input: { alertId: string; now: Date },
): Promise<{ jobs: Delivery[] }> {
  const alert = await lockAlert(tx, input.alertId, actor.hospitalId);
  const times = await signedTimes(tx, alert.hospitalId);
  const before = stateOf(alert);
  const after = applyEvent(before, {
    kind: "disputed",
    at: input.now,
    by: actor.userId,
    dueAt: dueAtFor(alert.level as Level, input.now, times),
  });
  if (after === before || after.state !== "open")
    throw new EmrWriteError(
      "conflict",
      "Only the clinician named on a phone acknowledgement can dispute it.",
    );
  await tx
    .update(criticalAlerts)
    .set({
      state: "open",
      subState: after.subState,
      dueAt: after.dueAt,
      acknowledgedAt: null,
      acknowledgedBy: null,
      acknowledgedVia: null,
      responseCode: null,
      noteCiphertext: null,
      loggedBy: null,
    })
    .where(eq(criticalAlerts.id, alert.id));
  await tx.insert(criticalAlertEvents).values({
    alertId: alert.id,
    hospitalId: alert.hospitalId,
    kind: "disputed",
    level: alert.level,
    actorId: actor.userId,
    at: input.now,
  });
  return { jobs: [labPing(alert, "disputed")] };
}

/* ─── The lab's side (CA-9, ES-1 by hand) ─────────────────────────────── */

export type CallTarget = { userId: string } | { name: string; role: string };

/** CA-9: a call with read-back to a clinician who may acknowledge acknowledges by phone. */
export async function logCriticalCall(
  tx: EmrTx,
  actor: Pick<EmrActor, "userId" | "hospitalId">,
  input: { alertId: string; to: CallTarget; readBack: boolean; now: Date },
): Promise<{ acknowledged: boolean; wardInformed: boolean; jobs: Delivery[] }> {
  const alert = await lockAlert(tx, input.alertId, actor.hospitalId);
  const base = {
    alertId: alert.id,
    hospitalId: alert.hospitalId,
    level: alert.level,
    at: input.now,
  };
  if (!("userId" in input.to)) {
    await tx.insert(criticalAlertEvents).values({
      ...base,
      kind: "call_logged",
      actorId: actor.userId,
      channel: "phone",
      data: {
        readBack: input.readBack,
        nameCiphertext: encrypt(input.to.name.trim()),
        role: input.to.role.trim().slice(0, 80),
      },
    });
    return { acknowledged: false, wardInformed: true, jobs: [] };
  }
  const to = await acknowledgerOf(tx, alert.hospitalId, input.to.userId);
  if (!to) throw new EmrWriteError("invalid", "The person called must be staff at this hospital.");
  const events = planCall(stateOf(alert), {
    at: input.now,
    labUserId: actor.userId,
    to,
    readBack: input.readBack,
    alertHospitalId: alert.hospitalId,
  });
  for (const e of events) {
    if (e.kind === "call_logged")
      await tx.insert(criticalAlertEvents).values({
        ...base,
        kind: "call_logged",
        actorId: actor.userId,
        recipientId: to.userId,
        channel: "phone",
        data: { readBack: input.readBack, mayAcknowledge: mayAcknowledge(to, alert.hospitalId) },
      });
    if (e.kind === "acknowledged") {
      await tx
        .update(criticalAlerts)
        .set({
          state: "acknowledged",
          subState: null,
          acknowledgedAt: input.now,
          acknowledgedBy: to.userId,
          acknowledgedVia: "phone",
          loggedBy: actor.userId,
          responseCode: null,
        })
        .where(eq(criticalAlerts.id, alert.id));
      await tx.insert(criticalAlertEvents).values({
        ...base,
        kind: "acknowledged",
        actorId: to.userId,
        channel: "phone",
        data: { loggedBy: actor.userId },
      });
      // A phone acknowledgement is not the clinician's review of the report in MedSync: it can be
      // disputed, and a review record cannot be taken back. That review stays theirs (CA-12).
    }
  }
  const acknowledged = events.some((e) => e.kind === "acknowledged");
  return {
    acknowledged,
    wardInformed: !acknowledged,
    jobs: acknowledged
      ? [
          {
            alertId: alert.id,
            hospitalId: alert.hospitalId,
            userId: to.userId,
            kind: "phone_ack",
            level: null,
            sms: null,
          },
        ]
      : [],
  };
}

async function ladderFor(tx: EmrTx, alert: AlertRow) {
  return loadLadder(tx, {
    hospitalId: alert.hospitalId,
    patientUserId: alert.patientUserId,
    orderId: alert.orderId,
    restricted: alert.restricted,
  });
}

async function writeStep(
  tx: EmrTx,
  alert: AlertRow,
  step: {
    toLevel: Level;
    dueAt: Date | null;
    recipients: string[];
    emptyLevels: Level[];
    skipped: LadderResult["skipped"];
  },
  ladder: { phones: Map<string, string | null>; place: string },
  now: Date,
): Promise<Delivery[]> {
  await tx
    .update(criticalAlerts)
    .set({ level: step.toLevel, dueAt: step.dueAt, subState: "escalated" })
    .where(eq(criticalAlerts.id, alert.id));
  await tx.insert(criticalAlertEvents).values({
    alertId: alert.id,
    hospitalId: alert.hospitalId,
    kind: "escalated",
    level: step.toLevel,
    data: {
      from: alert.level,
      recipients: step.recipients,
      emptyLevels: step.emptyLevels,
      skipped: step.skipped,
    },
    at: now,
  });
  return notify(tx, alert, step.recipients, step.toLevel, "escalated", {
    now,
    phones: ladder.phones,
    place: ladder.place,
  });
}

/** "Could not reach anyone": escalates at once, signed times or not. At the last level, recorded only. */
export async function couldNotReach(
  tx: EmrTx,
  actor: Pick<EmrActor, "userId" | "hospitalId">,
  input: { alertId: string; now: Date },
): Promise<{ escalatedTo: Level | null; emptyLevels: Level[]; jobs: Delivery[] }> {
  const alert = await lockAlert(tx, input.alertId, actor.hospitalId);
  if (alert.state !== "open")
    throw new EmrWriteError("conflict", "This alert is already acknowledged.");
  await tx.insert(criticalAlertEvents).values({
    alertId: alert.id,
    hospitalId: alert.hospitalId,
    kind: "could_not_reach",
    level: alert.level,
    actorId: actor.userId,
    at: input.now,
  });
  const ladder = await ladderFor(tx, alert);
  const step = escalateByHand(
    { id: alert.id, hospitalId: alert.hospitalId, level: alert.level as Level, dueAt: alert.dueAt },
    input.now,
    await signedTimes(tx, alert.hospitalId),
    (_a, from) => resolveFrom(from, ladder.input),
  );
  if (!step) return { escalatedTo: null, emptyLevels: [], jobs: [] };
  const jobs = await writeStep(tx, alert, step, ladder, input.now);
  return { escalatedTo: step.toLevel, emptyLevels: step.emptyLevels, jobs };
}

/* ─── The scheduler and the lazy path (ES-2, ES-3, ES-5) ──────────────── */

/**
 * Escalates every open alert past its due time, once. Idempotent and safe to run from the
 * scheduler and every read at once: rows are taken FOR UPDATE SKIP LOCKED, so two runs never
 * escalate the same alert twice. Records a heartbeat.
 */
export async function runEscalations(
  db: EmrDb,
  opts: { now: Date; source: "scheduler" | "lazy"; hospitalId?: string },
): Promise<{ escalated: number; jobs: Delivery[] }> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select()
      .from(criticalAlerts)
      .where(
        and(
          eq(criticalAlerts.state, "open"),
          sql`${criticalAlerts.level} < 2`,
          lte(criticalAlerts.dueAt, opts.now),
          opts.hospitalId ? eq(criticalAlerts.hospitalId, opts.hospitalId) : undefined,
        ),
      )
      .for("update", { skipLocked: true });
    const times = new Map<string, ResponseTimes | null>();
    const jobs: Delivery[] = [];
    let escalated = 0;
    for (const alert of due) {
      if (!times.has(alert.hospitalId))
        times.set(alert.hospitalId, await signedTimes(tx, alert.hospitalId));
      const ladder = await ladderFor(tx, alert);
      const open: OpenAlert = {
        id: alert.id,
        hospitalId: alert.hospitalId,
        level: alert.level as Level,
        dueAt: alert.dueAt,
      };
      const [step] = planEscalations(
        opts.now,
        [open],
        (h) => times.get(h) ?? null,
        (_a, from) => resolveFrom(from, ladder.input),
      );
      if (!step) continue;
      jobs.push(...(await writeStep(tx, alert, step, ladder, opts.now)));
      escalated++;
    }
    await tx
      .insert(escalationHeartbeats)
      .values({ source: opts.source, ranAt: opts.now, escalated });
    return { escalated, jobs };
  });
}

/**
 * ES-5: the scheduler's last run. The lazy path's own heartbeats do not count: a read escalating
 * on its own is exactly what keeps a stopped scheduler hidden, and the notice exists to show it.
 */
export async function lastHeartbeat(tx: EmrTx): Promise<Date | null> {
  const [h] = await tx
    .select({ at: escalationHeartbeats.ranAt })
    .from(escalationHeartbeats)
    .where(eq(escalationHeartbeats.source, "scheduler"))
    .orderBy(desc(escalationHeartbeats.ranAt))
    .limit(1);
  return h?.at ?? null;
}

/* ─── Corrections (CA-10) ──────────────────────────────────────────────── */

/**
 * In the amendment's transaction: if any version of this report was alerted, mark each alert
 * `corrected` and open a linked correction alert to every recipient so far and whoever acknowledged.
 */
export async function correctAlerts(
  ctx: WriteCtx,
  input: { patientUserId: string; priorReportId: string; newReportId: string },
): Promise<{ correctionAlertId: string | null; jobs: Delivery[] }> {
  const { tx, actor, now } = ctx;
  const [prior] = await tx
    .select({ logicalId: diagnosticReports.logicalId })
    .from(diagnosticReports)
    .where(eq(diagnosticReports.id, input.priorReportId));
  if (!prior) return { correctionAlertId: null, jobs: [] };
  const chain = (
    await tx
      .select({ id: diagnosticReports.id })
      .from(diagnosticReports)
      .where(eq(diagnosticReports.logicalId, prior.logicalId))
  ).map((r) => r.id);
  const alerts = await tx
    .select()
    .from(criticalAlerts)
    .where(inArray(criticalAlerts.reportId, chain))
    .orderBy(desc(criticalAlerts.createdAt));
  if (alerts.length === 0) return { correctionAlertId: null, jobs: [] };
  const events = await tx
    .select()
    .from(criticalAlertEvents)
    .where(
      inArray(
        criticalAlertEvents.alertId,
        alerts.map((a) => a.id),
      ),
    );
  const asEngine: AlertEvent[] = events.flatMap((e): AlertEvent[] =>
    e.kind === "notified" && e.recipientId && e.channel === "app"
      ? [
          {
            kind: "notified",
            at: e.at,
            level: (e.level ?? 0) as Level,
            recipientId: e.recipientId,
            channel: "app",
            outcome: "queued",
          },
        ]
      : e.kind === "acknowledged" && e.actorId
        ? [
            {
              kind: "acknowledged",
              at: e.at,
              by: e.actorId,
              via: e.channel === "phone" ? "phone" : "app",
              loggedBy: null,
              response: null,
            },
          ]
        : [],
  );
  const [report] = await tx
    .select({ sensitivity: diagnosticReports.sensitivity })
    .from(diagnosticReports)
    .where(eq(diagnosticReports.id, input.newReportId));
  const latest = alerts[0]!;
  const ladder = await loadLadder(tx, {
    hospitalId: actor.hospitalId,
    patientUserId: input.patientUserId,
    orderId: latest.orderId,
    restricted: report?.sensitivity === "restricted",
  });
  const everyone = correctionRecipients(asEngine);
  const extra = await staffNow(tx, actor.hospitalId, everyone);
  const recipients = everyone.filter((u) => {
    const s = extra.get(u);
    return s && s.active && s.affiliatedHere;
  });
  const times = await signedTimes(tx, actor.hospitalId);
  const [correction] = await tx
    .insert(criticalAlerts)
    .values({
      hospitalId: actor.hospitalId,
      patientUserId: input.patientUserId,
      reportId: input.newReportId,
      orderId: latest.orderId,
      correctionOf: latest.id,
      restricted: report?.sensitivity === "restricted",
      state: "open",
      subState: recipients.length > 0 ? "sent" : "not_sent",
      level: 0,
      sentAt: now,
      dueAt: recipients.length > 0 ? dueAtFor(0, now, times) : null,
      createdBy: actor.userId,
    })
    .returning();
  await tx.insert(criticalAlertEvents).values([
    ...alerts.map((a) => ({
      alertId: a.id,
      hospitalId: a.hospitalId,
      kind: "corrected" as const,
      level: a.level,
      actorId: actor.userId,
      data: { correctionAlertId: correction!.id },
      at: now,
    })),
    {
      alertId: correction!.id,
      hospitalId: actor.hospitalId,
      kind: "created" as const,
      level: 0,
      actorId: actor.userId,
      data: { correctionOf: latest.id, subState: correction!.subState },
      at: now,
    },
  ]);
  const phones = new Map([
    ...ladder.phones,
    ...[...extra].map(([id, s]) => [id, s.phone] as const),
  ]);
  const jobs = await notify(tx, correction!, recipients, 0, "corrected", {
    now,
    phones,
    place: ladder.place,
  });
  return { correctionAlertId: correction!.id, jobs };
}

/* ─── The release action's body (S1, S11) ─────────────────────────────── */

export interface ReleaseWithMarkInput {
  patientUserId: string;
  orderId: string;
  /** Typed values to release as final (the first entry, or over a preliminary). */
  values?: EnterResultsInput["values"];
  conclusionCode?: EnterResultsInput["conclusionCode"];
  conclusionText?: string;
  /** Or: release a saved preliminary as it stands. */
  reportId?: string;
  marks: MarkInput[];
  note: string | null;
  clientKey: string;
}

/**
 * Release as final and, in the same transaction, the marks and the alert (CM-2, CA-3). A double tap
 * replays both: the report on its client key, the alert on `<key>:alert` (CA-8).
 */
export async function releaseWithCriticalMark(ctx: WriteCtx, input: ReleaseWithMarkInput) {
  const r = input.reportId
    ? await releaseResults(ctx, {
        patientUserId: input.patientUserId,
        reportId: input.reportId,
        clientKey: input.clientKey,
      })
    : await enterResults(ctx, {
        patientUserId: input.patientUserId,
        orderId: input.orderId,
        status: "final",
        values: input.values ?? [],
        ...(input.conclusionCode ? { conclusionCode: input.conclusionCode } : {}),
        ...(input.conclusionText ? { conclusionText: input.conclusionText } : {}),
        clientKey: input.clientKey,
      });
  const alert = await createAlertOnRelease(ctx, {
    patientUserId: input.patientUserId,
    reportId: r.id,
    orderId: input.orderId,
    marks: input.marks,
    note: input.note,
    clientKey: `${input.clientKey}:alert`,
  });
  return { ...r, alert };
}
