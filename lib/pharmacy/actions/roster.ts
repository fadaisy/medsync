import "server-only";

import type { Shift } from "@/lib/pharmacy/derive/roster";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { dayLabel, ROSTER_REFUSAL, SHIFT } from "@/content/pharmacy-roster";
import { EmrWriteError } from "@/lib/emr/write/context";
import { blindIndex, encrypt } from "@/lib/encryption";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { addDays, fillGaps, SHIFT_START, weekStart } from "@/lib/pharmacy/derive/roster";
import { e164 } from "@/lib/pharmacy/epi/store";
import { loadRosterWorld } from "@/lib/pharmacy/roster/read";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Set-up › People and roster, the server actions (PEOPLE-ROSTER.md §18). Every rule that can be is enforced by the
 * 0273 guards (who makes the roster, locks, leave, licences, room, swap order); these actions add the checks the
 * database cannot see (rest rules for fill gaps, the actor's own request) and queue the staff SMS. Each write is
 * audited by the tables' audit triggers.
 */
const NEED: PharmacyNeed = { permission: "pharmacy.view", point: "none" };
const ShiftZ = z.enum(["day", "night", "call"]);
const Slot = z.object({ placeId: z.uuid(), date: z.iso.date(), shift: ShiftZ });
type Ctx = PharmacyCtx;

const kampala = (now: Date) => {
  const t = new Date(now.getTime() + 3 * 3_600_000);
  return { date: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
};
const one = async <T>(ctx: Ctx, q: ReturnType<typeof sql>) => rowsOf<T>(await ctx.tx.execute(q))[0];
const must = (ok: unknown, msg: string) => {
  if (!ok) throw new EmrWriteError("forbidden", msg);
};
const roleOf = (cadre: string) => (cadre === "dispenser" ? "technician" : cadre);

async function insertDuty(ctx: Ctx, userId: string, s: z.infer<typeof Slot>, id?: string) {
  const h = ctx.actor.hospitalId;
  const p = await one<{ cadre: string }>(
    ctx,
    sql`SELECT cadre FROM public.pharmacy_roster_people WHERE hospital_id = ${h}::uuid AND user_id = ${userId}::uuid
         AND ended_at IS NULL`,
  );
  must(p, ROSTER_REFUSAL.notHere);
  const clash = await one<{ id: string }>(
    ctx,
    sql`SELECT id FROM public.pharmacy_duty_roster WHERE hospital_id = ${h}::uuid AND user_id = ${userId}::uuid
         AND date_from = ${s.date}::date AND date_to = ${s.date}::date AND shift = ${s.shift} AND ended_at IS NULL`,
  );
  if (clash) throw new EmrWriteError("conflict", ROSTER_REFUSAL.already(s.shift));
  const row = await one<{ id: string }>(
    ctx,
    sql`INSERT INTO public.pharmacy_duty_roster (id, hospital_id, user_id, location_id, role, shift, date_from, date_to,
          created_by)
        VALUES (coalesce(${id ?? null}::uuid, gen_random_uuid()), ${h}::uuid, ${userId}::uuid, ${s.placeId}::uuid,
          ${roleOf(p!.cadre)}, ${s.shift}, ${s.date}::date, ${s.date}::date, ${ctx.actor.userId}::uuid)
        RETURNING id`,
  );
  return row!.id;
}

async function endDuty(ctx: Ctx, dutyId: string) {
  const row = await one<{
    id: string;
    user_id: string;
    location_id: string;
    date: string;
    shift: Shift;
  }>(
    ctx,
    sql`UPDATE public.pharmacy_duty_roster SET ended_at = ${ctx.now.toISOString()}::timestamptz,
          ended_by = ${ctx.actor.userId}::uuid
         WHERE id = ${dutyId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid AND ended_at IS NULL
           AND date_from = date_to
        RETURNING id, user_id, location_id, date_from::text AS date, shift`,
  );
  must(row, ROSTER_REFUSAL.requestMoved);
  return row!;
}

// ─── Staff SMS (§13), through the Messages queue ───────────────────────────
type StaffRule = "staff_eve" | "staff_change" | "staff_unpub" | "staff_licence";
const REMINDER_COL: Record<StaffRule, string> = {
  staff_eve: "eve_on",
  staff_change: "change_on",
  staff_unpub: "unpub_on",
  staff_licence: "lic_on",
};
/** Queues one SMS when that reminder is on (default on) and the person has a phone; opt-outs are skipped. */
export async function queueStaffSms(
  ctx: Ctx,
  rule: StaffRule,
  userId: string,
  refKey: string,
  body: string,
) {
  const h = ctx.actor.hospitalId;
  const set = await one<Record<string, boolean>>(
    ctx,
    sql`SELECT eve_on, change_on, unpub_on, lic_on FROM public.pharmacy_roster_reminders
         WHERE hospital_id = ${h}::uuid ORDER BY set_at DESC LIMIT 1`,
  );
  if (set && set[REMINDER_COL[rule]] === false) return false;
  const u = await one<{ phone: string | null; name: string | null }>(
    ctx,
    sql`SELECT phone, full_name AS name FROM public.users WHERE id = ${userId}::uuid`,
  );
  if (!u?.phone) return false;
  let phone: string;
  try {
    phone = e164(u.phone);
  } catch {
    return false;
  }
  const hmac = blindIndex(phone);
  const out = await one<{ x: number }>(
    ctx,
    sql`SELECT 1 AS x FROM public.pharmacy_sms_optouts WHERE hospital_id = ${h}::uuid AND phone_hmac = ${hmac}`,
  );
  await ctx.tx.execute(sql`
    INSERT INTO public.pharmacy_sms_messages (hospital_id, day, rule, ref_key, recipient, phone_encrypted, phone_hmac,
      lang, body, status, failure)
    VALUES (${h}::uuid, ${kampala(ctx.now).date}::date, ${rule}, ${refKey.slice(0, 120)}, ${(u.name ?? "Staff").slice(0, 120)},
      ${encrypt(phone)}, ${hmac}, 'en', ${body.slice(0, 160)}, ${out ? "skipped" : "scheduled"},
      ${out ? "Opted out" : null})
    ON CONFLICT (hospital_id, day, ref_key) DO NOTHING`);
  return true;
}
const published = async (ctx: Ctx, date: string) =>
  (
    await one<{ p: boolean }>(
      ctx,
      sql`SELECT private.pharmacy_week_published(${ctx.actor.hospitalId}::uuid, ${date}::date) AS p`,
    )
  )?.p === true;
const placeName = async (ctx: Ctx, id: string) =>
  (
    await one<{ name: string }>(
      ctx,
      sql`SELECT name FROM public.pharmacy_locations WHERE id = ${id}::uuid`,
    )
  )?.name ?? "";
async function toldOfChange(
  ctx: Ctx,
  userId: string,
  s: z.infer<typeof Slot>,
  on: boolean,
  ref: string,
) {
  if (!(await published(ctx, s.date))) return;
  const place = await placeName(ctx, s.placeId);
  const body = on
    ? `MedSync: you are now on ${SHIFT[s.shift].label} shift, ${dayLabel(s.date)}, at ${place}, ${SHIFT[s.shift].time.replace(", by phone", "")}.`
    : `MedSync: you are no longer on ${SHIFT[s.shift].label} shift, ${dayLabel(s.date)}, at ${place}.`;
  await queueStaffSms(ctx, "staff_change", userId, `staff_change:${ref}:${userId}`, body);
}

// ─── Slots ─────────────────────────────────────────────────────────────────
export const AssignInput = Slot.extend({ clientKey: z.uuid(), userId: z.uuid() });
export const assignToSlot = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(AssignInput, raw, actor, NEED, async (ctx, i) => {
    const id = await insertDuty(ctx, i.userId, i, i.clientKey);
    await toldOfChange(ctx, i.userId, i, true, id);
    return { id };
  });

export const DutyInput = z.object({ dutyId: z.uuid() });
export const removeFromSlot = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(DutyInput, raw, actor, NEED, async (ctx, i) => {
    const d = await endDuty(ctx, i.dutyId);
    await toldOfChange(
      ctx,
      d.user_id,
      { placeId: d.location_id, date: d.date, shift: d.shift },
      false,
      d.id,
    );
    return { id: d.id };
  });

export const MoveInput = Slot.extend({ dutyId: z.uuid(), clientKey: z.uuid() });
export const moveBetweenSlots = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(MoveInput, raw, actor, NEED, async (ctx, i) => {
    const d = await endDuty(ctx, i.dutyId);
    const id = await insertDuty(ctx, d.user_id, i, i.clientKey);
    await toldOfChange(ctx, d.user_id, i, true, id);
    return { id };
  });

export const WeekInput = z.object({ weekStart: z.iso.date() });
/** Last week's pharmacy duties a week on, where the slot is free and the guard allows; the rest are left open. */
export const copyLastWeek = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(WeekInput, raw, actor, NEED, async (ctx, i) => {
    const start = weekStart(i.weekStart);
    const prev = rowsOf<{ user_id: string; location_id: string; date: string; shift: Shift }>(
      await ctx.tx.execute(sql`
        SELECT r.user_id, r.location_id, r.date_from::text AS date, r.shift FROM public.pharmacy_duty_roster r
          JOIN public.pharmacy_locations l ON l.id = r.location_id AND l.kind IN ('store','dispensing_point')
         WHERE r.hospital_id = ${ctx.actor.hospitalId}::uuid AND r.ended_at IS NULL AND r.date_from = r.date_to
           AND r.date_from BETWEEN ${addDays(start, -7)}::date AND ${addDays(start, -1)}::date`),
    );
    let copied = 0;
    for (const d of prev) {
      try {
        await ctx.tx.transaction(async (sp) => {
          await insertDuty({ ...ctx, tx: sp }, d.user_id, {
            placeId: d.location_id,
            date: addDays(d.date, 7),
            shift: d.shift,
          });
        });
        copied++;
      } catch {
        // Left open: the guard refused (leave, licence, full, already on); Fill gaps or a person decides.
      }
    }
    return { id: start, copied, left: prev.length - copied };
  });

/** §8: the server works the fill out again on the real roster, then writes it in one go. */
export const applyFillGaps = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(WeekInput, raw, actor, NEED, async (ctx, i) => {
    const start = weekStart(i.weekStart);
    const w = await loadRosterWorld(
      ctx.tx,
      ctx.actor.hospitalId,
      ctx.actor.userId,
      ctx.manages,
      start,
      ctx.now,
    );
    const editable = w.places.filter((p) => w.canEdit(p.id));
    must(editable.length, ROSTER_REFUSAL.viewOnly);
    must(!w.weekPublished, ROSTER_REFUSAL.locked);
    const r = fillGaps(
      w.duties,
      { people: w.people, leaves: w.leaves, params: w.params },
      start,
      w.now.date,
      editable,
    );
    if (r.over) return { id: start, over: true, added: 0, left: 0 };
    for (const d of r.added) await insertDuty(ctx, d.userId, d);
    return { id: start, over: false, added: r.added.length, left: r.left };
  });

// ─── Publishing ────────────────────────────────────────────────────────────
export const UnlockInput = WeekInput.extend({ reason: z.string().trim().min(2).max(300) });
const weekEvent = (ctx: Ctx, start: string, action: "publish" | "unlock", reason: string | null) =>
  one<{ id: string }>(
    ctx,
    sql`INSERT INTO public.pharmacy_roster_week_events (hospital_id, week_start, action, reason, actor_id)
        VALUES (${ctx.actor.hospitalId}::uuid, ${weekStart(start)}::date, ${action}, ${reason}, ${ctx.actor.userId}::uuid)
        RETURNING id`,
  );
export const publishWeek = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(WeekInput, raw, actor, NEED, async (ctx, i) => ({
    id: (await weekEvent(ctx, i.weekStart, "publish", null))!.id,
  }));
export const unlockWeek = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(UnlockInput, raw, actor, NEED, async (ctx, i) => ({
    id: (await weekEvent(ctx, i.weekStart, "unlock", i.reason))!.id,
  }));

// ─── Who makes the roster (§5) ─────────────────────────────────────────────
export const HandOverInput = z.object({
  toUser: z.uuid(),
  places: z.array(z.uuid()).max(40),
  until: z.iso.date().nullable(),
  canPublish: z.boolean(),
});
export const handOver = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(HandOverInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, ROSTER_REFUSAL.inChargeOnly);
    const h = ctx.actor.hospitalId;
    // One handover per person: a new one replaces the old one.
    await ctx.tx.execute(sql`
      UPDATE public.pharmacy_roster_delegations SET revoked_at = ${ctx.now.toISOString()}::timestamptz,
        revoked_by = ${ctx.actor.userId}::uuid
       WHERE hospital_id = ${h}::uuid AND to_user = ${i.toUser}::uuid AND revoked_at IS NULL`);
    const row = await one<{ id: string }>(
      ctx,
      sql`INSERT INTO public.pharmacy_roster_delegations (hospital_id, from_user, to_user, places, until, can_publish)
          VALUES (${h}::uuid, ${ctx.actor.userId}::uuid, ${i.toUser}::uuid, ${i.places}::uuid[], ${i.until}::date,
            ${i.places.length === 0 && i.canPublish})
          RETURNING id`,
    );
    return { id: row!.id };
  });
export const TakeBackInput = z.object({ delegationId: z.uuid() });
export const takeBack = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(TakeBackInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, ROSTER_REFUSAL.inChargeOnly);
    const row = await one<{ id: string }>(
      ctx,
      sql`UPDATE public.pharmacy_roster_delegations SET revoked_at = ${ctx.now.toISOString()}::timestamptz,
            revoked_by = ${ctx.actor.userId}::uuid
           WHERE id = ${i.delegationId}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid AND revoked_at IS NULL
          RETURNING id`,
    );
    must(row, ROSTER_REFUSAL.requestMoved);
    return { id: row!.id };
  });

// ─── Swaps (§6) ────────────────────────────────────────────────────────────
export const AskSwapInput = z
  .object({
    clientKey: z.uuid(),
    toUser: z.uuid(),
    kind: z.enum(["cover", "swap"]),
    give: Slot,
    take: Slot.nullable(),
    reason: z.string().trim().max(300).nullable(),
  })
  .refine((v) => (v.kind === "swap") === (v.take !== null));
export const askSwap = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(AskSwapInput, raw, actor, NEED, async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    const row = await one<{ id: string }>(
      ctx,
      sql`INSERT INTO public.pharmacy_roster_requests (id, hospital_id, from_user, to_user, kind, give_date, give_place,
            give_shift, take_date, take_place, take_shift, reason)
          VALUES (${i.clientKey}::uuid, ${h}::uuid, ${ctx.actor.userId}::uuid, ${i.toUser}::uuid, ${i.kind},
            ${i.give.date}::date, ${i.give.placeId}::uuid, ${i.give.shift}, ${i.take?.date ?? null}::date,
            ${i.take?.placeId ?? null}::uuid, ${i.take?.shift ?? null}, ${i.reason || null})
          ON CONFLICT (id) DO NOTHING RETURNING id`,
    );
    if (!row) return { id: i.clientKey };
    // Only your own shift, not started, and no request already pending on it.
    const mine = await one<{ x: number }>(
      ctx,
      sql`SELECT 1 AS x FROM public.pharmacy_duty_roster WHERE hospital_id = ${h}::uuid AND user_id = ${ctx.actor.userId}::uuid
           AND location_id = ${i.give.placeId}::uuid AND date_from = ${i.give.date}::date AND date_to = date_from
           AND shift = ${i.give.shift} AND ended_at IS NULL`,
    );
    must(mine, ROSTER_REFUSAL.requestMoved);
    const now = kampala(ctx.now);
    must(
      i.give.date > now.date || (i.give.date === now.date && now.min < SHIFT_START[i.give.shift]),
      ROSTER_REFUSAL.requestMoved,
    );
    const open = await one<{ n: number }>(
      ctx,
      sql`SELECT count(*)::int AS n FROM public.pharmacy_roster_requests WHERE hospital_id = ${h}::uuid
           AND from_user = ${ctx.actor.userId}::uuid AND give_date = ${i.give.date}::date
           AND give_place = ${i.give.placeId}::uuid AND give_shift = ${i.give.shift}
           AND status IN ('colleague','incharge')`,
    );
    must(open!.n === 1, ROSTER_REFUSAL.requestMoved);
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_roster_request_events (request_id, actor_id, action)
      VALUES (${row.id}::uuid, ${ctx.actor.userId}::uuid, 'asked')`);
    return { id: row.id };
  });

export const RequestActInput = z.object({
  requestId: z.uuid(),
  action: z.enum(["accepted", "declined", "approved", "rejected", "withdrawn"]),
  note: z.string().trim().max(300).nullable(),
});
export const actOnSwap = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(RequestActInput, raw, actor, NEED, async (ctx, i) => {
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_roster_request_events (request_id, actor_id, action, note)
      VALUES (${i.requestId}::uuid, ${ctx.actor.userId}::uuid, ${i.action}, ${i.note || null})`);
    if (i.action === "approved") {
      const r = await one<{
        from_user: string;
        to_user: string;
        give_date: string;
        give_place: string;
        give_shift: Shift;
        take_date: string | null;
        take_place: string | null;
        take_shift: Shift | null;
      }>(
        ctx,
        sql`SELECT from_user, to_user, give_date::text, give_place, give_shift, take_date::text, take_place, take_shift
              FROM public.pharmacy_roster_requests WHERE id = ${i.requestId}::uuid`,
      );
      const give = { placeId: r!.give_place, date: r!.give_date, shift: r!.give_shift };
      await toldOfChange(ctx, r!.from_user, give, false, i.requestId);
      await toldOfChange(ctx, r!.to_user, give, true, i.requestId);
      if (r!.take_date) {
        const take = { placeId: r!.take_place!, date: r!.take_date, shift: r!.take_shift! };
        await toldOfChange(ctx, r!.to_user, take, false, `${i.requestId}t`);
        await toldOfChange(ctx, r!.from_user, take, true, `${i.requestId}t`);
      }
    }
    return { id: i.requestId };
  });

// ─── Leave (§7) ────────────────────────────────────────────────────────────
export const AskLeaveInput = z
  .object({
    clientKey: z.uuid(),
    kind: z.enum(["annual", "day_off", "study", "sick"]),
    from: z.iso.date(),
    to: z.iso.date().nullable(),
    reason: z.string().trim().max(300).nullable(),
  })
  .refine((v) => !v.to || v.to >= v.from);
export const askLeave = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(AskLeaveInput, raw, actor, NEED, async (ctx, i) => {
    const w = await loadRosterWorld(
      ctx.tx,
      ctx.actor.hospitalId,
      ctx.actor.userId,
      ctx.manages,
      i.from,
      ctx.now,
    );
    must(i.from >= w.now.date, ROSTER_REFUSAL.requestMoved);
    const late = i.kind !== "sick" && i.from < addDays(w.now.date, w.params.leaveAheadDays);
    const row = await one<{ id: string }>(
      ctx,
      sql`INSERT INTO public.pharmacy_staff_leave (id, hospital_id, user_id, kind, date_from, date_to, reason, late)
          VALUES (${i.clientKey}::uuid, ${ctx.actor.hospitalId}::uuid, ${ctx.actor.userId}::uuid, ${i.kind},
            ${i.from}::date, ${i.to ?? i.from}::date, ${i.reason || null}, ${late})
          ON CONFLICT (id) DO NOTHING RETURNING id`,
    );
    return { id: row?.id ?? i.clientKey, late };
  });

export const LeaveActInput = z.object({
  leaveId: z.uuid(),
  status: z.enum(["approved", "declined", "withdrawn"]),
  note: z.string().trim().max(300).nullable(),
});
export const decideLeave = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(LeaveActInput, raw, actor, NEED, async (ctx, i) => {
    const h = ctx.actor.hospitalId;
    const freeing =
      i.status === "approved"
        ? rowsOf<{ location_id: string; date: string; shift: Shift; user_id: string }>(
            await ctx.tx.execute(sql`
              SELECT r.location_id, r.date_from::text AS date, r.shift, r.user_id FROM public.pharmacy_duty_roster r
                JOIN public.pharmacy_staff_leave l ON l.id = ${i.leaveId}::uuid AND l.user_id = r.user_id
               WHERE r.hospital_id = ${h}::uuid AND r.ended_at IS NULL AND r.date_from = r.date_to
                 AND r.date_from BETWEEN l.date_from AND l.date_to`),
          )
        : [];
    const row = await one<{ id: string }>(
      ctx,
      sql`UPDATE public.pharmacy_staff_leave SET status = ${i.status}, note = ${i.note || null},
            decided_by = ${ctx.actor.userId}::uuid, decided_at = ${ctx.now.toISOString()}::timestamptz
           WHERE id = ${i.leaveId}::uuid AND hospital_id = ${h}::uuid AND status = 'pending'
          RETURNING id`,
    );
    must(row, ROSTER_REFUSAL.requestMoved);
    for (const f of freeing)
      await toldOfChange(
        ctx,
        f.user_id,
        { placeId: f.location_id, date: f.date, shift: f.shift },
        false,
        i.leaveId,
      );
    return {
      id: row!.id,
      freed: freeing.map((f) => ({ placeId: f.location_id, date: f.date, shift: f.shift })),
    };
  });

// ─── People, licences, attendance, reminders ───────────────────────────────
export const AddPersonInput = z.object({
  userId: z.uuid(),
  cadre: z.enum(["pharmacist", "technician", "dispenser", "store_keeper"]),
  places: z.array(z.uuid()).min(1).max(40),
});
export const addPerson = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(AddPersonInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, ROSTER_REFUSAL.inChargeOnly);
    const h = ctx.actor.hospitalId;
    await ctx.tx.execute(sql`
      UPDATE public.pharmacy_roster_people SET ended_at = ${ctx.now.toISOString()}::timestamptz,
        ended_by = ${ctx.actor.userId}::uuid
       WHERE hospital_id = ${h}::uuid AND user_id = ${i.userId}::uuid AND ended_at IS NULL`);
    const row = await one<{ id: string }>(
      ctx,
      sql`INSERT INTO public.pharmacy_roster_people (hospital_id, user_id, cadre, places, added_by)
          SELECT ${h}::uuid, ${i.userId}::uuid, ${i.cadre}, ${i.places}::uuid[], ${ctx.actor.userId}::uuid
           WHERE NOT EXISTS (SELECT 1 FROM unnest(${i.places}::uuid[]) p
                              WHERE NOT EXISTS (SELECT 1 FROM public.pharmacy_locations l WHERE l.id = p
                                AND l.hospital_id = ${h}::uuid AND l.kind IN ('store','dispensing_point')))
          RETURNING id`,
    );
    must(row, ROSTER_REFUSAL.pharmacyOnly);
    return { id: row!.id };
  });

export const LicenceInput = z.object({
  userId: z.uuid(),
  body: z.enum(["PSU", "AHPC"]),
  number: z.string().trim().min(2).max(40),
  expiresOn: z.iso.date(),
});
/** §10 Record renewal: the in-charge records the new expiry; it must be after today. */
export const recordLicence = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(LicenceInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, ROSTER_REFUSAL.inChargeOnly);
    must(i.expiresOn > kampala(ctx.now).date, ROSTER_REFUSAL.endPassed);
    const row = await one<{ id: string }>(
      ctx,
      sql`INSERT INTO public.pharmacy_staff_licences (hospital_id, user_id, body, number, expires_on, recorded_by)
          VALUES (${ctx.actor.hospitalId}::uuid, ${i.userId}::uuid, ${i.body}, ${i.number}, ${i.expiresOn}::date,
            ${ctx.actor.userId}::uuid)
          RETURNING id`,
    );
    return { id: row!.id };
  });

export const SignInInput = z.object({ placeId: z.uuid(), deviceId: z.string().max(80).nullable() });
/** §12: sign in to the shift you are rostered on now, at this place. */
export const signIn = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(SignInInput, raw, actor, NEED, async (ctx, i) => {
    const now = kampala(ctx.now);
    const { date, shift } =
      now.min < 480
        ? { date: addDays(now.date, -1), shift: "night" as const }
        : now.min < 1020
          ? { date: now.date, shift: "day" as const }
          : { date: now.date, shift: "night" as const };
    const row = await one<{ id: string }>(
      ctx,
      sql`INSERT INTO public.pharmacy_shift_attendance (hospital_id, user_id, location_id, duty_date, shift,
            signed_in_at, device_id)
          SELECT ${ctx.actor.hospitalId}::uuid, ${ctx.actor.userId}::uuid, ${i.placeId}::uuid, ${date}::date, ${shift},
            ${ctx.now.toISOString()}::timestamptz, ${i.deviceId}
           WHERE EXISTS (SELECT 1 FROM public.pharmacy_duty_roster r WHERE r.hospital_id = ${ctx.actor.hospitalId}::uuid
                   AND r.user_id = ${ctx.actor.userId}::uuid AND r.location_id = ${i.placeId}::uuid
                   AND r.date_from = ${date}::date AND r.date_to = r.date_from AND r.shift = ${shift}
                   AND r.ended_at IS NULL)
          ON CONFLICT (hospital_id, user_id, duty_date, shift) DO NOTHING
          RETURNING id`,
    );
    must(row, ROSTER_REFUSAL.notHere);
    return { id: row!.id };
  });

export const RemindersInput = z.object({
  eveOn: z.boolean(),
  eveTime: z.enum(["17:00", "18:00", "19:00", "20:00"]),
  changeOn: z.boolean(),
  unpubOn: z.boolean(),
  licOn: z.boolean(),
});
export const setReminders = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(RemindersInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, ROSTER_REFUSAL.inChargeOnly);
    const row = await one<{ id: string }>(
      ctx,
      sql`INSERT INTO public.pharmacy_roster_reminders (hospital_id, eve_on, eve_time, change_on, unpub_on, lic_on, set_by)
          VALUES (${ctx.actor.hospitalId}::uuid, ${i.eveOn}, ${i.eveTime}, ${i.changeOn}, ${i.unpubOn}, ${i.licOn},
            ${ctx.actor.userId}::uuid)
          RETURNING id`,
    );
    return { id: row!.id };
  });
