import "server-only";

import type { SmsRule } from "@/db/schema/pharmacy-rework-patients";
import type { SmsSender } from "@/lib/notifications/sink";
import type { PharmacyActor, PharmacyCtx, PharmacyNeed } from "@/lib/pharmacy/write";
import { sql } from "drizzle-orm";
import { z } from "zod";

import { OPT_OUT_REASONS, SMS_TEMPLATES } from "@/content/pharmacy-setup";
import { EmrWriteError } from "@/lib/emr/write/context";
import { blindIndex, encrypt } from "@/lib/encryption";
import { rowsOf } from "@/lib/pharmacy/audit/read";
import { e164UG, normalisePhoneUG, senderId } from "@/lib/pharmacy/derive/setup/messages";
import { hospitalSmsSender } from "@/lib/pharmacy/sms-sender";
import { costPerSms, rulesOf, sendOne } from "@/lib/pharmacy/sms/store";
import { runPharmacyWrite } from "@/lib/pharmacy/write";

/**
 * Set-up › Messages (SETUP-TABS §D, §G): the in-charge's. Patient templates are versioned `pharmacy_sms_rules` rows
 * (latest wins); the staff switches are People › Reminders' one setting (`pharmacy_roster_reminders`). The API key is
 * encrypted here and never read back to a page. Sends go through `sendOne`, so the database's quiet-hours, opt-out
 * and cap guards run before the provider is paid.
 */
const NEED: PharmacyNeed = { permission: "pharmacy.view", point: "none" };
const PATIENT = ["refill_due", "refill_missed", "course", "epi_tomorrow", "epi_defaulter"] as const;
const STAFF = {
  staff_eve: "eve_on",
  staff_change: "change_on",
  staff_unpub: "unpub_on",
  staff_licence: "lic_on",
} as const;
const KEYS = SMS_TEMPLATES.map((t) => t.key) as [string, ...string[]];
type Opts = { sender?: SmsSender | null };
const must = (ok: unknown, msg: string) => {
  if (!ok) throw new EmrWriteError("forbidden", msg);
};
const IN_CHARGE = "Only the in-charge changes messages.";
const NOT_CONNECTED = "Connect the SMS provider first.";

const provider = async (ctx: PharmacyCtx) =>
  rowsOf<{ connected: boolean; cost_ugx: number }>(
    await ctx.tx.execute(sql`SELECT connected, cost_ugx FROM public.pharmacy_sms_provider
      WHERE hospital_id = ${ctx.actor.hospitalId}::uuid FOR UPDATE`),
  )[0];

/** A new version of a patient template, carrying forward what is not changed. */
async function version(
  ctx: PharmacyCtx,
  rule: SmsRule,
  patch: Partial<{
    on: boolean;
    en: string | null;
    lg: string | null;
    timing: string;
    lgChecked: boolean;
  }>,
) {
  const cur = (await rulesOf(ctx.tx, ctx.actor.hospitalId)).find((r) => r.rule === rule)!;
  const lg = patch.lg !== undefined ? patch.lg : cur.lg;
  // Editing the Luganda clears the native speaker's check.
  const keep = patch.lg === undefined || patch.lg === cur.lg;
  const checked = patch.lgChecked ?? (keep && !!cur.lgCheckedAt);
  await ctx.tx
    .execute(sql`INSERT INTO public.pharmacy_sms_rules (hospital_id, rule, enabled, template_en, template_lg,
      status, set_by, timing, lg_checked_by, lg_checked_at)
    VALUES (${ctx.actor.hospitalId}::uuid, ${rule}, ${patch.on ?? cur.enabled}, ${patch.en !== undefined ? patch.en : cur.en},
      ${lg}, 'draft', ${ctx.actor.userId}::uuid, ${patch.timing ?? cur.timing},
      ${checked ? (patch.lgChecked ? ctx.actor.userId : cur.lgCheckedBy) : null}::uuid,
      ${checked ? (patch.lgChecked ? ctx.now.toISOString() : cur.lgCheckedAt) : null}::timestamptz)`);
}

/** People › Reminders' setting, with some switches changed (the rest carried forward; default on, 18:00). */
async function reminders(
  ctx: PharmacyCtx,
  patch: Partial<Record<(typeof STAFF)[keyof typeof STAFF], boolean>>,
) {
  const cur = rowsOf<{
    eve_on: boolean;
    eve_time: string;
    change_on: boolean;
    unpub_on: boolean;
    lic_on: boolean;
  }>(
    await ctx.tx
      .execute(sql`SELECT eve_on, eve_time, change_on, unpub_on, lic_on FROM public.pharmacy_roster_reminders
      WHERE hospital_id = ${ctx.actor.hospitalId}::uuid ORDER BY set_at DESC LIMIT 1`),
  )[0] ?? { eve_on: true, eve_time: "18:00", change_on: true, unpub_on: true, lic_on: true };
  const n = { ...cur, ...patch };
  await ctx.tx
    .execute(sql`INSERT INTO public.pharmacy_roster_reminders (hospital_id, eve_on, eve_time, change_on, unpub_on,
      lic_on, set_by)
    VALUES (${ctx.actor.hospitalId}::uuid, ${n.eve_on}, ${n.eve_time}, ${n.change_on}, ${n.unpub_on}, ${n.lic_on},
      ${ctx.actor.userId}::uuid)`);
}

export const ConnectInput = z.object({
  name: z.string().trim().max(80),
  senderId: z.string().trim().max(11),
  /** Empty keeps the saved key. */
  apiKey: z.string().trim().max(200),
  costUgx: z.number().int().min(0).max(10_000),
  facility: z.string().trim().max(60),
});
export const connectProvider = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(ConnectInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    const saved = await provider(ctx);
    const sid = senderId(i.senderId);
    if (i.name.length < 2 || !sid || (!i.apiKey && !saved))
      throw new EmrWriteError("invalid", "Fill in the provider, sender ID and API key.");
    if (!i.costUgx)
      throw new EmrWriteError("invalid", "Type the cost per SMS, so the budget works.");
    const key = i.apiKey ? encrypt(i.apiKey) : null;
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_sms_provider (hospital_id, name, sender_id, api_key_encrypted,
        cost_ugx, facility_label, connected, updated_by)
      VALUES (${ctx.actor.hospitalId}::uuid, ${i.name}, ${sid}, ${key ?? ""}, ${i.costUgx}, ${i.facility || null}, true,
        ${ctx.actor.userId}::uuid)
      ON CONFLICT (hospital_id) DO UPDATE SET name = EXCLUDED.name, sender_id = EXCLUDED.sender_id,
        api_key_encrypted = coalesce(${key}, pharmacy_sms_provider.api_key_encrypted), cost_ugx = EXCLUDED.cost_ugx,
        facility_label = EXCLUDED.facility_label, connected = true, updated_by = EXCLUDED.updated_by, updated_at = now()`);
    return { id: ctx.actor.hospitalId };
  });

/** Disconnecting turns every message off (patients and staff). */
export const disconnectProvider = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(z.object({}), raw ?? {}, actor, NEED, async (ctx) => {
    must(ctx.manages, IN_CHARGE);
    await ctx.tx
      .execute(sql`UPDATE public.pharmacy_sms_provider SET connected = false, updated_by = ${ctx.actor.userId}::uuid,
        updated_at = now() WHERE hospital_id = ${ctx.actor.hospitalId}::uuid`);
    for (const r of PATIENT) await version(ctx, r, { on: false });
    await reminders(ctx, { eve_on: false, change_on: false, unpub_on: false, lic_on: false });
    return { id: ctx.actor.hospitalId };
  });

export const TestInput = z.object({
  phone: z.string().trim().max(20),
  body: z.string().trim().min(1).max(918),
});
/** To the test number now (quiet hours do not apply to tests); shows in Recent messages as Test. */
export const sendTest = (actor: PharmacyActor, raw: unknown, o: Opts = {}) =>
  runPharmacyWrite(TestInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    const p = await provider(ctx);
    if (!p?.connected) throw new EmrWriteError("config", NOT_CONNECTED);
    const pretty = normalisePhoneUG(i.phone);
    if (!pretty)
      throw new EmrWriteError("invalid", "Type a Ugandan mobile number, e.g. +256 772 000 000.");
    const phone = e164UG(pretty);
    const m = rowsOf<{ id: string }>(
      await ctx.tx
        .execute(sql`INSERT INTO public.pharmacy_sms_messages (hospital_id, day, rule, ref_key, recipient,
          phone_encrypted, phone_hmac, lang, body, status)
        VALUES (${ctx.actor.hospitalId}::uuid, (now() AT TIME ZONE 'Africa/Kampala')::date, 'test',
          ${`test:${crypto.randomUUID()}`}, 'Test', ${encrypt(phone)}, ${blindIndex(phone)}, 'en', ${i.body}, 'scheduled')
        RETURNING id`),
    )[0]!;
    const sender =
      o.sender !== undefined ? o.sender : await hospitalSmsSender(ctx.tx, ctx.actor.hospitalId);
    const sent = sender
      ? await sendOne(
          ctx.tx,
          sender,
          { id: m.id, status: "scheduled", phoneEncrypted: encrypt(phone), body: i.body },
          ctx.actor.userId,
          ctx.now,
          p.cost_ugx,
        )
      : false;
    return { id: m.id, sent };
  });

export const ToggleInput = z.object({ key: z.enum(KEYS), on: z.boolean() });
export const toggleTemplate = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(ToggleInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    if (i.on && !(await provider(ctx))?.connected) throw new EmrWriteError("config", NOT_CONNECTED);
    if (i.key in STAFF) await reminders(ctx, { [STAFF[i.key as keyof typeof STAFF]]: i.on });
    else await version(ctx, i.key as SmsRule, { on: i.on });
    return { id: i.key };
  });

const Text = z.string().trim().max(918);
export const TemplateInput = z.object({
  key: z.enum(PATIENT),
  timing: z.string().trim().min(1, "Say when it goes.").max(40),
  /** Empty: the default wording. */
  en: Text,
  lg: Text,
});
/** Patient templates; the staff wording follows People › Reminders. */
export const updateTemplate = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(TemplateInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    for (const t of [i.en, i.lg])
      if (t && t.length < 10)
        throw new EmrWriteError("invalid", "A message is at least 10 characters.");
    await version(ctx, i.key, { timing: i.timing, en: i.en || null, lg: i.lg || null });
    return { id: i.key };
  });

export const KeyInput = z.object({ key: z.enum(PATIENT) });
/** A native Luganda speaker checked it; until then the English one goes. */
export const markLugandaChecked = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(KeyInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    const cur = (await rulesOf(ctx.tx, ctx.actor.hospitalId)).find((r) => r.rule === i.key)!;
    if (!cur.lg) throw new EmrWriteError("invalid", "Type the Luganda first.");
    await version(ctx, i.key, { lgChecked: true });
    return { id: i.key };
  });

export const IdInput = z.object({ id: z.uuid() });
export const retryMessage = (actor: PharmacyActor, raw: unknown, o: Opts = {}) =>
  runPharmacyWrite(IdInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    const m = rowsOf<{ id: string; status: "failed"; phone_encrypted: string; body: string }>(
      await ctx.tx
        .execute(sql`SELECT id, status, phone_encrypted, body FROM public.pharmacy_sms_messages
        WHERE id = ${i.id}::uuid AND hospital_id = ${ctx.actor.hospitalId}::uuid AND status = 'failed' FOR UPDATE`),
    )[0];
    if (!m) throw new EmrWriteError("conflict", "That message is no longer failed.");
    const sender =
      o.sender !== undefined ? o.sender : await hospitalSmsSender(ctx.tx, ctx.actor.hospitalId);
    if (!sender) throw new EmrWriteError("config", NOT_CONNECTED);
    const sent = await sendOne(
      ctx.tx,
      sender,
      { id: m.id, status: m.status, phoneEncrypted: m.phone_encrypted, body: m.body },
      ctx.actor.userId,
      ctx.now,
      await costPerSms(ctx.tx, ctx.actor.hospitalId),
    );
    return { id: m.id, sent };
  });

export const OptOutInput = z.object({
  phone: z.string().trim().max(20),
  reason: z.enum(OPT_OUT_REASONS),
});
export const optOut = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(OptOutInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    const pretty = normalisePhoneUG(i.phone);
    if (!pretty)
      throw new EmrWriteError("invalid", "Type a Ugandan mobile number, e.g. +256 772 000 000.");
    const phone = e164UG(pretty);
    const r = rowsOf(
      await ctx.tx
        .execute(sql`INSERT INTO public.pharmacy_sms_optouts (hospital_id, phone_hmac, source, recorded_by, reason,
          phone_encrypted)
        VALUES (${ctx.actor.hospitalId}::uuid, ${blindIndex(phone)}, 'staff', ${ctx.actor.userId}::uuid, ${i.reason},
          ${encrypt(phone)})
        ON CONFLICT DO NOTHING RETURNING phone_hmac`),
    );
    if (!r.length) throw new EmrWriteError("conflict", "That number has already opted out.");
    return { id: blindIndex(phone) };
  });

export const OptInInput = z.object({ hmac: z.string().min(8).max(128) });
/** At the desk, with the patient present. The removal is audited. */
export const optIn = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(OptInInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    const r = rowsOf(
      await ctx.tx.execute(sql`DELETE FROM public.pharmacy_sms_optouts
        WHERE hospital_id = ${ctx.actor.hospitalId}::uuid AND phone_hmac = ${i.hmac} RETURNING phone_hmac`),
    );
    if (!r.length) throw new EmrWriteError("conflict", "That number is not opted out.");
    return { id: i.hmac };
  });

export const BudgetInput = z.object({ ugx: z.number().int().min(0).max(1_000_000_000) });
export const setBudget = (actor: PharmacyActor, raw: unknown) =>
  runPharmacyWrite(BudgetInput, raw, actor, NEED, async (ctx, i) => {
    must(ctx.manages, IN_CHARGE);
    await ctx.tx
      .execute(sql`INSERT INTO public.pharmacy_sms_settings (hospital_id, monthly_budget_ugx, updated_by)
      VALUES (${ctx.actor.hospitalId}::uuid, ${i.ugx || null}, ${ctx.actor.userId}::uuid)
      ON CONFLICT (hospital_id) DO UPDATE SET monthly_budget_ugx = EXCLUDED.monthly_budget_ugx,
        updated_by = EXCLUDED.updated_by, updated_at = now()`);
    return { id: ctx.actor.hospitalId };
  });
