import "server-only";

import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { CHECKLIST, OWNERS } from "@/content/pharmacy-setup";
import { EmrWriteError } from "@/lib/emr/write/context";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Set-up › Going live, the server actions (SETUP-TABS §G). The database holds the line: the target date, practice and
 * retiring paper are the in-charge's (0274 `pge_apply`), going live needs both signatures and nothing blocking
 * (`pgsig_guard`), and an automatic item is never ticked by hand (`pgi_auto`). Each change is an event (the activity
 * list) and audited by the tables' triggers.
 */
const NEED: PharmacyNeed = { permission: "pharmacy.view", point: "none" };
const KEYS = CHECKLIST.map((i) => i.key) as [string, ...string[]];
const must = (ok: unknown, msg: string) => {
  if (!ok) throw new EmrWriteError("forbidden", msg);
};
const event = (ctx: PharmacyCtx, kind: string, item: string | null, detail: string | null = null) =>
  ctx.tx
    .execute(sql`INSERT INTO public.pharmacy_golive_events (hospital_id, kind, item_key, detail, by_user)
    VALUES (${ctx.actor.hospitalId}::uuid, ${kind}, ${item}, ${detail?.slice(0, 400) ?? null}, ${ctx.actor.userId}::uuid)`);
export const isSuperintendent = async (ctx: PharmacyCtx) =>
  rowsOf(
    await ctx.tx
      .execute(sql`SELECT 1 FROM public.user_roles WHERE user_id = ${ctx.actor.userId}::uuid
      AND hospital_id = ${ctx.actor.hospitalId}::uuid AND role = 'hospital_admin'`),
  ).length > 0;
const IN_CHARGE = "Only the in-charge does this.";

export const DateInput = z.object({ date: z.iso.date() });
export const setGoLiveDate = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(DateInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    await event(ctx, "target", null, i.date);
    return { id: i.date };
  });

export const AnswerInput = z.object({
  key: z.enum(KEYS),
  choice: z.string().trim().max(160).nullable(),
  text: z.string().trim().max(440),
  decidedBy: z.string().trim().max(120),
});
export const recordAnswer = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(AnswerInput, raw, actor, NEED, async (ctx, i) => {
    must(
      ctx.manages || (await isSuperintendent(ctx)),
      "Only the in-charge or the medical superintendent records answers.",
    );
    const it = CHECKLIST.find((c) => c.key === i.key)!;
    if (it.kind !== "record") throw new EmrWriteError("invalid", "That item is not an answer.");
    if (it.choices && !(i.choice && it.choices.includes(i.choice)))
      throw new EmrWriteError("invalid", "Pick an answer.");
    if (!it.choices && !i.text) throw new EmrWriteError("invalid", "Type the answer.");
    if (!i.decidedBy) throw new EmrWriteError("invalid", "Say who decided.");
    const answer = i.choice ? `${i.choice}${i.text ? `. ${i.text}` : ""}` : i.text;
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_golive_items (hospital_id, key, status, answer, answer_choice,
        decided_by, done_by, done_at, updated_at)
      VALUES (${ctx.actor.hospitalId}::uuid, ${i.key}, 'done', ${answer}, ${i.choice}, ${i.decidedBy},
        ${ctx.actor.userId}::uuid, ${ctx.now.toISOString()}::timestamptz, now())
      ON CONFLICT (hospital_id, key) DO UPDATE SET status = 'done', answer = EXCLUDED.answer,
        answer_choice = EXCLUDED.answer_choice, decided_by = EXCLUDED.decided_by, done_by = EXCLUDED.done_by,
        done_at = EXCLUDED.done_at, updated_at = now()`);
    await event(ctx, "answer", i.key, i.decidedBy);
    // The witness answer becomes the Rules value through the two signatures (Rules › Controlled drugs).
    if (i.key === "wit")
      await ctx.tx
        .execute(sql`INSERT INTO public.pharmacy_rule_proposals (hospital_id, rule_group, key, old_text, new_text,
          reason, proposed_by)
        SELECT ${ctx.actor.hospitalId}::uuid, 'cd', 'witness_ward',
          coalesce((SELECT text FROM public.pharmacy_rules WHERE hospital_id = ${ctx.actor.hospitalId}::uuid
                     AND rule_group = 'cd' AND key = 'witness_ward'), 'Second nurse on shift, nurse in-charge or doctor on duty'),
          ${answer.slice(0, 400)}, ${`Recorded on Going live, decided by ${i.decidedBy}`.slice(0, 300)}, ${ctx.actor.userId}::uuid
        WHERE ${answer.length >= 2}
        ON CONFLICT DO NOTHING`);
    return { id: i.key };
  });

export const ItemInput = z.object({ key: z.enum(KEYS) });
const setMark = (done: boolean) => (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(ItemInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    if (CHECKLIST.find((c) => c.key === i.key)!.kind !== "mark")
      throw new EmrWriteError("invalid", "This item is checked automatically.");
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_golive_items (hospital_id, key, status, done_by, done_at)
      VALUES (${ctx.actor.hospitalId}::uuid, ${i.key}, ${done ? "done" : "todo"}, ${done ? ctx.actor.userId : null}::uuid,
        ${done ? ctx.now.toISOString() : null}::timestamptz)
      ON CONFLICT (hospital_id, key) DO UPDATE SET status = EXCLUDED.status, done_by = EXCLUDED.done_by,
        done_at = EXCLUDED.done_at, updated_at = now()`);
    await event(ctx, done ? "mark" : "unmark", i.key);
    return { id: i.key };
  });
export const markItem = setMark(true);
export const unmarkItem = setMark(false);

export const OwnerInput = z.object({
  key: z.enum(KEYS),
  owner: z.enum(OWNERS),
  dueOn: z.iso.date().nullable(),
});
export const setItemOwner = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(OwnerInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_golive_items (hospital_id, key, owner_role, due_on)
      VALUES (${ctx.actor.hospitalId}::uuid, ${i.key}, ${i.owner}, ${i.dueOn}::date)
      ON CONFLICT (hospital_id, key) DO UPDATE SET owner_role = EXCLUDED.owner_role, due_on = EXCLUDED.due_on,
        updated_at = now()`);
    await event(ctx, "owner", i.key, `${i.owner}${i.dueOn ? ` · ${i.dueOn}` : ""}`);
    return { id: i.key };
  });

const Nothing = z.object({});
const phaseEvent =
  (kind: "practice_start" | "practice_end" | "retire") => (actor: PharmacyActor, raw: unknown) =>
    runPharmacyWrite(Nothing, raw ?? {}, actor, NEED, async (ctx) => {
      must(ctx.manages, IN_CHARGE);
      await event(ctx, kind, null);
      return { id: kind };
    });
export const startPractice = phaseEvent("practice_start");
/** Ends the practice day; the trigger deletes every practice row. */
export const endPractice = phaseEvent("practice_end");
export const retirePaper = phaseEvent("retire");

export const PracticeInput = z.object({ sample: z.string().trim().min(2).max(200) });
/** A sample prescription dispensed in practice: written only to the practice schema; marks the person trained. */
export const practiceDispense = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(PracticeInput, raw, actor, NEED, async (ctx, i) => {
    const s = rowsOf<{ id: string }>(
      await ctx.tx.execute(sql`SELECT id FROM public.pharmacy_practice_sessions
        WHERE hospital_id = ${ctx.actor.hospitalId}::uuid AND ended_at IS NULL`),
    )[0];
    if (!s) throw new EmrWriteError("conflict", "No practice day is running.");
    await ctx.tx
      .execute(sql`INSERT INTO pharmacy_practice.dispenses (hospital_id, session_id, user_id, sample)
      VALUES (${ctx.actor.hospitalId}::uuid, ${s.id}::uuid, ${ctx.actor.userId}::uuid, ${i.sample})`);
    return { id: s.id };
  });

export const SignInput = z.object({ role: z.enum(["in_charge", "ms"]) });
/** One signature; the second one switches the hospital live (the trigger). */
export const signGoLive = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(SignInput, raw, actor, NEED, async (ctx, i) => {
    if (i.role === "in_charge") must(ctx.manages, IN_CHARGE);
    else must(await isSuperintendent(ctx), "Only the medical superintendent signs here.");
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_golive_signatures (hospital_id, role, signed_by)
      VALUES (${ctx.actor.hospitalId}::uuid, ${i.role}, ${ctx.actor.userId}::uuid)`);
    await event(ctx, "sign", null, i.role);
    const live = rowsOf<{ live: boolean }>(
      await ctx.tx.execute(sql`SELECT live_at IS NOT NULL AS live FROM public.pharmacy_golive_state
        WHERE hospital_id = ${ctx.actor.hospitalId}::uuid`),
    )[0]?.live;
    return { id: i.role, live: !!live };
  });
