import "server-only";

import { and, asc, eq, gte, inArray, isNotNull, lt, lte, sql } from "drizzle-orm";

import { db } from "@/db";
import { clinicSessions } from "@/db/schema/clinic-sessions";
import { notificationDispatches, waitlistEntries } from "@/db/schema/notifications";
import { prescriptions } from "@/db/schema/prescribing";
import { appointments, queueEntries } from "@/db/schema/scheduling";
import { serviceLines } from "@/db/schema/service-lines";
import { logger } from "@/lib/logger";
import { DEFAULT_TIME_ZONE, startOfLocalDay } from "@/supabase/functions/_shared/slots";

/**
 * Reports (Gate H, PRD §3.4) — the six numbers a facility console shows, and
 * the one measure that judges the facility (§3.6).
 *
 * Every figure here is OPERATIONAL. It describes a clinic's access — how full
 * its days run, how often a held place goes unused, whether the arrival
 * window it promised meant anything — and never a patient. Nothing in this
 * module selects a name, a phone, a booking code or a patient id; every query
 * is a COUNT or a SUM grouped by hospital, line or session. Nothing in the
 * booking path imports it (tests/hospital-admin/reports-invariants.test.ts).
 *
 * Every metric carries its numerator, its denominator and the window it was
 * measured over, so the page can print the basis next to the number. A rate
 * whose denominator is under MIN_RATE_SAMPLE reports `share: null` — "too
 * few to report" — rather than a percentage that would mislead.
 *
 * The window is measured in the hospital's zone: from local midnight `days`
 * days ago (DEFAULT_TIME_ZONE, the same constant the rollup and scheduling
 * pages use) up to now.
 */

export const REPORT_WINDOWS = [7, 28, 90] as const;
export type ReportDays = (typeof REPORT_WINDOWS)[number];
export const DEFAULT_REPORT_DAYS: ReportDays = 28;

/** Below this many in the denominator a rate says "too few to report". */
export const MIN_RATE_SAMPLE = 20;

/**
 * §3.6 detector: a line where fewer than this share of called positions were
 * called inside the window the patient was told, over at least
 * MIN_RATE_SAMPLE called positions, is flagged "positions not honoured".
 * Half is the point at which the window is no better than a coin toss.
 */
export const POSITIONS_HONOURED_THRESHOLD = 0.5;

/**
 * A booking that was still held when its time came — the no-show
 * denominator. APPOINTMENT_STATUSES minus everything that released the place
 * before the day (requested, pending_approval, cancelled, rescheduled,
 * declined) and `void` (entered in error). `confirmed` with a past start is a
 * held booking nobody marked either way; it stays in the denominator and is
 * reported separately as `unmarked` so the blind spot is visible.
 */
export const HELD_PAST_STATUSES = [
  "confirmed",
  "arrived",
  "in_progress",
  "completed",
  "no_show",
] as const;

/** Clinic days that were, or are, offered — draft and cancelled days publish no capacity. */
const OFFERED_SESSION_STATUSES = ["published", "closed"] as const;

const DAY_MS = 86_400_000;

export interface ReportWindow {
  days: ReportDays;
  /** Local midnight `days` days ago, as an instant. */
  from: Date;
  /** Now. Past-only metrics also cut here. */
  to: Date;
}

/** `?days=` → one of REPORT_WINDOWS; anything else is the default. */
export function parseReportDays(raw: string | undefined): ReportDays {
  const n = Number(raw);
  return (REPORT_WINDOWS as readonly number[]).includes(n)
    ? (n as ReportDays)
    : DEFAULT_REPORT_DAYS;
}

export function reportWindow(days: ReportDays, now = new Date()): ReportWindow {
  return {
    days,
    from: startOfLocalDay(new Date(now.getTime() - days * DAY_MS), DEFAULT_TIME_ZONE),
    to: now,
  };
}

export interface Ratio {
  numerator: number;
  denominator: number;
  /** The sample the rate needs before it is printed. */
  minimum: number;
  /** numerator ÷ denominator, or null when the sample is below `minimum`. */
  share: number | null;
  window: ReportWindow;
}

export function ratio(numerator: number, denominator: number, window: ReportWindow): Ratio {
  return {
    numerator,
    denominator,
    minimum: MIN_RATE_SAMPLE,
    share: denominator >= MIN_RATE_SAMPLE ? numerator / denominator : null,
    window,
  };
}

/* ─── shapes ─────────────────────────────────────────────────────── */

/** The aggregates both pages show — per hospital, no per-line detail. */
export interface TenantAggregates {
  window: ReportWindow;
  /** booked_count ÷ ceil(capacity_booked × overbooking_factor), clinic days that have ended. */
  fillRate: Ratio;
  /** status = 'no_show' ÷ HELD_PAST_STATUSES bookings whose day (ends_at) has ended. */
  noShowRate: Ratio;
  /** Held past bookings still `confirmed` — nobody marked them arrived or no-show. */
  unmarked: number;
  /** called_at inside [arrival_window_start, arrival_window_end] ÷ called positions. */
  waitAccuracy: Ratio;
  /**
   * Session-mode bookings FOR clinic days starting in the window (any channel,
   * any outcome except void; the old row of a move is not a second request) —
   * the same days whose places `placesPublished` counts, so the two compare.
   */
  requests: number;
  /** waitlist_entries created in the window. */
  waitlistJoined: number;
  /** waitlist_entries in state 'waiting' right now, whenever created. */
  waitlistWaitingNow: number;
  /** ceil(capacity_booked × overbooking_factor) over offered clinic days starting in the window. */
  placesPublished: number;
  /** Held past bookings with reason = 'refill'. */
  refillVisits: number;
  /** prescriptions rows created in the window; null when the GATED table is absent. Not joined to visits. */
  prescriptionsWritten: number | null;
  /** SMS rows the provider reported a cost for, and what they cost. */
  sms: { messages: number; cost: number; currency: string | null };
}

export interface LineAggregates {
  serviceLineId: string;
  serviceLineName: string;
  fillRate: Ratio;
  waitAccuracy: Ratio;
  /** §3.6: true when waitAccuracy.share is known and below POSITIONS_HONOURED_THRESHOLD. */
  positionsNotHonoured: boolean;
}

export interface SessionAccuracy {
  sessionId: string;
  serviceLineName: string;
  startsAt: Date;
  waitAccuracy: Ratio;
}

export interface SentRow {
  kind: string;
  channel: string;
  count: number;
  cost: number;
  currency: string | null;
}

export interface HospitalReport extends TenantAggregates {
  perLine: LineAggregates[];
  /** Every session with at least one called position, worst share first. */
  perSession: SessionAccuracy[];
  /** Messages sent in the window by kind and channel — the SentTodayPanel's rows. */
  sent: SentRow[];
}

/* ─── the queries ────────────────────────────────────────────────── */

/**
 * The reads are written once, grouped by hospital_id, and take an optional
 * hospital filter: the facility page passes its scope, the superadmin rollup
 * passes nothing and gets every tenant. Neither page owns a query of its own.
 */

const num = (v: unknown) => Number(v) || 0;

/** ceil(capacity_booked × overbooking_factor) — the places a day offers, as the CHECK constraint counts them. */
const PLACES = sql`ceil(${clinicSessions.capacityBooked} * ${clinicSessions.overbookingFactor})`;

async function sessionAggregates(w: ReportWindow, hospitalId?: string) {
  const rows = await db
    .select({
      hospitalId: clinicSessions.hospitalId,
      booked: sql<string>`coalesce(sum(${clinicSessions.bookedCount}) filter (where ${clinicSessions.endsAt} <= ${w.to.toISOString()}), 0)`,
      placesPast: sql<string>`coalesce(sum(${PLACES}) filter (where ${clinicSessions.endsAt} <= ${w.to.toISOString()}), 0)`,
      places: sql<string>`coalesce(sum(${PLACES}), 0)`,
    })
    .from(clinicSessions)
    .where(
      and(
        hospitalId ? eq(clinicSessions.hospitalId, hospitalId) : undefined,
        inArray(clinicSessions.status, [...OFFERED_SESSION_STATUSES]),
        gte(clinicSessions.startsAt, w.from),
        lt(clinicSessions.startsAt, w.to),
      ),
    )
    .groupBy(clinicSessions.hospitalId);
  return rows.map((r) => ({
    hospitalId: r.hospitalId,
    booked: num(r.booked),
    placesPast: num(r.placesPast),
    places: num(r.places),
  }));
}

async function appointmentAggregates(w: ReportWindow, hospitalId?: string) {
  const from = w.from.toISOString();
  const to = w.to.toISOString();
  // "Past" is a day that has ENDED, the cut the fill rate uses: a session
  // booking's starts_at is the clinic day's start, so a day in progress is
  // full of positions not yet called and must not read as unmarked.
  const past = sql`${appointments.startsAt} >= ${from} and ${appointments.endsAt} <= ${to}`;
  const forDayInWindow = sql`${appointments.startsAt} >= ${from} and ${appointments.startsAt} < ${to}`;
  const held = sql`${appointments.status} in (${sql.join(
    HELD_PAST_STATUSES.map((s) => sql`${s}`),
    sql`, `,
  )})`;
  const rows = await db
    .select({
      hospitalId: appointments.hospitalId,
      noShow: sql<string>`count(*) filter (where ${appointments.status} = 'no_show' and ${past})`,
      held: sql<string>`count(*) filter (where ${held} and ${past})`,
      unmarked: sql<string>`count(*) filter (where ${appointments.status} = 'confirmed' and ${past})`,
      requests: sql<string>`count(*) filter (where ${appointments.sessionId} is not null and ${forDayInWindow} and ${appointments.status} not in ('void', 'rescheduled'))`,
      refillVisits: sql<string>`count(*) filter (where ${appointments.reason} = 'refill' and ${held} and ${past})`,
    })
    .from(appointments)
    .where(
      and(
        hospitalId ? eq(appointments.hospitalId, hospitalId) : undefined,
        gte(appointments.startsAt, w.from),
        lt(appointments.startsAt, w.to),
      ),
    )
    .groupBy(appointments.hospitalId);
  return rows.map((r) => ({
    hospitalId: r.hospitalId,
    noShow: num(r.noShow),
    held: num(r.held),
    unmarked: num(r.unmarked),
    requests: num(r.requests),
    refillVisits: num(r.refillVisits),
  }));
}

/**
 * The §3.6 measure. queue_entries.appointment_id is the join (written by
 * ha-mark-arrived; called_at by ha-start-encounter). Only session-mode
 * bookings carry a window (book.ts derives it from the position), so the
 * join goes through clinic_sessions at every grain. A patient who arrived
 * after their window had closed is left out of the denominator: the facility
 * never had the chance to honour that one, and this number is about the
 * facility.
 */
function waitAccuracyQuery(w: ReportWindow, hospitalId?: string) {
  return db
    .select({
      hospitalId: appointments.hospitalId,
      serviceLineId: clinicSessions.serviceLineId,
      serviceLineName: serviceLines.name,
      sessionId: clinicSessions.id,
      sessionStartsAt: clinicSessions.startsAt,
      inside: sql<string>`count(*) filter (where ${queueEntries.calledAt} >= ${appointments.arrivalWindowStart} and ${queueEntries.calledAt} <= ${appointments.arrivalWindowEnd})`,
      called: sql<string>`count(*)`,
    })
    .from(queueEntries)
    .innerJoin(appointments, eq(appointments.id, queueEntries.appointmentId))
    .innerJoin(clinicSessions, eq(clinicSessions.id, appointments.sessionId))
    .innerJoin(serviceLines, eq(serviceLines.id, clinicSessions.serviceLineId))
    .where(
      and(
        hospitalId ? eq(appointments.hospitalId, hospitalId) : undefined,
        isNotNull(queueEntries.calledAt),
        isNotNull(appointments.arrivalWindowStart),
        isNotNull(appointments.arrivalWindowEnd),
        lte(queueEntries.arrivedAt, appointments.arrivalWindowEnd),
        gte(appointments.startsAt, w.from),
        lt(appointments.startsAt, w.to),
      ),
    )
    .groupBy(
      appointments.hospitalId,
      clinicSessions.serviceLineId,
      serviceLines.name,
      clinicSessions.id,
      clinicSessions.startsAt,
    )
    .orderBy(asc(clinicSessions.startsAt));
}

async function waitAccuracyRows(w: ReportWindow, hospitalId?: string) {
  const rows = await waitAccuracyQuery(w, hospitalId);
  return rows.map((r) => ({ ...r, inside: num(r.inside), called: num(r.called) }));
}

async function waitlistAggregates(w: ReportWindow, hospitalId?: string) {
  const rows = await db
    .select({
      hospitalId: waitlistEntries.hospitalId,
      joined: sql<string>`count(*) filter (where ${waitlistEntries.createdAt} >= ${w.from.toISOString()} and ${waitlistEntries.createdAt} < ${w.to.toISOString()})`,
      waitingNow: sql<string>`count(*) filter (where ${waitlistEntries.state} = 'waiting')`,
    })
    .from(waitlistEntries)
    .where(
      and(
        hospitalId ? eq(waitlistEntries.hospitalId, hospitalId) : undefined,
        sql`(${waitlistEntries.createdAt} >= ${w.from.toISOString()} or ${waitlistEntries.state} = 'waiting')`,
      ),
    )
    .groupBy(waitlistEntries.hospitalId);
  return rows.map((r) => ({
    hospitalId: r.hospitalId,
    joined: num(r.joined),
    waitingNow: num(r.waitingNow),
  }));
}

/**
 * prescriptions (migration 0039) is GATED and may not exist where this runs;
 * a missing relation is reported as null, not as zero. The table hangs off
 * encounters, not appointments — a refill VISIT and a prescription WRITTEN
 * are two counts side by side, never one joined figure.
 */
async function prescriptionAggregates(
  w: ReportWindow,
  hospitalId?: string,
): Promise<Map<string, number> | null> {
  try {
    const rows = await db
      .select({ hospitalId: prescriptions.hospitalId, written: sql<string>`count(*)` })
      .from(prescriptions)
      .where(
        and(
          hospitalId ? eq(prescriptions.hospitalId, hospitalId) : undefined,
          gte(prescriptions.createdAt, w.from),
          lt(prescriptions.createdAt, w.to),
        ),
      )
      .groupBy(prescriptions.hospitalId);
    return new Map(rows.map((r) => [r.hospitalId, num(r.written)]));
  } catch (e) {
    logger.warn("hospital-admin.reports.prescriptions_unavailable", { reason: String(e) });
    return null;
  }
}

/**
 * What left the dispatcher in the window, by hospital, kind and channel,
 * with the cost the provider reported per message. The scheduling page's
 * "Sent today" is this with `from` = local midnight.
 */
export async function sentBreakdown(from: Date, to: Date, hospitalId?: string) {
  const rows = await db
    .select({
      hospitalId: notificationDispatches.hospitalId,
      kind: notificationDispatches.kind,
      channel: notificationDispatches.channel,
      count: sql<number>`count(*)::int`,
      cost: sql<string>`coalesce(sum(${notificationDispatches.costAmount}), 0)`,
      currency: sql<string | null>`max(${notificationDispatches.costCurrency})`,
    })
    .from(notificationDispatches)
    .where(
      and(
        hospitalId ? eq(notificationDispatches.hospitalId, hospitalId) : undefined,
        inArray(notificationDispatches.state, ["sent", "delivered"]),
        gte(notificationDispatches.sentAt, from),
        lt(notificationDispatches.sentAt, to),
      ),
    )
    .groupBy(
      notificationDispatches.hospitalId,
      notificationDispatches.kind,
      notificationDispatches.channel,
    )
    .orderBy(asc(notificationDispatches.kind), asc(notificationDispatches.channel));
  return rows.map((r) => ({ ...r, cost: Number(r.cost) }));
}

/* ─── assembly ───────────────────────────────────────────────────── */

const zeroTenant = (w: ReportWindow): TenantAggregates => ({
  window: w,
  fillRate: ratio(0, 0, w),
  noShowRate: ratio(0, 0, w),
  unmarked: 0,
  waitAccuracy: ratio(0, 0, w),
  requests: 0,
  waitlistJoined: 0,
  waitlistWaitingNow: 0,
  placesPublished: 0,
  refillVisits: 0,
  prescriptionsWritten: null,
  sms: { messages: 0, cost: 0, currency: null },
});

type Parts = Awaited<ReturnType<typeof fetchParts>>;

async function fetchParts(w: ReportWindow, hospitalId?: string) {
  const [sessions, appts, waits, waitlist, rx, sent] = await Promise.all([
    sessionAggregates(w, hospitalId),
    appointmentAggregates(w, hospitalId),
    waitAccuracyRows(w, hospitalId),
    waitlistAggregates(w, hospitalId),
    prescriptionAggregates(w, hospitalId),
    sentBreakdown(w.from, w.to, hospitalId),
  ]);
  return { sessions, appts, waits, waitlist, rx, sent };
}

function assemble(w: ReportWindow, p: Parts): Map<string, TenantAggregates> {
  const out = new Map<string, TenantAggregates>();
  const at = (id: string) => {
    let t = out.get(id);
    if (!t) out.set(id, (t = zeroTenant(w)));
    return t;
  };

  for (const s of p.sessions) {
    const t = at(s.hospitalId);
    t.fillRate = ratio(s.booked, s.placesPast, w);
    t.placesPublished = s.places;
  }
  for (const a of p.appts) {
    const t = at(a.hospitalId);
    t.noShowRate = ratio(a.noShow, a.held, w);
    t.unmarked = a.unmarked;
    t.requests = a.requests;
    t.refillVisits = a.refillVisits;
  }
  const acc = new Map<string, { inside: number; called: number }>();
  for (const r of p.waits) {
    const c = acc.get(r.hospitalId) ?? { inside: 0, called: 0 };
    acc.set(r.hospitalId, { inside: c.inside + r.inside, called: c.called + r.called });
  }
  for (const [id, c] of acc) at(id).waitAccuracy = ratio(c.inside, c.called, w);
  for (const l of p.waitlist) {
    const t = at(l.hospitalId);
    t.waitlistJoined = l.joined;
    t.waitlistWaitingNow = l.waitingNow;
  }
  if (p.rx) {
    for (const t of out.values()) t.prescriptionsWritten = 0;
    for (const [id, n] of p.rx) at(id).prescriptionsWritten = n;
  }
  for (const s of p.sent) {
    if (!s.hospitalId || s.channel !== "sms") continue;
    const t = at(s.hospitalId);
    t.sms = {
      messages: t.sms.messages + s.count,
      cost: t.sms.cost + s.cost,
      currency: t.sms.currency ?? s.currency,
    };
  }
  return out;
}

/**
 * The per-hospital aggregates, keyed by hospital_id — the superadmin rollup's
 * read. Every hospital with any row in the window; one with nothing is simply
 * absent. Counts and rates only: nothing here names a patient.
 */
export async function fetchTenantAggregates(
  w: ReportWindow,
): Promise<Map<string, TenantAggregates>> {
  return assemble(w, await fetchParts(w));
}

/** The facility page: the aggregates plus the per-line and per-session detail. */
export async function fetchHospitalReport(
  hospitalId: string,
  w: ReportWindow,
): Promise<HospitalReport> {
  const [parts, lineSessions] = await Promise.all([
    fetchParts(w, hospitalId),
    // Per line: the day's places, and the bookings that held one.
    db
      .select({
        serviceLineId: clinicSessions.serviceLineId,
        serviceLineName: serviceLines.name,
        booked: sql<string>`coalesce(sum(${clinicSessions.bookedCount}) filter (where ${clinicSessions.endsAt} <= ${w.to.toISOString()}), 0)`,
        placesPast: sql<string>`coalesce(sum(${PLACES}) filter (where ${clinicSessions.endsAt} <= ${w.to.toISOString()}), 0)`,
      })
      .from(clinicSessions)
      .innerJoin(serviceLines, eq(serviceLines.id, clinicSessions.serviceLineId))
      .where(
        and(
          eq(clinicSessions.hospitalId, hospitalId),
          inArray(clinicSessions.status, [...OFFERED_SESSION_STATUSES]),
          gte(clinicSessions.startsAt, w.from),
          lt(clinicSessions.startsAt, w.to),
        ),
      )
      .groupBy(clinicSessions.serviceLineId, serviceLines.name)
      .orderBy(asc(serviceLines.name)),
  ]);
  const { waits, sent } = parts;

  const byLine = new Map<string, LineAggregates>();
  for (const r of lineSessions) {
    byLine.set(r.serviceLineId, {
      serviceLineId: r.serviceLineId,
      serviceLineName: r.serviceLineName,
      fillRate: ratio(num(r.booked), num(r.placesPast), w),
      waitAccuracy: ratio(0, 0, w),
      positionsNotHonoured: false,
    });
  }
  const lineWait = new Map<string, { inside: number; called: number }>();
  for (const r of waits) {
    const c = lineWait.get(r.serviceLineId) ?? { inside: 0, called: 0 };
    lineWait.set(r.serviceLineId, { inside: c.inside + r.inside, called: c.called + r.called });
    if (!byLine.has(r.serviceLineId)) {
      byLine.set(r.serviceLineId, {
        serviceLineId: r.serviceLineId,
        serviceLineName: r.serviceLineName,
        fillRate: ratio(0, 0, w),
        waitAccuracy: ratio(0, 0, w),
        positionsNotHonoured: false,
      });
    }
  }
  for (const [id, c] of lineWait) {
    const line = byLine.get(id)!;
    line.waitAccuracy = ratio(c.inside, c.called, w);
    line.positionsNotHonoured =
      line.waitAccuracy.share !== null && line.waitAccuracy.share < POSITIONS_HONOURED_THRESHOLD;
  }

  const perSession: SessionAccuracy[] = waits
    .map((r) => ({
      sessionId: r.sessionId,
      serviceLineName: r.serviceLineName,
      startsAt: r.sessionStartsAt,
      waitAccuracy: ratio(r.inside, r.called, w),
    }))
    // Worst share first; a session too small to rate sorts after every rated one.
    .sort((a, b) => (a.waitAccuracy.share ?? 2) - (b.waitAccuracy.share ?? 2));

  const base = assemble(w, parts).get(hospitalId) ?? zeroTenant(w);
  // The table answered: a hospital with no prescription rows has written zero, not "unknown".
  if (parts.rx) base.prescriptionsWritten = parts.rx.get(hospitalId) ?? 0;

  return {
    ...base,
    perLine: Array.from(byLine.values()).sort((a, b) =>
      a.serviceLineName.localeCompare(b.serviceLineName),
    ),
    perSession,
    sent: sent.map(({ kind, channel, count, cost, currency }) => ({
      kind,
      channel,
      count,
      cost,
      currency,
    })),
  };
}
