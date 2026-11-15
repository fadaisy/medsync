import "server-only";

import type { CsData, CsUser, Version } from "./fixture";
import type { Band, Change, Clinic, Exception, Snapshot, Weekday } from "./model";
import { and, asc, eq, gte, inArray, isNull, lte, ne, sql } from "drizzle-orm";

import { db } from "@/db";
import { clinicSessions, sessionTemplates } from "@/db/schema/clinic-sessions";
import { staffAffiliations } from "@/db/schema/clinician-profiles";
import {
  hospitalFeeBands,
  hospitalHolidayDecisions,
  scheduleChanges,
  schedulePublishJobs,
  scheduleVersions,
} from "@/db/schema/clinics-schedule";
import { hospitalDepartments } from "@/db/schema/hospital-departments";
import { deskDevices } from "@/db/schema/reception-desk";
import { cadres } from "@/db/schema/reference-data";
import { availabilityBlocks } from "@/db/schema/scheduling";
import { serviceLines } from "@/db/schema/service-lines";
import {
  capabilityValues,
  hospitalPlaces,
  publicHolidays,
  serviceClosures,
} from "@/db/schema/services-hub";
import { users } from "@/db/schema/users";
import { DEFAULT_TIME_ZONE } from "@/supabase/functions/_shared/slots";
import { BANDS, emptySnapshot } from "./model";

const ymd = (d: Date) =>
  new Intl.DateTimeFormat("en-CA", { timeZone: DEFAULT_TIME_ZONE }).format(d);
const eatMin = (d: Date) => {
  const p = new Intl.DateTimeFormat("en-GB", {
    timeZone: DEFAULT_TIME_ZONE,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
  const [h = 0, m = 0] = p.split(":").map(Number);
  return (h % 24) * 60 + m;
};
const hhmm = (s: string) => {
  const [h = 0, m = 0] = s.split(":").map(Number);
  return h * 60 + m;
};
const band = (b: string | null): Band => (BANDS.includes(b as Band) ? (b as Band) : "mo");

/** The workspace's data from the engine's own records (CS3: these ARE the published version) plus the draft log. */
export async function loadClinicsSchedule(scope: {
  hospitalId: string;
  hospitalName: string;
  level: string;
  userId: string;
}): Promise<CsData> {
  const H = scope.hospitalId;
  const now = new Date();
  const today = ymd(now);
  const yearOn = ymd(new Date(now.getTime() + 366 * 86_400_000));

  const [
    depts,
    lines,
    tpls,
    places,
    staff,
    devs,
    blocks,
    closures,
    decisions,
    fees,
    hols,
    changes,
    versions,
    jobs,
    booked,
    hours,
  ] = await Promise.all([
    db
      .select()
      .from(hospitalDepartments)
      .where(and(eq(hospitalDepartments.hospitalId, H), isNull(hospitalDepartments.archivedAt))),
    db
      .select()
      .from(serviceLines)
      .where(and(eq(serviceLines.hospitalId, H), isNull(serviceLines.archivedAt))),
    db
      .select()
      .from(sessionTemplates)
      .where(
        and(
          eq(sessionTemplates.hospitalId, H),
          eq(sessionTemplates.active, true),
          sql`(${sessionTemplates.validUntil} IS NULL OR ${sessionTemplates.validUntil} >= ${today})`,
        ),
      ),
    db
      .select()
      .from(hospitalPlaces)
      .where(and(eq(hospitalPlaces.hospitalId, H), isNull(hospitalPlaces.archivedAt))),
    db
      .select({ a: staffAffiliations, name: users.fullName, cadre: cadres.name })
      .from(staffAffiliations)
      .innerJoin(users, eq(users.id, staffAffiliations.userId))
      .leftJoin(cadres, eq(cadres.id, staffAffiliations.cadreId))
      .where(
        and(
          eq(staffAffiliations.hospitalId, H),
          inArray(staffAffiliations.state, ["approved", "active"]),
        ),
      ),
    db.select().from(deskDevices).where(eq(deskDevices.hospitalId, H)),
    db
      .select()
      .from(availabilityBlocks)
      .where(
        and(
          eq(availabilityBlocks.hospitalId, H),
          eq(availabilityBlocks.kind, "leave"),
          gte(availabilityBlocks.endsAt, now),
          inArray(availabilityBlocks.state, ["active", "requested"]),
        ),
      ),
    db
      .select()
      .from(serviceClosures)
      .where(
        and(
          eq(serviceClosures.hospitalId, H),
          isNull(serviceClosures.liftedAt),
          gte(serviceClosures.endsOn, today),
        ),
      ),
    db.select().from(hospitalHolidayDecisions).where(eq(hospitalHolidayDecisions.hospitalId, H)),
    db.select().from(hospitalFeeBands).where(eq(hospitalFeeBands.hospitalId, H)),
    db
      .select()
      .from(publicHolidays)
      .where(and(gte(publicHolidays.holidayDate, today), lte(publicHolidays.holidayDate, yearOn)))
      .orderBy(asc(publicHolidays.holidayDate)),
    db
      .select()
      .from(scheduleChanges)
      .where(
        and(
          eq(scheduleChanges.hospitalId, H),
          inArray(scheduleChanges.status, ["draft", "scheduled", "published"]),
        ),
      )
      .orderBy(asc(scheduleChanges.createdAt)),
    db
      .select()
      .from(scheduleVersions)
      .where(eq(scheduleVersions.hospitalId, H))
      .orderBy(asc(scheduleVersions.number)),
    db
      .select()
      .from(schedulePublishJobs)
      .where(and(eq(schedulePublishJobs.hospitalId, H), eq(schedulePublishJobs.status, "waiting"))),
    db
      .select({
        id: clinicSessions.templateId,
        n: sql<number>`coalesce(sum(${clinicSessions.bookedCount}), 0)::int`,
      })
      .from(clinicSessions)
      .where(
        and(
          eq(clinicSessions.hospitalId, H),
          gte(clinicSessions.startsAt, now),
          ne(clinicSessions.status, "cancelled"),
        ),
      )
      .groupBy(clinicSessions.templateId),
    db
      .select({ v: capabilityValues.value })
      .from(capabilityValues)
      .where(and(eq(capabilityValues.hospitalId, H), eq(capabilityValues.key, "opd_hours"))),
  ]);

  const s: Snapshot = emptySnapshot();
  const personByUser = new Map(staff.map((r) => [r.a.userId, r.a.id]));

  for (const p of places)
    s.places[p.id] = {
      id: p.id,
      kind: p.kind === "block" ? "block" : "room",
      name: p.name,
      parentId: p.parentId,
      tier: (p.tier as "general" | "private" | null) ?? null,
    };

  for (const c of lines) {
    const pay = (c.payOptions ?? {}) as Partial<Clinic["pay"]> & { when?: Clinic["payWhen"] };
    s.clinics[c.id] = {
      id: c.id,
      name: c.name,
      shortName: c.shortName ?? "",
      colour: c.colour ?? "",
      departmentId: c.departmentId,
      blockId: c.blockPlaceId,
      roomIds: c.roomPlaceIds ?? (c.placeId ? [c.placeId] : []),
      tier: (c.tier as Clinic["tier"]) ?? "general",
      ages: c.ages === "children" ? "children" : "all",
      words: c.patientWords ?? "",
      referral: c.referralRequired ?? false,
      confidential: c.confidential,
      feeMode: (c.feeMode as Clinic["feeMode"]) ?? (c.feeUgx != null ? "flat" : null),
      feeUgx: c.feeUgx,
      feePrivateUgx: c.feePrivateUgx,
      feeOverrides: (c.feeOverrides ?? {}) as Clinic["feeOverrides"],
      rules: (c.bookingRules ?? {}) as Clinic["rules"],
      pay: { cash: pay.cash ?? true, mtn: pay.mtn ?? false, airtel: pay.airtel ?? false },
      payWhen: pay.when ?? "arrive",
      team: (c.teamUserIds ?? []).map((u) => personByUser.get(u)).filter((x): x is string => !!x),
      live: c.active,
      paused: !!c.pausedAt,
      code: c.catalogueCode,
      mode: c.capacityMode as Clinic["mode"],
      timeToCareDays: c.timeToCareDays,
      continuity: c.continuityDefault,
      reasons: c.reasonCodes,
      isDefault: c.isDefault,
      posture: c.paymentPosture as Clinic["posture"],
      depositUgx: c.depositUgx,
    };
  }

  const exceptions: Record<string, Exception> = {};
  for (const t of tpls) {
    if (!t.serviceLineId) continue;
    const ids = (
      t.clinicianUserIds?.length ? t.clinicianUserIds : t.clinicianUserId ? [t.clinicianUserId] : []
    )
      .map((u) => personByUser.get(u))
      .filter((x): x is string => !!x);
    const rooms = t.placeIds?.length ? t.placeIds : t.placeId ? [t.placeId] : [];
    // A one-day template is an extra session (exceptionOps writes it so).
    if (t.validFrom && t.validFrom === t.validUntil) {
      exceptions[t.id] = {
        id: t.id,
        type: "extra",
        from: t.validFrom,
        to: t.validFrom,
        part: null,
        clinicIds: [t.serviceLineId],
        personId: null,
        coverId: null,
        policy: "offer",
        reason: "",
        extra: {
          clinicId: t.serviceLineId,
          start: t.startMinutesLocal,
          end: t.startMinutesLocal + t.durationMinutes,
          places: t.capacityTotal,
          personIds: ids,
          roomIds: rooms,
        },
      };
      continue;
    }
    s.sessions[t.id] = {
      id: t.id,
      clinicId: t.serviceLineId,
      weekday: t.weekday as Weekday,
      start: t.startMinutesLocal,
      end: t.startMinutesLocal + t.durationMinutes,
      kind: t.kind === "times" ? "times" : "day",
      slotMin: t.slotMinutes ?? 15,
      visitMin: t.visitMinutes ?? 15,
      places: t.placesSet ? t.capacityTotal : null,
      holdPct: ([0, 10, 20, 30].includes(t.walkInHoldPct ?? 0) ? (t.walkInHoldPct ?? 0) : 0) as
        | 0
        | 10
        | 20
        | 30,
      brk:
        t.breakStartMinutes != null && t.breakEndMinutes != null
          ? { start: t.breakStartMinutes, end: t.breakEndMinutes }
          : null,
      every: t.repeatEveryWeeks === 2 ? 2 : 1,
      nth: t.nthWeekday === 1 ? 1 : null,
      roomIds: rooms,
      personIds: ids,
      interleave: { booked: t.interleaveBooked, walkIn: t.interleaveWalkIn },
      overbook: Number(t.overbookingFactor),
      holidays: t.runsOnHolidays,
    };
  }

  for (const r of staff) {
    const a = r.a;
    s.people[a.id] = {
      id: a.id,
      name: r.name,
      role: r.cadre ?? "",
      cadre: (r.cadre ?? "").toLowerCase(),
      band: band(a.feeBand),
      departmentId: a.departmentId,
      officeId: a.officePlaceId,
      showName: a.cardName ?? false,
      showPhoto: a.cardPhoto ?? false,
      consentOn: a.cardConsentOn,
      consentBy: a.cardConsentBy,
      userId: a.userId,
    };
  }

  for (const v of devs)
    s.devices[v.id] = {
      id: v.id,
      kind: v.kind === "tablet" || v.kind === "screen" ? v.kind : "desk",
      name: v.label,
      place: v.place ?? "",
      clinicIds: v.mineServiceLineIds ?? [],
      lockMin: ([5, 10, 15].includes(v.lockMinutes ?? 0) ? v.lockMinutes : null) as
        | 5
        | 10
        | 15
        | null,
      lastSeen: v.lastSeenAt?.toISOString() ?? null,
      online: !!v.lastSeenAt && now.getTime() - v.lastSeenAt.getTime() < 5 * 60_000,
    };

  for (const b of blocks) {
    const pid = b.clinicianUserId ? personByUser.get(b.clinicianUserId) : undefined;
    if (!pid) continue;
    const from = ymd(b.startsAt);
    const to = ymd(new Date(b.endsAt.getTime() - 1));
    if (b.state === "requested") {
      s.leave[b.id] = {
        id: b.id,
        personId: pid,
        from,
        to,
        am: eatMin(b.endsAt) <= 13 * 60,
        reason: b.notes ?? "",
        sentAt: ymd(b.createdAt),
        status: "new",
      };
      continue;
    }
    const whole = eatMin(b.startsAt) === 0 && eatMin(b.endsAt) === 0;
    exceptions[b.id] = {
      id: b.id,
      type: "away",
      from,
      to,
      part: whole ? null : { start: eatMin(b.startsAt), end: eatMin(b.endsAt) },
      clinicIds: "all",
      personId: pid,
      coverId: b.coverUserId ? (personByUser.get(b.coverUserId) ?? null) : null,
      policy: b.bookingPolicy === "call" ? "call" : "offer",
      reason: b.notes ?? "",
      extra: null,
    };
  }

  for (const c of closures)
    exceptions[c.id] = {
      id: c.id,
      type: "closed",
      from: c.startsOn,
      to: c.endsOn,
      part:
        c.partStartMinutes != null && c.partEndMinutes != null
          ? { start: c.partStartMinutes, end: c.partEndMinutes }
          : null,
      clinicIds: c.scope === "hospital" ? "all" : c.serviceLineId ? [c.serviceLineId] : [],
      personId: null,
      coverId: null,
      policy: c.bookingPolicy === "call" ? "call" : "offer",
      reason: c.reason,
      extra: null,
    };
  s.exceptions = exceptions;

  for (const d of decisions)
    s.holidays[String(d.holidayId)] = {
      id: String(d.holidayId),
      decision: d.decision === "open" ? "open" : "closed",
      rowId: d.id,
    };
  for (const f of fees)
    if (BANDS.includes(f.band as Band))
      s.bands[f.band] = {
        id: f.band as Band,
        general: f.generalUgx,
        private: f.privateUgx,
        rowId: f.id,
        approved: !!f.approvedBy,
      };

  // Authors' names and the admins who may draft or publish.
  const authorIds = [
    ...new Set([
      ...changes.map((c) => c.author),
      ...versions.map((v) => v.publishedBy),
      scope.userId,
    ]),
  ];
  const named = authorIds.length
    ? await db
        .select({ id: users.id, name: users.fullName })
        .from(users)
        .where(inArray(users.id, authorIds))
    : [];
  const names = Object.fromEntries(named.map((u) => [u.id, u.name]));

  const asChange = (c: (typeof changes)[number]): Change => ({
    id: c.id,
    summary: c.summary,
    author: c.author,
    at: c.createdAt.toISOString(),
    edits: c.edits as Change["edits"],
  });
  const job = jobs[0];
  const vlist: Version[] = versions.map((v) => ({
    number: v.number,
    at: v.publishedAt.toISOString(),
    by: v.publishedBy,
    textsSent: v.textsSent,
    changes: changes.filter((c) => c.versionId === v.id).map(asChange),
  }));

  // X2: the Hub's opening hours (opd_hours), Monday's span; null when unset.
  const opd = (hours[0]?.v ?? null) as Record<string, { from: string; to: string }[]> | null;
  const span = opd ? Object.values(opd).flat() : [];
  const me: CsUser = { id: scope.userId, name: names[scope.userId] ?? "", can: "publish" };

  return {
    fixture: false,
    hospitalName: scope.hospitalName,
    level: scope.level,
    today,
    departments: Object.fromEntries(
      depts.map((d) => [d.id, { name: d.name, live: !!d.medsyncLiveAt }]),
    ),
    published: s,
    drafts: changes.filter((c) => c.status === "draft").map(asChange),
    versions: vlist,
    job: job
      ? {
          id: job.id,
          runAt: job.runAt.toISOString(),
          by: job.author,
          changes: changes.filter((c) => c.jobId === job.id).map(asChange),
        }
      : null,
    booked: Object.fromEntries(booked.filter((b) => b.id).map((b) => [b.id!, b.n])),
    holidays: hols.map((h) => ({
      id: String(h.id),
      date: h.holidayDate,
      name: h.name,
      provisional: h.provisional,
    })),
    hours: span.length
      ? {
          open: Math.min(...span.map((x) => hhmm(x.from))),
          close: Math.max(...span.map((x) => hhmm(x.to))),
        }
      : null,
    // D-CS-18: the per-text rate is configuration (CLINICS_SMS_UNIT_UGX); unset, the publish dialog says so.
    unitCost:
      Number(process.env.CLINICS_SMS_UNIT_UGX) > 0
        ? Number(process.env.CLINICS_SMS_UNIT_UGX)
        : null,
    bookingUrl: "",
    user: me,
    users: [me],
    names,
  };
}
