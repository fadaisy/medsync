/**
 * The critical-alert state machine (Lab Phase 1, §6.4, rules CA-2 to CA-14; ADR 0242). Pure.
 *
 * An alert is `open` (sub-state sent, not_sent or escalated, at a level 0–2) or `acknowledged`, and
 * nothing else (CA-2). Its history is an append-only list of events (CA-4); `foldAlert` replays them,
 * ignoring any event that does not apply, so no sequence can reach another state (CA-14). "Sent",
 * "seen" and "acknowledged" are three different events (Law 2): only `acknowledged` changes the state.
 */
import { CLERKING_CADRE_CODES } from "@/lib/encounter/access";

export type Level = 0 | 1 | 2;
export const LAST_LEVEL: Level = 2;
export type SubState = "sent" | "not_sent" | "escalated";
export type ResponseCode = "reviewing" | "asked_team" | "already_aware";

export type AlertEvent =
  | { kind: "created"; at: Date; level: Level; subState: "sent" | "not_sent"; dueAt: Date | null }
  | {
      kind: "notified";
      at: Date;
      level: Level;
      recipientId: string;
      channel: "app" | "sms";
      outcome: "queued" | "delivered" | "failed" | "skipped" | "off";
    }
  | { kind: "seen"; at: Date; recipientId: string }
  | { kind: "call_logged"; at: Date; actorId: string; to: string; readBack: boolean }
  | { kind: "could_not_reach"; at: Date; actorId: string }
  | {
      kind: "escalated";
      at: Date;
      level: Level;
      dueAt: Date | null;
      recipients: string[];
      emptyLevels: Level[];
    }
  | {
      kind: "acknowledged";
      at: Date;
      by: string;
      via: "app" | "phone";
      loggedBy: string | null;
      response: ResponseCode | null;
    }
  | { kind: "disputed"; at: Date; by: string; dueAt: Date | null }
  | { kind: "corrected"; at: Date; correctionAlertId: string };

export type AlertState =
  | { state: "open"; subState: SubState; level: Level; dueAt: Date | null }
  | {
      state: "acknowledged";
      level: Level;
      at: Date;
      by: string;
      via: "app" | "phone";
      loggedBy: string | null;
      response: ResponseCode | null;
    };

/** One event applied to a state. An event that does not apply returns the state unchanged. */
export function applyEvent(s: AlertState, e: AlertEvent): AlertState {
  switch (e.kind) {
    case "escalated":
      // Only forward, only while open.
      if (s.state !== "open" || e.level <= s.level) return s;
      return { state: "open", subState: "escalated", level: e.level, dueAt: e.dueAt };
    case "acknowledged":
      // CA-6: the first acknowledgement wins.
      if (s.state !== "open") return s;
      if (e.via === "phone" && !e.loggedBy) return s; // CA-9: a phone acknowledgement names who logged it
      return {
        state: "acknowledged",
        level: s.level,
        at: e.at,
        by: e.by,
        via: e.via,
        loggedBy: e.loggedBy,
        response: e.response,
      };
    case "disputed":
      // CA-9: only the named clinician, only a phone acknowledgement; reopens at its level.
      if (s.state !== "acknowledged" || s.via !== "phone" || s.by !== e.by) return s;
      return {
        state: "open",
        subState: s.level === 0 ? "sent" : "escalated",
        level: s.level,
        dueAt: e.dueAt,
      };
    default:
      // created (handled by foldAlert), notified, seen, call_logged, could_not_reach, corrected: no change.
      return s;
  }
}

/** Replays an alert's events. The first must be `created`; a later `created` is ignored. */
export function foldAlert(events: readonly AlertEvent[]): AlertState | null {
  const [first, ...rest] = events;
  if (!first || first.kind !== "created") return null;
  const start: AlertState = {
    state: "open",
    subState: first.subState,
    level: first.level,
    dueAt: first.dueAt,
  };
  return rest.reduce(applyEvent, start);
}

// ─── Who may acknowledge (CA-6, D-LAB1-03) ───────────────────────────────

/** The cadres that may order tests (lib/emr/write/orders.ts ORDERING_CADRES = CLERKING_CADRE_CODES). */
const MAY_ORDER: ReadonlySet<string> = new Set(CLERKING_CADRE_CODES);

export interface Acknowledger {
  userId: string;
  hospitalId: string;
  cadreCode: string | null;
  active: boolean;
}

export function mayAcknowledge(actor: Acknowledger, alertHospitalId: string): boolean {
  return (
    actor.active &&
    actor.hospitalId === alertHospitalId &&
    actor.cadreCode !== null &&
    MAY_ORDER.has(actor.cadreCode)
  );
}

export type AckDecision =
  | { kind: "acknowledge"; event: Extract<AlertEvent, { kind: "acknowledged" }> }
  | { kind: "already"; state: Extract<AlertState, { state: "acknowledged" }> }
  | { kind: "refused"; reason: "may_not_acknowledge" };

/** CA-6, CA-7: acknowledge in the app. A second attempt returns the first, unchanged. */
export function decideAcknowledge(
  s: AlertState,
  actor: Acknowledger,
  alertHospitalId: string,
  input: { at: Date; response: ResponseCode | null },
): AckDecision {
  if (s.state === "acknowledged") return { kind: "already", state: s };
  if (!mayAcknowledge(actor, alertHospitalId))
    return { kind: "refused", reason: "may_not_acknowledge" };
  return {
    kind: "acknowledge",
    event: {
      kind: "acknowledged",
      at: input.at,
      by: actor.userId,
      via: "app",
      loggedBy: null,
      response: input.response,
    },
  };
}

/**
 * CA-9: a logged call. With read-back to a clinician who may acknowledge, the alert is acknowledged by
 * phone, naming them and the lab user who logged it. A call to anyone else changes nothing.
 */
export function logCall(
  s: AlertState,
  input: {
    at: Date;
    labUserId: string;
    to: Acknowledger;
    readBack: boolean;
    alertHospitalId: string;
  },
): AlertEvent[] {
  const call: AlertEvent = {
    kind: "call_logged",
    at: input.at,
    actorId: input.labUserId,
    to: input.to.userId,
    readBack: input.readBack,
  };
  if (s.state !== "open" || !input.readBack || !mayAcknowledge(input.to, input.alertHospitalId))
    return [call];
  return [
    call,
    {
      kind: "acknowledged",
      at: input.at,
      by: input.to.userId,
      via: "phone",
      loggedBy: input.labUserId,
      response: null,
    },
  ];
}

// ─── Corrections and the review lanes ────────────────────────────────────

/** CA-10: a correction goes to every recipient notified so far and to whoever acknowledged. */
export function correctionRecipients(events: readonly AlertEvent[]): string[] {
  const out = new Set<string>();
  for (const e of events) {
    if (e.kind === "notified") out.add(e.recipientId);
    if (e.kind === "acknowledged") out.add(e.by);
  }
  return [...out];
}

/** CA-12: a report with an open critical alert is never acknowledged in a batch. */
export function batchAcknowledgeable(
  reportIds: readonly string[],
  reportsWithOpenAlert: ReadonlySet<string>,
): string[] {
  return reportIds.filter((id) => !reportsWithOpenAlert.has(id));
}

// ─── CA-14: the invariants, checked over any state of the record ─────────

export interface AlertRecord {
  id: string;
  reportId: string;
  correctionOf?: string | null;
  events: AlertEvent[];
}

/** Every broken invariant, in words; empty when the record holds. */
export function alertInvariants(input: {
  alerts: readonly AlertRecord[];
  marks: readonly { alertId: string; reportId: string }[];
  releasedReportIds: ReadonlySet<string>;
  now: Date;
}): string[] {
  const broken: string[] = [];
  const byId = new Map(input.alerts.map((a) => [a.id, a]));
  for (const m of input.marks) {
    const a = byId.get(m.alertId);
    if (!a) broken.push(`mark without alert: ${m.alertId}`);
    else if (a.reportId !== m.reportId) broken.push(`mark on another report's alert: ${m.alertId}`);
  }
  const perReport = new Map<string, number>();
  for (const a of input.alerts) {
    if (!input.releasedReportIds.has(a.reportId))
      broken.push(`alert without released report: ${a.id}`);
    if (!a.correctionOf) perReport.set(a.reportId, (perReport.get(a.reportId) ?? 0) + 1);
    const s = foldAlert(a.events);
    if (!s) {
      broken.push(`alert without created event: ${a.id}`);
      continue;
    }
    const allowed =
      (s.state === "open" &&
        ["sent", "not_sent", "escalated"].includes(s.subState) &&
        s.level >= 0 &&
        s.level <= LAST_LEVEL) ||
      s.state === "acknowledged";
    if (!allowed) broken.push(`state outside CA-2: ${a.id}`);
    if (s.state === "open" && s.dueAt && s.dueAt <= input.now && s.level < LAST_LEVEL)
      broken.push(`overdue and not escalated: ${a.id}`);
  }
  for (const [reportId, n] of perReport)
    if (n > 1) broken.push(`${n} alerts on one report: ${reportId}`); // CA-1
  return broken;
}
