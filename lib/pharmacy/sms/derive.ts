import type { SmsRule } from "@/db/schema/pharmacy-rework-patients";
import { fill, PRW, RULES } from "@/content/pharmacy-rework-patients";
import { day0, DAY } from "@/lib/pharmacy/wards/derive";

/**
 * The day's reminder queue (prototype productivity.js `smsQueue`), from real refills, courses and the immunisation
 * register. Pure. Messages go in English: the Luganda wording stays a draft until a native speaker signs it (PRD §9).
 */
export interface SmsCandidate {
  rule: SmsRule;
  refKey: string;
  recipient: string;
  /** Who the phone belongs to, so the loader can look it up (patient user id, or EPI client id). */
  phoneOf: { patient: string } | { client: string };
  body: string;
}

export interface QueueInput {
  now: number;
  hospital: string;
  enabled: (rule: SmsRule) => boolean;
  template: (rule: SmsRule) => string;
  refills: readonly { rxId: string; patientId: string; name: string; med: string; runOut: number }[];
  courses: readonly { rxId: string; patientId: string; name: string; med: string; needCheck: boolean }[];
  epi: readonly { clientId: string; name: string; appt: number | null; overdue: { late: number; due: number } | null }[];
}

const date = (t: number) =>
  new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "Africa/Kampala" }).format(t);

export function smsQueue(i: QueueInput): SmsCandidate[] {
  const t0 = day0(i.now),
    out: SmsCandidate[] = [];
  const add = (rule: SmsRule, ref: string, recipient: string, phoneOf: SmsCandidate["phoneOf"], v: Record<string, string>) => {
    if (!i.enabled(rule)) return;
    out.push({
      rule,
      refKey: `${rule}:${ref}`,
      recipient,
      phoneOf,
      body: fill(i.template(rule), { hospital: i.hospital, name: recipient, ...v }).slice(0, 160),
    });
  };
  for (const r of i.refills) {
    const k = Math.round((day0(r.runOut) - t0) / DAY);
    if (k === RULES.sms.refillDueIn)
      add("refill_due", r.rxId, r.name, { patient: r.patientId }, { med: r.med, date: date(r.runOut) });
    if (RULES.sms.refillMissedOn.includes(-k))
      add("refill_missed", `${r.rxId}:${-k}`, r.name, { patient: r.patientId }, { med: r.med, date: date(r.runOut) });
  }
  for (const c of i.courses)
    if (c.needCheck) add("course", c.rxId, c.name, { patient: c.patientId }, { med: c.med, date: "" });
  for (const e of i.epi) {
    if (e.appt != null && Math.round((day0(e.appt) - t0) / DAY) === 1)
      add("epi_tomorrow", e.clientId, e.name, { client: e.clientId }, { med: "", date: date(e.appt) });
    if (e.overdue && RULES.sms.defaulterOn.includes(e.overdue.late))
      add("epi_defaulter", `${e.clientId}:${e.overdue.late}`, e.name, { client: e.clientId }, { med: "", date: date(e.overdue.due) });
  }
  return out;
}

/** The wording in force for a rule: the hospital's latest edit, or the default. */
export const templateOf = (rule: SmsRule, edited: string | null | undefined) => edited ?? PRW.sms.templates[rule]!.en;
