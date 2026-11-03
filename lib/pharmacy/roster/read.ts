import "server-only";

import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type {
  Cadre,
  Delegation,
  Duty,
  Leave,
  LocalNow,
  Person,
  Place,
  PlaceKind,
  RequestStatus,
  Shift,
} from "@/lib/pharmacy/derive/roster";
import type { SignedRule } from "@/lib/pharmacy/rules/registry";
import { sql } from "drizzle-orm";

import { rowsOf } from "@/lib/pharmacy/audit/read";
import { addDays, canEditPlace, canPublish, weekStart } from "@/lib/pharmacy/derive/roster";
import { rosterParams, ruleNumbers } from "@/lib/pharmacy/rules/registry";

/**
 * Set-up › People and roster: one read of everything the tab and the actions need, for the shown week. Duties cover
 * five weeks back (the load table) to two weeks on (the swap form's "this week and the next"); the month view asks
 * with its own range. Before 0273 is applied every 0273 table reads as empty (`ready: false`).
 */
type Exec = EmrDb | EmrTx;
const SHIFTS_OF: Record<PlaceKind, Shift[]> = {
  store: ["day", "call"],
  dispensing_point: ["day"],
  ward: ["day", "night", "call"],
  clinic: ["day"],
};
export const kampalaNow = (now: Date): LocalNow => {
  const t = new Date(now.getTime() + 3 * 3_600_000);
  return { date: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
};

export interface RosterPerson extends Person {
  avatarPath: string | null;
  phone: string | null;
  rowId: string;
}
export interface RosterDuty extends Duty {
  id: string;
}
export interface RosterRequest {
  id: string;
  fromUser: string;
  toUser: string;
  kind: "cover" | "swap";
  give: { placeId: string; date: string; shift: Shift };
  take: { placeId: string; date: string; shift: Shift } | null;
  reason: string | null;
  status: RequestStatus;
  events: { actor: string; action: string; note: string | null; at: string }[];
}
export interface RosterLeave extends Leave {
  kind: "annual" | "day_off" | "study" | "sick";
  reason: string | null;
  late: boolean;
  decidedBy: string | null;
  decidedAt: string | null;
  note: string | null;
  createdAt: string;
}
export interface RosterDelegation extends Delegation {
  id: string;
  fromUser: string;
  createdAt: string;
  revokedAt: string | null;
}

export async function loadRosterWorld(
  db: Exec,
  hospitalId: string,
  viewerId: string,
  inCharge: boolean,
  shownDate: string,
  nowDate: Date,
  range?: { from: string; to: string },
) {
  const now = kampalaNow(nowDate);
  const start = weekStart(shownDate);
  const from = range?.from ?? addDays(start, -28);
  const to = range?.to ?? addDays(start, 13);
  const h = sql`${hospitalId}::uuid`;
  const [ready] = rowsOf<{ ok: boolean }>(
    await db.execute(sql`SELECT to_regclass('public.pharmacy_roster_people') IS NOT NULL AS ok`),
  );
  const q = async <T>(query: ReturnType<typeof sql>) =>
    ready?.ok ? rowsOf<T>(await db.execute(query)) : [];

  const [
    places,
    people,
    licences,
    duties,
    leaves,
    requests,
    events,
    dels,
    weeks,
    attendance,
    reminders,
    hols,
    rules,
    props,
  ] = await Promise.all([
    rowsOf<{ id: string; name: string; kind: string }>(
      await db.execute(sql`
          SELECT id, name, kind FROM public.pharmacy_locations
           WHERE hospital_id = ${h} AND switched_off_at IS NULL AND kind IN ('store','dispensing_point','ward')
           ORDER BY CASE kind WHEN 'store' THEN 0 WHEN 'dispensing_point' THEN 1 ELSE 2 END, name`),
    ),
    q<{
      id: string;
      user_id: string;
      cadre: Cadre;
      places: string[];
      name: string | null;
      avatar_path: string | null;
      phone: string | null;
    }>(sql`
        SELECT p.id, p.user_id, p.cadre, p.places, coalesce(u.full_name, u.email) AS name, u.avatar_path, u.phone
          FROM public.pharmacy_roster_people p JOIN public.users u ON u.id = p.user_id
         WHERE p.hospital_id = ${h} AND p.ended_at IS NULL ORDER BY name`),
    q<{ user_id: string; body: "PSU" | "AHPC"; number: string; expires_on: string }>(sql`
        SELECT DISTINCT ON (user_id) user_id, body, number, expires_on::text FROM public.pharmacy_staff_licences
         WHERE hospital_id = ${h} ORDER BY user_id, recorded_at DESC`),
    rowsOf<{ id: string; user_id: string; location_id: string; date: string; shift: Shift }>(
      await db.execute(sql`
          SELECT id, user_id, location_id, date_from::text AS date, shift FROM public.pharmacy_duty_roster
           WHERE hospital_id = ${h} AND ended_at IS NULL AND date_from = date_to AND location_id IS NOT NULL
             AND date_from BETWEEN ${from}::date AND ${to}::date`),
    ),
    q<Record<string, unknown>>(sql`
        SELECT id, user_id, kind, date_from::text AS "from", date_to::text AS "to", status, reason, late, note,
               decided_by, decided_at::text AS decided_at, created_at::text AS created_at
          FROM public.pharmacy_staff_leave WHERE hospital_id = ${h} AND date_to >= ${addDays(now.date, -60)}::date
         ORDER BY created_at DESC`),
    q<Record<string, unknown>>(sql`
        SELECT id, from_user, to_user, kind, give_date::text, give_place, give_shift, take_date::text, take_place,
               take_shift, reason, status
          FROM public.pharmacy_roster_requests
         WHERE hospital_id = ${h} AND (status IN ('colleague','incharge') OR created_at > now() - interval '45 days')
         ORDER BY created_at DESC LIMIT 200`),
    q<{
      request_id: string;
      actor_id: string;
      action: string;
      note: string | null;
      at: string;
    }>(sql`
        SELECT e.request_id, e.actor_id, e.action, e.note, e.at::text FROM public.pharmacy_roster_request_events e
          JOIN public.pharmacy_roster_requests r ON r.id = e.request_id
         WHERE r.hospital_id = ${h} AND (r.status IN ('colleague','incharge') OR r.created_at > now() - interval '45 days')
         ORDER BY e.at`),
    q<{
      id: string;
      from_user: string;
      to_user: string;
      places: string[];
      until: string | null;
      can_publish: boolean;
      created_at: string;
      revoked_at: string | null;
    }>(sql`
        SELECT id, from_user, to_user, places, until::text, can_publish, created_at::text, revoked_at::text
          FROM public.pharmacy_roster_delegations WHERE hospital_id = ${h} ORDER BY created_at DESC LIMIT 40`),
    q<{
      week_start: string;
      action: "publish" | "unlock";
      actor_id: string;
      at: string;
      reason: string | null;
    }>(sql`
        SELECT DISTINCT ON (week_start) week_start::text, action, actor_id, at::text, reason
          FROM public.pharmacy_roster_week_events
         WHERE hospital_id = ${h} AND week_start BETWEEN ${weekStart(from)}::date AND ${to}::date
         ORDER BY week_start, at DESC`),
    q<{ user_id: string; duty_date: string; shift: Shift; min: number }>(sql`
        SELECT user_id, duty_date::text, shift,
               (extract(epoch FROM (signed_in_at AT TIME ZONE 'Africa/Kampala') - duty_date::timestamp) / 60)::int AS min
          FROM public.pharmacy_shift_attendance
         WHERE hospital_id = ${h} AND duty_date BETWEEN ${from}::date AND ${to}::date`),
    q<{
      eve_on: boolean;
      eve_time: string;
      change_on: boolean;
      unpub_on: boolean;
      lic_on: boolean;
    }>(sql`
        SELECT eve_on, eve_time, change_on, unpub_on, lic_on FROM public.pharmacy_roster_reminders
         WHERE hospital_id = ${h} ORDER BY set_at DESC LIMIT 1`),
    q<{ day: string; name: string; confirmed: boolean }>(sql`
        SELECT day::text, name, confirmed FROM public.public_holidays
         WHERE day BETWEEN ${addDays(from, -366)}::date AND ${addDays(to, 366)}::date`),
    rowsOf<SignedRule>(
      await db.execute(sql`
          SELECT rule_group, key, text, ${ready?.ok ? sql`params` : sql`NULL::jsonb AS params`}
            FROM public.pharmacy_rules WHERE hospital_id = ${h} AND product_id IS NULL`),
    ),
    rowsOf<Record<string, string | null>>(
      await db.execute(sql`
        SELECT p.id, p.rule_group, p.key, p.new_text, p.reason, p.proposed_by,
               (SELECT coalesce(u.full_name, u.email) FROM public.pharmacy_rule_signatures s
                  LEFT JOIN public.users u ON u.id = s.signed_by WHERE s.proposal_id = p.id AND s.role = 'in_charge') AS ic,
               (SELECT coalesce(u.full_name, u.email) FROM public.pharmacy_rule_signatures s
                  LEFT JOIN public.users u ON u.id = s.signed_by WHERE s.proposal_id = p.id AND s.role = 'second') AS sec
          FROM public.pharmacy_rule_proposals p
         WHERE p.hospital_id = ${h} AND p.status = 'pending'
           AND (p.rule_group IN ('roster', 'swap') OR p.rule_group LIKE 'rb!_%' ESCAPE '!')
         ORDER BY p.proposed_at`),
    ),
  ]);

  const lic = new Map(
    licences.map((l) => [l.user_id, { body: l.body, number: l.number, expiresOn: l.expires_on }]),
  );
  const rosterPeople: RosterPerson[] = people.map((p) => ({
    rowId: p.id,
    userId: p.user_id,
    name: p.name ?? "",
    cadre: p.cadre,
    places: p.places,
    licence: lic.get(p.user_id) ?? null,
    avatarPath: p.avatar_path,
    phone: p.phone,
  }));
  const rosterPlaces: Place[] = places.map((p) => {
    const kind = p.kind as PlaceKind;
    return { id: p.id, name: p.name, kind, shifts: SHIFTS_OF[kind] };
  });
  const byReq = new Map<string, RosterRequest["events"]>();
  for (const e of events)
    byReq.set(e.request_id, [
      ...(byReq.get(e.request_id) ?? []),
      { actor: e.actor_id, action: e.action, note: e.note, at: e.at },
    ]);
  const delegations: RosterDelegation[] = dels.map((d) => ({
    id: d.id,
    fromUser: d.from_user,
    toUser: d.to_user,
    places: d.places,
    until: d.until,
    canPublish: d.can_publish,
    createdAt: d.created_at,
    revokedAt: d.revoked_at,
  }));
  const liveDels = delegations.filter((d) => !d.revokedAt);
  const actor = { userId: viewerId, inCharge };
  const placeById = new Map(rosterPlaces.map((p) => [p.id, p]));
  const publishedWeeks = weeks.filter((w) => w.action === "publish").map((w) => w.week_start);
  const params = rosterParams(ruleNumbers(rules));
  const r = reminders[0];

  return {
    ready: ready?.ok === true,
    now,
    weekStart: start,
    range: { from, to },
    params,
    rules,
    proposals: props.map((p) => ({
      id: p.id!,
      group: p.rule_group!,
      key: p.key!,
      newText: p.new_text!,
      reason: p.reason!,
      productId: null,
      inCharge: p.ic ?? null,
      second: p.sec ?? null,
      proposedBy: p.proposed_by!,
    })),
    inCharge,
    viewerId,
    places: rosterPlaces,
    people: rosterPeople,
    duties: duties.map((d): Omit<RosterDuty, "placeId"> & { placeId: string } => ({
      id: d.id,
      userId: d.user_id,
      placeId: d.location_id,
      date: d.date,
      shift: d.shift,
    })),
    leaves: leaves.map(
      (l): RosterLeave => ({
        id: String(l.id),
        userId: String(l.user_id),
        kind: l.kind as RosterLeave["kind"],
        from: String(l.from),
        to: String(l.to),
        status: l.status as RosterLeave["status"],
        reason: (l.reason as string | null) ?? null,
        late: l.late === true,
        note: (l.note as string | null) ?? null,
        decidedBy: (l.decided_by as string | null) ?? null,
        decidedAt: (l.decided_at as string | null) ?? null,
        createdAt: String(l.created_at),
      }),
    ),
    requests: requests.map(
      (x): RosterRequest => ({
        id: String(x.id),
        fromUser: String(x.from_user),
        toUser: String(x.to_user),
        kind: x.kind as RosterRequest["kind"],
        give: {
          placeId: String(x.give_place),
          date: String(x.give_date),
          shift: x.give_shift as Shift,
        },
        take: x.take_date
          ? {
              placeId: String(x.take_place),
              date: String(x.take_date),
              shift: x.take_shift as Shift,
            }
          : null,
        reason: (x.reason as string | null) ?? null,
        status: x.status as RequestStatus,
        events: byReq.get(String(x.id)) ?? [],
      }),
    ),
    delegations,
    publishedWeeks,
    weekPublished: publishedWeeks.includes(start),
    attendance: attendance.map((a) => ({
      userId: a.user_id,
      date: a.duty_date,
      shift: a.shift,
      min: a.min,
    })),
    reminders: r
      ? {
          eveOn: r.eve_on,
          eveTime: r.eve_time,
          changeOn: r.change_on,
          unpubOn: r.unpub_on,
          licOn: r.lic_on,
        }
      : { eveOn: true, eveTime: "18:00", changeOn: true, unpubOn: true, licOn: true },
    gazetted: hols,
    canEdit: (placeId: string) => {
      const p = placeById.get(placeId);
      return !!p && canEditPlace(actor, p, liveDels, now.date);
    },
    canPublish: canPublish(actor, liveDels, now.date),
  };
}
export type RosterWorld = Awaited<ReturnType<typeof loadRosterWorld>>;
