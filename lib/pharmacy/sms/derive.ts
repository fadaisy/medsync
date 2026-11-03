import type { SmsRule } from "@/db/schema/pharmacy-rework-patients";

import { RULES } from "@/content/pharmacy-rework-patients";
import { SMS_TEMPLATES } from "@/content/pharmacy-setup";
import { fillSample } from "@/lib/pharmacy/derive/setup/messages";
import { DAY, day0 } from "@/lib/pharmacy/wards/derive";

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
  /** Set-up › Messages timing ("3", "1, 7"); the defaults otherwise. */
  days?: (rule: SmsRule) => readonly number[];
  refills: readonly {
    rxId: string;
    patientId: string;
    name: string;
    med: string;
    runOut: number;
  }[];
  courses: readonly {
    rxId: string;
    patientId: string;
    name: string;
    med: string;
    needCheck: boolean;
  }[];
  epi: readonly {
    clientId: string;
    name: string;
    appt: number | null;
    overdue: { late: number; due: number } | null;
  }[];
}

const date = (t: number) =>
  new Intl.DateTimeFormat("en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "Africa/Kampala",
  }).format(t);

export function smsQueue(i: QueueInput): SmsCandidate[] {
  const t0 = day0(i.now),
    out: SmsCandidate[] = [];
  const add = (
    rule: SmsRule,
    ref: string,
    recipient: string,
    phoneOf: SmsCandidate["phoneOf"],
    v: Record<string, string>,
  ) => {
    if (!i.enabled(rule)) return;
    out.push({
      rule,
      refKey: `${rule}:${ref}`,
      recipient,
      phoneOf,
      body: fillSample(i.template(rule), {
        hospital: i.hospital,
        facility: i.hospital,
        name: recipient,
        "first name": recipient,
        "child name": recipient,
        medicine: v.med ?? "",
        ...v,
      }).slice(0, 918),
    });
  };
  const d = i.days ?? ((r: SmsRule) => DEFAULT_DAYS[r]);
  for (const r of i.refills) {
    const k = Math.round((day0(r.runOut) - t0) / DAY);
    if (d("refill_due").includes(k))
      add(
        "refill_due",
        r.rxId,
        r.name,
        { patient: r.patientId },
        { med: r.med, date: date(r.runOut) },
      );
    if (d("refill_missed").includes(-k))
      add(
        "refill_missed",
        `${r.rxId}:${-k}`,
        r.name,
        { patient: r.patientId },
        { med: r.med, date: date(r.runOut) },
      );
  }
  for (const c of i.courses)
    if (c.needCheck)
      add("course", c.rxId, c.name, { patient: c.patientId }, { med: c.med, date: "" });
  for (const e of i.epi) {
    if (e.appt != null && d("epi_tomorrow").includes(Math.round((day0(e.appt) - t0) / DAY)))
      add(
        "epi_tomorrow",
        e.clientId,
        e.name,
        { client: e.clientId },
        { med: "", date: date(e.appt) },
      );
    if (e.overdue && d("epi_defaulter").includes(e.overdue.late))
      add(
        "epi_defaulter",
        `${e.clientId}:${e.overdue.late}`,
        e.name,
        { client: e.clientId },
        { med: "", date: date(e.overdue.due) },
      );
  }
  return out;
}

const DEFAULT_DAYS: Record<SmsRule, readonly number[]> = {
  refill_due: [RULES.sms.refillDueIn],
  refill_missed: RULES.sms.refillMissedOn,
  course: [3],
  epi_tomorrow: [1],
  epi_defaulter: RULES.sms.defaulterOn,
};
/** "1, 7" → [1, 7]; unreadable → the default. */
export const timingDays = (rule: SmsRule, timing: string | null | undefined) => {
  const n = (timing ?? "")
    .split(",")
    .map((x) => Number(x.trim()))
    .filter((x) => Number.isInteger(x) && x >= 0 && x <= 60);
  return n.length ? n : DEFAULT_DAYS[rule];
};

/** The wording in force for a rule: the hospital's latest edit, or the Set-up › Messages default. */
export const templateOf = (rule: SmsRule, edited: string | null | undefined) =>
  edited ?? SMS_TEMPLATES.find((t) => t.key === rule)!.en;
