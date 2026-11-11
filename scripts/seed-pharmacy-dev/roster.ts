/**
 * Dev seed for Set-up › People and roster (PEOPLE-ROSTER.md; PROMPT-ROSTER step 2): about eight weeks of pharmacy
 * roster with every state the tab shows — gaps and unwitnessed shifts, one rest break, swaps pending, accepted,
 * approved, declined and expired, leave pending and approved, one expired and one expiring licence, late and absent
 * sign-ins, a delegation, published past weeks. Built with the tab's own Fill gaps, so every rule holds unless a row
 * is a deliberate break. Local and dev only; never imported by the app. Runs once per hospital.
 *
 * ponytail: it needs the pharmacy in-charge (a head of the pharmacy department) and at least three more staff, and a
 * store and a dispensing point. Licence numbers are invented samples.
 */
import type { Cadre, Duty } from "@/lib/pharmacy/derive/roster";
import { sql } from "drizzle-orm";

import { addDays, fillGaps, ROSTER_DEFAULTS, weekStart } from "@/lib/pharmacy/derive/roster";

/** A uuid[] literal: drizzle spreads a JS array into a parameter list. */
const uuids = (xs: readonly string[]) => `{${xs.join(",")}}`;

type Db = { execute: (q: ReturnType<typeof sql>) => Promise<unknown> };
const rows = <T>(r: unknown): T[] =>
  (Array.isArray(r) ? r : ((r as { rows?: T[] }).rows ?? [])) as T[];
const CADRES: Cadre[] = [
  "pharmacist",
  "technician",
  "pharmacist",
  "store_keeper",
  "technician",
  "dispenser",
];

export async function seedRoster(db: Db, hospitalId: string) {
  const h = sql`${hospitalId}::uuid`;
  const one = async <T>(q: ReturnType<typeof sql>) => rows<T>(await db.execute(q))[0];
  if (
    (
      await one<{ ok: boolean }>(
        sql`SELECT to_regclass('public.pharmacy_roster_people') IS NOT NULL AS ok`,
      )
    )?.ok !== true
  )
    return { skipped: "apply 0273 first" };
  if (
    (
      await one<{ n: number }>(
        sql`SELECT count(*)::int AS n FROM public.pharmacy_roster_people WHERE hospital_id = ${h}`,
      )
    )?.n
  )
    return { skipped: "already seeded" };
  const staff = rows<{ user_id: string; boss: boolean }>(
    await db.execute(sql`
      SELECT user_id, private.pharmacy_can_user(user_id, ${h}, 'pharmacy.manage') AS boss
        FROM public.staff_affiliations WHERE hospital_id = ${h} AND state IN ('approved','active')
       GROUP BY user_id ORDER BY boss DESC, min(created_at) LIMIT 7`),
  );
  const boss = staff.find((s) => s.boss)?.user_id;
  const others = staff.filter((s) => s.user_id !== boss).map((s) => s.user_id);
  if (!boss || others.length < 3)
    return { skipped: "needs the pharmacy in-charge and three more staff" };
  const places = rows<{ id: string; kind: "store" | "dispensing_point" }>(
    await db.execute(sql`SELECT DISTINCT ON (kind) id, kind FROM public.pharmacy_locations WHERE hospital_id = ${h}
      AND kind IN ('store','dispensing_point') AND switched_off_at IS NULL ORDER BY kind, name`),
  );
  if (places.length < 2) return { skipped: "needs a store and a dispensing point" };
  const placeList = places.map((p) => ({
    id: p.id,
    name: p.kind,
    kind: p.kind,
    shifts: p.kind === "store" ? (["day", "call"] as const) : (["day"] as const),
  }));
  const today = new Date(Date.now() + 3 * 3_600_000).toISOString().slice(0, 10);
  const all = placeList.map((p) => p.id);
  const ids = [boss, ...others];
  const people = ids.map((userId, i) => ({
    userId,
    name: userId,
    cadre: CADRES[i % CADRES.length]!,
    places:
      CADRES[i % CADRES.length] === "store_keeper"
        ? [places.find((p) => p.kind === "store")!.id]
        : all,
    licence: null as null | { body: "PSU" | "AHPC"; number: string; expiresOn: string },
  }));

  for (const [i, p] of people.entries()) {
    await db.execute(sql`INSERT INTO public.pharmacy_roster_people (hospital_id, user_id, cadre, places, added_by)
      VALUES (${h}, ${p.userId}::uuid, ${p.cadre}, ${uuids(p.places)}::uuid[], ${boss}::uuid)`);
    if (p.cadre === "store_keeper") continue;
    // The last licensed person's licence lapsed a few days ago; the second-to-last expires in 17 days.
    const expiresOn =
      i === people.length - 1
        ? addDays(today, -3)
        : i === people.length - 2
          ? addDays(today, 17)
          : addDays(today, 400);
    p.licence = {
      body: p.cadre === "pharmacist" ? "PSU" : "AHPC",
      number: `${p.cadre === "pharmacist" ? "PSU/P" : "AHPC/T"}/${1000 + i}`,
      expiresOn,
    };
    // Recorded as of eight weeks ago, so the past weeks seed under a then-current licence.
    await db.execute(sql`INSERT INTO public.pharmacy_staff_licences (hospital_id, user_id, body, number, expires_on, recorded_by)
      VALUES (${h}, ${p.userId}::uuid, ${p.licence.body}, ${p.licence.number},
        ${i === people.length - 1 ? addDays(today, 400) : expiresOn}::date, ${boss}::uuid)`);
  }

  // Eight weeks back to next week, filled by the tab's own rules; a few slots left open for gaps.
  const R: Duty[] = [];
  const thisWeek = weekStart(today);
  for (let w = -8; w <= 1; w++) {
    const start = addDays(thisWeek, w * 7);
    const f = fillGaps(R, { people, leaves: [], params: ROSTER_DEFAULTS }, start, start, placeList);
    if (!f.over) R.push(...f.added.filter((_, k) => !(w >= 0 && k % 9 === 4)));
  }
  // The lapsed licence: a renewal-less record now ends their rostering from three days ago.
  const lapsed = people.at(-1)!;
  const kept = R.filter((d) => !(d.userId === lapsed.userId && d.date > addDays(today, -3)));
  for (const d of kept)
    await db.execute(sql`INSERT INTO public.pharmacy_duty_roster (hospital_id, user_id, location_id, role, shift, date_from, date_to, created_by)
      VALUES (${h}, ${d.userId}::uuid, ${d.placeId}::uuid, 'technician', ${d.shift}, ${d.date}::date, ${d.date}::date, ${boss}::uuid)
      ON CONFLICT DO NOTHING`);
  await db.execute(sql`INSERT INTO public.pharmacy_staff_licences (hospital_id, user_id, body, number, expires_on, recorded_by)
    VALUES (${h}, ${lapsed.userId}::uuid, ${lapsed.licence?.body ?? "AHPC"}, ${lapsed.licence?.number ?? "AHPC/T/1"},
      ${addDays(today, -3)}::date, ${boss}::uuid)`);

  // One deliberate rest break: a colleague on day every day this week (more than 6), where a slot has room.
  for (let k = 0; k < 7; k++)
    try {
      await db.execute(sql`INSERT INTO public.pharmacy_duty_roster (hospital_id, user_id, location_id, role, shift, date_from, date_to, created_by)
        VALUES (${h}, ${others[1]}::uuid, ${placeList[1]!.id}::uuid, 'technician', 'day', ${addDays(thisWeek, k)}::date,
          ${addDays(thisWeek, k)}::date, ${boss}::uuid)`);
    } catch {
      // Full, or already on: that day stays as it is.
    }
  // Eid, gazetted each year: the prototype's estimates, unconfirmed until the owner confirms them.
  for (const [day, name] of [
    ["2027-03-10", "Eid al-Fitr"],
    ["2027-05-17", "Eid al-Adha"],
  ])
    await db.execute(sql`INSERT INTO public.public_holidays (holiday_date, name, kind, provisional, source, verified_on)
      VALUES (${day}::date, ${name}, 'movable', true, 'dev seed', now()::date) ON CONFLICT DO NOTHING`);

  // Past weeks published.
  for (let w = -8; w <= -1; w++)
    await db.execute(sql`INSERT INTO public.pharmacy_roster_week_events (hospital_id, week_start, action, actor_id)
      VALUES (${h}, ${addDays(thisWeek, w * 7)}::date, 'publish', ${boss}::uuid)`);

  // Sign-ins this week up to today: most on time, one late, one absent.
  const dayDuties = kept.filter((d) => d.shift === "day" && d.date >= thisWeek && d.date <= today);
  for (const [k, d] of dayDuties.entries()) {
    if (k % 7 === 3) continue;
    const at = `${d.date} ${k % 7 === 5 ? "08:24" : "07:52"}:00+03`;
    await db.execute(sql`INSERT INTO public.pharmacy_shift_attendance (hospital_id, user_id, location_id, duty_date, shift, signed_in_at, device_id)
      VALUES (${h}, ${d.userId}::uuid, ${d.placeId}::uuid, ${d.date}::date, 'day', ${at}::timestamptz, 'dev-seed') ON CONFLICT DO NOTHING`);
  }

  // Leave: one pending (study, short notice), one approved (annual, next week).
  const [p1, p2, p3] = others as [string, string, string];
  await db.execute(sql`INSERT INTO public.pharmacy_staff_leave (hospital_id, user_id, kind, date_from, date_to, reason, late)
    VALUES (${h}, ${p1}::uuid, 'study', ${addDays(today, 2)}::date, ${addDays(today, 2)}::date, 'Continuing professional development course', true)`);
  const lv = await one<{
    id: string;
  }>(sql`INSERT INTO public.pharmacy_staff_leave (hospital_id, user_id, kind, date_from, date_to, reason)
    VALUES (${h}, ${p3}::uuid, 'annual', ${addDays(thisWeek, 7)}::date, ${addDays(thisWeek, 11)}::date, 'Family visit') RETURNING id`);
  await db.execute(sql`UPDATE public.pharmacy_staff_leave SET status = 'approved', decided_by = ${boss}::uuid, decided_at = now()
    WHERE id = ${lv!.id}::uuid`);

  // Swaps: one waiting for the colleague, one waiting for the in-charge, one declined, one approved.
  const future = kept.filter((d) => d.date > today && d.shift === "day");
  const pick = (u: string, not?: string) => future.find((d) => d.userId === u && d.date !== not);
  const ask = async (
    from: string,
    to: string,
    d: Duty | undefined,
    then: [string, string, string | null][],
  ) => {
    if (!d) return;
    const free = !kept.some((x) => x.userId === to && x.date === d.date && x.shift === d.shift);
    if (!free) return;
    const r = await one<{
      id: string;
    }>(sql`INSERT INTO public.pharmacy_roster_requests (hospital_id, from_user, to_user, kind, give_date, give_place, give_shift, reason)
      VALUES (${h}, ${from}::uuid, ${to}::uuid, 'cover', ${d.date}::date, ${d.placeId}::uuid, ${d.shift}, 'Family function upcountry') RETURNING id`);
    for (const [actor, action, note] of [[from, "asked", null] as [string, string, null], ...then])
      await db.execute(sql`INSERT INTO public.pharmacy_roster_request_events (request_id, actor_id, action, note)
        VALUES (${r!.id}::uuid, ${actor}::uuid, ${action}, ${note})`);
  };
  await ask(p1, p2, pick(p1), []);
  await ask(p2, p1, pick(p2), [[p1, "accepted", null]]);
  await ask(boss, p2, pick(boss), [[p2, "declined", "I am at the regional stock review that day"]]);
  await ask(p2, p3, pick(p2, pick(p2)?.date), [
    [p3, "accepted", null],
    [boss, "approved", null],
  ]);

  // A delegation: the first colleague makes the dispensing point's roster until the end of next month.
  await db.execute(sql`INSERT INTO public.pharmacy_roster_delegations (hospital_id, from_user, to_user, places, until)
    VALUES (${h}, ${boss}::uuid, ${p1}::uuid, ${uuids([places.find((p) => p.kind === "dispensing_point")!.id])}::uuid[],
      ${addDays(today, 30)}::date)`);
  return { people: people.length, duties: kept.length };
}
