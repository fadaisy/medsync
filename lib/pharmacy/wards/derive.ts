import { RULES } from "@/content/pharmacy-rework-patients";

/**
 * Inpatients and round pick lists (prototype inpatients.js, rounds.js), logic for logic. Pure: plain data in, plain
 * data out. Times are epoch ms; days are Kampala days (UTC+3, no daylight saving).
 */
export const MIN = 60_000;
export const HOUR = 60 * MIN;
export const DAY = 24 * HOUR;
const KAMPALA = 3 * HOUR;
/** Start of the Kampala day that holds `t`. */
export const day0 = (t: number) => Math.floor((t + KAMPALA) / DAY) * DAY - KAMPALA;

export interface Regimen {
  id: string;
  patientId: string;
  medicineId: string;
  drug: string;
  dose: string;
  route: string;
  /** RX frequency key (daily, 12h, 8h, 6h, 4h, stat) or null when not charted that way. */
  frequency: string | null;
  prn: boolean;
  start: number;
  /** Course length in days; null: until review. */
  days: number | null;
}

export interface MarRecord {
  rxId: string;
  /** The dose time it answers; null for a when-needed dose. */
  scheduledFor: number | null;
  at: number;
  state: "administered" | "withheld" | "refused" | "wasted";
  reason: string | null;
}

export type DoseKind = "given" | "late" | "not" | "stock" | "next" | "due" | "overdue";

/** Dose times of a regimen between `from` and `to`. */
export function slots(r: Regimen, from: number, to: number): number[] {
  const hours = r.prn || !r.frequency ? [] : (RULES.doseHours[r.frequency] ?? []);
  if (!hours.length) return [];
  const end = r.days == null ? Infinity : r.start + r.days * DAY;
  const out: number[] = [];
  for (let d = day0(r.start); d <= Math.min(end, to); d += DAY)
    for (const h of hours) {
      const ts = d + h * HOUR;
      if (ts >= r.start && ts < end && ts >= from && ts <= to) out.push(ts);
    }
  return out.sort((a, b) => a - b);
}

/** What was charted for one dose time (the record that answers it). */
export const doseAt = (r: Regimen, ts: number, recs: readonly MarRecord[]) =>
  recs.find((x) => x.rxId === r.id && x.scheduledFor != null && Math.abs(x.scheduledFor - ts) < MIN) ?? null;

export function doseState(r: Regimen, ts: number, recs: readonly MarRecord[], now: number): DoseKind {
  const d = doseAt(r, ts, recs);
  if (d?.state === "administered") return d.at - ts > RULES.lateAfterMin * MIN ? "late" : "given";
  if (d) return d.reason && RULES.noStockReason.test(d.reason) ? "stock" : "not";
  if (now < ts - RULES.dueFromMin * MIN) return "next";
  if (now <= ts + HOUR) return "due";
  return "overdue";
}

export interface RegStats {
  due: number;
  given: number;
  missed: number;
  stock: number;
  overdue: number;
  dueNow: number;
  late: number;
  pct: number | null;
}

export function regStats(r: Regimen, recs: readonly MarRecord[], now: number): RegStats {
  const st = slots(r, r.start, now + RULES.dueFromMin * MIN).map((t) => doseState(r, t, recs, now));
  const given = st.filter((k) => k === "given" || k === "late").length;
  const past = st.filter((k) => k !== "due" && k !== "next").length;
  const n = (k: DoseKind) => st.filter((x) => x === k).length;
  return {
    due: past,
    given,
    missed: n("not") + n("stock") + n("overdue"),
    stock: n("stock"),
    overdue: n("overdue"),
    dueNow: n("due"),
    late: n("late"),
    pct: past ? Math.round((given / past) * 100) : null,
  };
}

/** Doses still to give in the next 24 h, against what the ward holds of that medicine. */
export function coverage(r: Regimen, recs: readonly MarRecord[], wardHas: number, now: number) {
  const n = r.prn ? 1 : slots(r, now - RULES.dueFromMin * MIN, now + DAY).filter((t) => !doseAt(r, t, recs)).length;
  return { need: n, have: wardHas, ok: wardHas >= n, n };
}

export function ptStats(regs: readonly Regimen[], recs: readonly MarRecord[], wardHas: (med: string) => number, now: number) {
  const rs = regs.map((r) => ({ r, s: regStats(r, recs, now), c: coverage(r, recs, wardHas(r.medicineId), now) }));
  const sum = (k: keyof RegStats) => rs.reduce((a, x) => a + ((x.s[k] as number | null) ?? 0), 0);
  const due = sum("due"),
    given = sum("given");
  return {
    rs,
    due,
    given,
    pct: due ? Math.round((given / due) * 100) : null,
    missed: sum("missed"),
    stock: sum("stock"),
    overdue: sum("overdue"),
    dueNow: sum("dueNow"),
    short: rs.filter((x) => !x.c.ok).length,
  };
}

/** The next dose time of any of these regimens, after `now`. */
export const nextDose = (regs: readonly Regimen[], recs: readonly MarRecord[], now: number) =>
  regs
    .flatMap((r) => slots(r, now - RULES.dueFromMin * MIN, now + 2 * DAY).filter((t) => !doseAt(r, t, recs)))
    .sort((a, b) => a - b)[0] ?? null;

export interface Supply {
  qty: number;
  at: number;
  /** Null: on the way, not yet confirmed by the ward. */
  receivedAt: number | null;
}

/** Prescribed → picked → received → given → returned, and what should still be on the ward. */
export function journey(
  r: Regimen,
  sup: readonly Supply[],
  returned: number,
  recs: readonly MarRecord[],
  now: number,
) {
  const picked = sup.reduce((a, x) => a + x.qty, 0);
  const recv = sup.filter((x) => x.receivedAt != null).reduce((a, x) => a + x.qty, 0);
  const doses = r.prn
    ? recs.filter((x) => x.rxId === r.id && x.state === "administered").length
    : slots(r, r.start, now + HOUR).filter((t) => {
        const k = doseState(r, t, recs, now);
        return k === "given" || k === "late";
      }).length;
  const total = r.prn || r.days == null ? null : slots(r, r.start, r.start + r.days * DAY).length;
  return {
    picked,
    recv,
    given: doses,
    ret: returned,
    left: Math.max(0, recv - doses - returned),
    onway: picked - recv,
    total,
    doses,
    imprest: r.prn && !sup.length,
  };
}
export type Journey = ReturnType<typeof journey>;

/** Doses still to give from now to `to` (not yet charted). */
export const dosesAhead = (r: Regimen, recs: readonly MarRecord[], now: number, to: number) =>
  r.prn ? 0 : slots(r, now - RULES.dueFromMin * MIN, to).filter((t) => !doseAt(r, t, recs)).length;

export interface RoundPatient {
  r: Regimen;
  n: number;
  need: number;
  have: number;
  pick: number;
  times: number[];
}

/**
 * One ward's pick list for the next `hours`: per medicine, each patient's doses due in the window minus what was
 * picked for them and is still on the ward (or on the way). Quantities are in charted doses.
 */
export function roundLines(
  regs: readonly Regimen[],
  recs: readonly MarRecord[],
  journeyOf: (r: Regimen) => Journey,
  hours: number,
  now: number,
) {
  const to = now + hours * HOUR;
  const out = new Map<string, { medicineId: string; drug: string; pts: RoundPatient[]; need: number; have: number; pick: number }>();
  for (const r of regs) {
    if (r.prn) continue;
    const times = slots(r, now - RULES.dueFromMin * MIN, to).filter((t) => !doseAt(r, t, recs));
    if (!times.length) continue;
    const j = journeyOf(r);
    const need = times.length,
      have = j.left + Math.max(0, j.onway),
      pick = Math.max(0, need - have);
    const l = out.get(r.medicineId) ?? { medicineId: r.medicineId, drug: r.drug, pts: [], need: 0, have: 0, pick: 0 };
    l.pts.push({ r, n: times.length, need, have, pick, times });
    l.need += need;
    l.have += have;
    l.pick += pick;
    out.set(r.medicineId, l);
  }
  return [...out.values()].sort((a, b) => b.pick - a.pick);
}

/** A course length from the prescription's words ("5d", "7d", "14d"); null when open-ended. */
export const courseDays = (duration: string | null) => {
  const m = duration?.match(/^(\d{1,3})\s*d/);
  return m ? Number(m[1]) : duration === "single" ? 1 : null;
};
