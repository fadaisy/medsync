import "server-only";

import type { SmsRule } from "@/db/schema/pharmacy-rework-patients";
import type { EmrDb, EmrTx } from "@/lib/emr/db";
import type { SmsSender } from "@/lib/notifications/sink";
import type { PharmacyActor, PharmacyNeed } from "@/lib/pharmacy/write";
import { and, eq, inArray, sql } from "drizzle-orm";
import { z } from "zod";

import { PRW } from "@/content/pharmacy-rework-patients";
import { pharmacySmsMessages, pharmacySmsOptouts, pharmacySmsRules } from "@/db/schema/pharmacy-rework-patients";
import { blindIndex, decrypt, encrypt } from "@/lib/encryption";
import { epiPlan, epiStatus } from "@/lib/pharmacy/epi/derive";
import { e164, runPatientsWrite } from "@/lib/pharmacy/epi/store";
import { opCourse, opRefill } from "@/lib/pharmacy/op/derive";
import { courseRows, refillRows } from "@/lib/pharmacy/op/read";
import { smsQueue, templateOf } from "@/lib/pharmacy/sms/derive";
import { fail } from "@/lib/pharmacy/stores/write";
import { q } from "@/lib/pharmacy/wards/sql";

/**
 * Reminders (TECH-SPEC §4 Reminders): the day's queue is worked out once (one row per reason per day), then each
 * row is sent, skipped or called. The transport is injected: with none configured nothing is sent and the queue
 * says so. Rules are versioned rows (append-only); the latest per rule wins. Default: on, signed default wording.
 */
type Opts = { database?: EmrDb; now?: Date };
export const SMS_NEED: PharmacyNeed = { permission: ["pharmacy.dispense", "pharmacy.review", "pharmacy.store"], point: "none" };
const RULE_KEYS = ["refill_due", "refill_missed", "course", "epi_tomorrow", "epi_defaulter"] as const;
const kampalaDay = (t: number) => new Date(t + 3 * 3_600_000).toISOString().slice(0, 10);

/** The rule in force per rule key (latest row), with defaults for rules never set. */
export async function rulesOf(d: EmrDb | EmrTx, hospitalId: string) {
  const rows = await q<{ rule: SmsRule; enabled: boolean; template_en: string | null; template_lg: string | null; status: string }>(
    d,
    sql`SELECT DISTINCT ON (rule) rule, enabled, template_en, template_lg, status FROM public.pharmacy_sms_rules
         WHERE hospital_id = ${hospitalId}::uuid ORDER BY rule, set_at DESC`,
  );
  return RULE_KEYS.map((rule) => {
    const r = rows.find((x) => x.rule === rule);
    return { rule, enabled: r?.enabled ?? true, en: r?.template_en ?? null, lg: r?.template_lg ?? null, edited: !!(r?.template_en || r?.template_lg) };
  });
}

/** Work out today's messages and store any new ones as scheduled (opted-out numbers as skipped). Returns the count. */
export async function buildQueue(db: EmrDb | EmrTx, hospitalId: string, now: Date) {
  const t = now.getTime();
  const rules = await rulesOf(db, hospitalId);
  const [h] = await q<{ name: string }>(db, sql`SELECT name FROM public.hospitals WHERE id = ${hospitalId}::uuid`);
  const [refills, courses, clients] = await Promise.all([
    refillRows(db, hospitalId),
    courseRows(db, hospitalId),
    q<{ id: string; kind: "child" | "woman" | "girl"; name: string; dob: string; phone: string; appt: string | null; doses: { lab: string; at: string; batch: string }[] | null }>(
      db,
      sql`SELECT c.id, c.kind, c.name, c.dob::text AS dob, c.phone_encrypted AS phone,
                 (SELECT a.come_back_on::text FROM public.pharmacy_epi_appointments a WHERE a.client_id = c.id ORDER BY a.set_at DESC LIMIT 1) AS appt,
                 (SELECT json_agg(json_build_object('lab', d.antigen, 'at', d.given_at, 'batch', d.batch_id)) FROM public.pharmacy_epi_doses d WHERE d.client_id = c.id) AS doses
            FROM public.pharmacy_epi_clients c WHERE c.hospital_id = ${hospitalId}::uuid`,
    ),
  ]);
  const patients = [...new Set([...refills.map((r) => r.patientId), ...(courses ?? []).map((c) => c.patientId)])];
  const profiles = patients.length
    ? await q<{ id: string; first: string | null; phone: string }>(
        db,
        sql`SELECT id, first_name_encrypted AS first, phone_encrypted AS phone FROM public.patient_profiles
             WHERE id IN (${sql.join(patients.map((p) => sql`${p}::uuid`), sql`, `)})`,
      )
    : [];
  const pr = new Map(profiles.map((p) => [p.id, p]));
  const first = (id: string) => {
    const p = pr.get(id);
    try {
      return p?.first ? decrypt(p.first) : "";
    } catch {
      return "";
    }
  };
  const day = (iso: string) => Date.parse(`${iso}T00:00:00+03:00`);
  const cand = smsQueue({
    now: t,
    hospital: h?.name ?? "",
    enabled: (r) => rules.find((x) => x.rule === r)!.enabled,
    template: (r) => templateOf(r, rules.find((x) => x.rule === r)!.en),
    refills: refills.filter((r) => pr.has(r.patientId)).map((r) => ({ rxId: r.rxId, patientId: r.patientId, name: first(r.patientId), med: r.med, runOut: opRefill(r.hist, r.daily, t).runOut })),
    courses: (courses ?? [])
      .filter((c) => pr.has(c.patientId))
      .map((c) => ({ rxId: c.rxId, patientId: c.patientId, name: first(c.patientId), med: c.med, needCheck: opCourse(c.start, c.days, c.checks, t).needCheck })),
    epi: clients.map((c) => {
      const plan = epiPlan(
        { id: c.id, kind: c.kind, dob: day(c.dob) },
        Object.fromEntries((c.doses ?? []).map((x) => [x.lab, { at: Date.parse(x.at), batchId: x.batch }])),
        t,
      );
      const st = epiStatus(plan, c.appt ? day(c.appt) : null);
      const oldest = st.k === "overdue" ? st.due.reduce((a, x) => Math.min(a, x.due ?? Infinity), Infinity) : null;
      return {
        clientId: c.id,
        name: c.name.split(" ")[0]!,
        appt: st.k === "ok" ? st.appt : null,
        overdue: st.k === "overdue" && oldest != null ? { late: st.late, due: oldest } : null,
      };
    }),
  }).filter((c) => c.recipient);
  if (!cand.length) return 0;
  const optouts = new Set(
    (await q<{ h: string }>(db, sql`SELECT phone_hmac AS h FROM public.pharmacy_sms_optouts WHERE hospital_id = ${hospitalId}::uuid`)).map((o) => o.h),
  );
  const cl = new Map(clients.map((c) => [c.id, c.phone]));
  const rows = cand.flatMap((c) => {
    const enc = "patient" in c.phoneOf ? pr.get(c.phoneOf.patient)?.phone : cl.get(c.phoneOf.client);
    if (!enc) return [];
    let phone: string;
    try {
      phone = e164(decrypt(enc));
    } catch {
      return [];
    }
    const hmac = blindIndex(phone);
    return [{
      hospitalId,
      day: kampalaDay(t),
      rule: c.rule,
      refKey: c.refKey.slice(0, 120),
      recipient: c.recipient.slice(0, 120),
      phoneEncrypted: encrypt(phone),
      phoneHmac: hmac,
      lang: "en" as const,
      body: c.body,
      status: optouts.has(hmac) ? ("skipped" as const) : ("scheduled" as const),
      failure: optouts.has(hmac) ? PRW.sms.optOut : null,
    }];
  });
  if (rows.length) await db.insert(pharmacySmsMessages).values(rows).onConflictDoNothing();
  return rows.length;
}

/** Send one scheduled or failed message. Not connected → nothing changes. */
async function sendOne(tx: EmrDb | EmrTx, sender: SmsSender, m: typeof pharmacySmsMessages.$inferSelect, by: string | null, now: Date) {
  const r = await sender.send({ toE164: decrypt(m.phoneEncrypted), body: m.body });
  await tx
    .update(pharmacySmsMessages)
    .set(
      r.ok
        ? { status: "sent", providerId: r.providerMessageId ?? null, cost: r.cost ? `${r.cost.currency} ${r.cost.amount}` : null, sentAt: now, statusBy: by, statusAt: now }
        : { status: "failed", failure: r.reason.slice(0, 200), statusBy: by, statusAt: now },
    )
    .where(eq(pharmacySmsMessages.id, m.id));
  return r.ok;
}

/** The cron: build today's queue for the hospital and send what is scheduled, when a transport exists. */
export async function runDaily(db: EmrDb, hospitalId: string, sender: SmsSender | null, now = new Date()) {
  const queued = await buildQueue(db, hospitalId, now);
  if (!sender) return { queued, sent: 0, connected: false };
  const due = await db
    .select()
    .from(pharmacySmsMessages)
    .where(and(eq(pharmacySmsMessages.hospitalId, hospitalId), eq(pharmacySmsMessages.day, kampalaDay(now.getTime())), eq(pharmacySmsMessages.status, "scheduled")));
  let sent = 0;
  for (const m of due) if (await sendOne(db, sender, m, null, now)) sent++;
  return { queued, sent, connected: true };
}

/* ─── Staff actions ─────────────────────────────────────────────────── */
export const buildToday = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(z.object({}), raw, actor, SMS_NEED, async (ctx) => {
    await buildQueue(ctx.tx, ctx.actor.hospitalId, ctx.now);
    return { id: ctx.actor.hospitalId };
  }, o);

export const MessageInput = z.object({ id: z.uuid(), act: z.enum(["send", "skip", "called", "optout"]) });

/** Send now, skip, record "called instead", or stop messages to the number. `sender` is null when not connected. */
export const actOnMessage = (actor: PharmacyActor, raw: unknown, sender: SmsSender | null, o?: Opts) =>
  runPatientsWrite(MessageInput, raw, actor, SMS_NEED, async (ctx, i) => {
    const [m] = await ctx.tx
      .select()
      .from(pharmacySmsMessages)
      .where(and(eq(pharmacySmsMessages.id, i.id), eq(pharmacySmsMessages.hospitalId, ctx.actor.hospitalId)))
      .for("update");
    if (!m) throw fail("not_found", PRW.sms.queueNone);
    const by = ctx.actor.userId;
    if (i.act === "send") {
      if (!sender) throw fail("config", PRW.sms.notConnected);
      // ponytail: the provider call runs inside the row lock; a queue of hundreds belongs to the cron, not this button.
      await sendOne(ctx.tx, sender, m, by, ctx.now);
    } else if (i.act === "optout") {
      await ctx.tx
        .insert(pharmacySmsOptouts)
        .values({ hospitalId: m.hospitalId, phoneHmac: m.phoneHmac, source: "staff", recordedBy: by, recordedAt: ctx.now })
        .onConflictDoNothing();
      if (m.status === "scheduled")
        await ctx.tx.update(pharmacySmsMessages).set({ status: "skipped", failure: PRW.sms.optOut, statusBy: by, statusAt: ctx.now }).where(eq(pharmacySmsMessages.id, m.id));
    } else
      await ctx.tx
        .update(pharmacySmsMessages)
        .set({ status: i.act === "skip" ? "skipped" : "called", statusBy: by, statusAt: ctx.now })
        .where(eq(pharmacySmsMessages.id, m.id));
    return { id: m.id };
  }, o);

export const SendAllInput = z.object({ ids: z.array(z.uuid()).min(1).max(500) });

export const sendAll = (actor: PharmacyActor, raw: unknown, sender: SmsSender | null, o?: Opts) =>
  runPatientsWrite(SendAllInput, raw, actor, SMS_NEED, async (ctx, i) => {
    if (!sender) throw fail("config", PRW.sms.notConnected);
    const due = await ctx.tx
      .select()
      .from(pharmacySmsMessages)
      .where(and(eq(pharmacySmsMessages.hospitalId, ctx.actor.hospitalId), eq(pharmacySmsMessages.status, "scheduled"), inArray(pharmacySmsMessages.id, i.ids)));
    for (const m of due) await sendOne(ctx.tx, sender, m, ctx.actor.userId, ctx.now);
    return { id: i.ids[0]! };
  }, o);

export const RuleInput = z.object({
  rule: z.enum(RULE_KEYS),
  enabled: z.boolean(),
  en: z.string().trim().min(10).max(160).nullable(),
  lg: z.string().trim().min(10).max(160).nullable(),
});

/** A new version of a rule: on/off and its wording (an edit is a draft until signed). */
export const setRule = (actor: PharmacyActor, raw: unknown, o?: Opts) =>
  runPatientsWrite(RuleInput, raw, actor, SMS_NEED, async (ctx, i) => {
    const [r] = await ctx.tx
      .insert(pharmacySmsRules)
      .values({ hospitalId: ctx.actor.hospitalId, rule: i.rule, enabled: i.enabled, templateEn: i.en, templateLg: i.lg, status: "draft", setBy: ctx.actor.userId, setAt: ctx.now })
      .returning({ id: pharmacySmsRules.id });
    return { id: r!.id };
  }, o);

/** A reply of STOP from a number: no more messages to it at any hospital that messaged it. */
export async function optOutReply(db: EmrDb, fromE164: string) {
  const hmac = blindIndex(e164(fromE164));
  const hs = await q<{ h: string }>(db, sql`SELECT DISTINCT hospital_id AS h FROM public.pharmacy_sms_messages WHERE phone_hmac = ${hmac}`);
  if (hs.length)
    await db
      .insert(pharmacySmsOptouts)
      .values(hs.map((x) => ({ hospitalId: x.h, phoneHmac: hmac, source: "reply_stop" as const })))
      .onConflictDoNothing();
  return hs.length;
}
