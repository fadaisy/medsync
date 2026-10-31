import type { Vaccine } from "@/db/schema/pharmacy-rework-patients";

import { RULES } from "@/content/pharmacy-rework-patients";
import { DAY, day0, HOUR } from "@/lib/pharmacy/wards/derive";

/**
 * Immunisation (prototype epi.js), logic for logic: the schedule, each client's plan and status, defaulters, vaccine
 * stock at the clinic, open vials and the month's indicators. Pure. Dates are Kampala-day epoch ms.
 */
const KAMPALA = 3 * HOUR;
/** Same day of the month, `m` months on (Kampala calendar). */
export const addMonths = (ts: number, m: number) => {
  const d = new Date(ts + KAMPALA);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + m, d.getUTCDate()) - KAMPALA;
};

type Item = readonly [Vaccine, string, string];
export const CHILD: readonly { c: string; at: (dob: number) => number; items: readonly Item[] }[] =
  [
    {
      c: "Birth",
      at: (dob) => dob,
      items: [
        ["bcg", "BCG", "Right upper arm, intradermal"],
        ["bopv", "OPV0", "Oral"],
      ],
    },
    {
      c: "6 weeks",
      at: (dob) => dob + 42 * DAY,
      items: [
        ["bopv", "OPV1", "Oral"],
        ["penta", "Penta1", "Left thigh, IM"],
        ["pcv", "PCV1", "Right thigh, IM"],
        ["rota", "Rota1", "Oral"],
      ],
    },
    {
      c: "10 weeks",
      at: (dob) => dob + 70 * DAY,
      items: [
        ["bopv", "OPV2", "Oral"],
        ["penta", "Penta2", "Left thigh, IM"],
        ["pcv", "PCV2", "Right thigh, IM"],
        ["rota", "Rota2", "Oral"],
      ],
    },
    {
      c: "14 weeks",
      at: (dob) => dob + 98 * DAY,
      items: [
        ["bopv", "OPV3", "Oral"],
        ["penta", "Penta3", "Left thigh, IM"],
        ["pcv", "PCV3", "Right thigh, IM"],
        ["ipv", "IPV", "Right thigh, IM (2.5 cm from PCV)"],
      ],
    },
    { c: "9 months", at: (dob) => addMonths(dob, 9), items: [["mr", "MR1", "Left upper arm, SC"]] },
    {
      c: "18 months",
      at: (dob) => addMonths(dob, 18),
      items: [["mr", "MR2", "Left upper arm, SC"]],
    },
  ];
const PREV: Record<string, string> = {
  OPV2: "OPV1",
  OPV3: "OPV2",
  Penta2: "Penta1",
  Penta3: "Penta2",
  PCV2: "PCV1",
  PCV3: "PCV2",
  Rota2: "Rota1",
  MR2: "MR1",
};
const TD: readonly (readonly [string, number])[] = [
  ["Td1", 0],
  ["Td2", 28],
  ["Td3", 182],
  ["Td4", 365],
  ["Td5", 365],
];

export interface Client {
  id: string;
  kind: "child" | "woman" | "girl";
  dob: number;
}
export interface Given {
  at: number;
  batchId: string;
}
export type PlanState = "given" | "wait" | "next" | "due" | "overdue" | "window";
export interface PlanItem {
  lab: string;
  vaccine: Vaccine;
  site: string;
  contact: string;
  due: number | null;
  s: PlanState;
  late?: number;
  after?: string | null;
  rec?: Given;
}

/** Every dose this client should have, with its due date and state. */
export function epiPlan(c: Client, g: Readonly<Record<string, Given>>, now: number): PlanItem[] {
  const t0 = day0(now),
    out: PlanItem[] = [];
  const st = (due: number | null, base: Omit<PlanItem, "due" | "s">): PlanItem => {
    const rec = g[base.lab];
    if (rec) return { ...base, due, s: "given", rec };
    if (due == null) return { ...base, due, s: "wait" };
    const late = Math.round((t0 - due) / DAY);
    return {
      ...base,
      due,
      s: due > t0 ? "next" : late <= RULES.epi.overdueAfterDays ? "due" : "overdue",
      late,
    };
  };
  if (c.kind === "child")
    for (const grp of CHILD)
      for (const [vaccine, lab, site] of grp.items) {
        let due: number | null = grp.at(c.dob);
        if (lab === "OPV0" && !g.OPV0 && t0 - c.dob > RULES.epi.opv0WindowDays * DAY) {
          out.push({ lab, vaccine, site, contact: grp.c, s: "window", due });
          continue;
        }
        const pv = PREV[lab];
        if (pv) due = g[pv] ? Math.max(due, day0(g[pv]!.at) + RULES.epi.minGapDays * DAY) : null;
        out.push(st(due, { lab, vaccine, site, contact: grp.c, after: pv ?? null }));
      }
  if (c.kind === "woman") {
    let prev: number | null = null;
    TD.forEach(([lab, gap], i) => {
      const due = i === 0 ? c.dob + 15 * 365 * DAY : prev != null ? prev + gap * DAY : null;
      out.push(
        st(due, {
          lab,
          vaccine: "td",
          site: "Left upper arm, IM",
          contact: lab,
          after: i ? TD[i - 1]![0] : null,
        }),
      );
      prev = g[lab] ? day0(g[lab]!.at) : null;
    });
  }
  if (c.kind === "girl")
    out.push(
      st(addMonths(c.dob, 120), {
        lab: "HPV",
        vaccine: "hpv",
        site: "Left upper arm (deltoid), IM",
        contact: "10 years",
      }),
    );
  return out;
}

export type EpiStatus =
  | {
      k: "due" | "overdue";
      late: number;
      due: PlanItem[];
      next: PlanItem | undefined;
      appt: number | null;
    }
  | { k: "ok"; next: PlanItem; appt: number }
  | { k: "complete" };

export function epiStatus(plan: readonly PlanItem[], appt: number | null): EpiStatus {
  const open = plan.filter((x) => x.s === "due" || x.s === "overdue");
  const next = plan.filter((x) => x.s === "next").sort((a, b) => a.due! - b.due!)[0];
  const worst = open.reduce((a, x) => Math.max(a, x.late ?? 0), 0);
  if (open.length)
    return {
      k: worst > RULES.epi.overdueAfterDays ? "overdue" : "due",
      late: worst,
      due: open,
      next,
      appt,
    };
  if (next) return { k: "ok", next, appt: appt ?? next.due! };
  return { k: "complete" };
}

/** The first visit after today's doses: the earliest remaining due date, 4 weeks on for a series just given. */
export function nextAfter(plan: readonly PlanItem[], picked: readonly string[], now: number) {
  const t0 = day0(now);
  let best: { d: number; lab: string } | null = null;
  for (const x of plan) {
    if (picked.includes(x.lab) || x.s === "given" || x.s === "window") continue;
    let d = x.due;
    if (x.after && picked.includes(x.after))
      d = Math.max(x.due ?? 0, t0 + RULES.epi.minGapDays * DAY);
    if (d == null) continue;
    if (d <= t0) d = t0 + RULES.epi.minGapDays * DAY;
    if (!best || d < best.d) best = { d, lab: x.lab };
  }
  return best;
}

/** How long an opened multi-dose vial may be kept (hours), or null for a single-dose vaccine. */
export const vialHours = (v: Vaccine, dosesPerVial: number) =>
  dosesPerVial > 1 ? (RULES.epi.vialHours[v] ?? 6) : null;

export interface VaxRow {
  vaccine: Vaccine;
  at: number;
  cold: number;
  max: number | null;
  todayUsed: number;
  week: number;
  /** Mean doses given per day over the last 14 days. */
  perDay: number;
}

/** Refill, Watch or OK; days left at the usual daily use; how much to bring from the cold room. */
export function vaxStock(r: VaxRow) {
  const max = r.max ?? 0,
    min = Math.round(max / 2);
  const daysLeft = r.perDay ? Math.floor(r.at / r.perDay) : null;
  const k =
    (max && r.at < min) || (daysLeft != null && daysLeft < 7)
      ? "refill"
      : max && r.at < max * 0.75
        ? "watch"
        : "ok";
  return {
    ...r,
    min,
    daysLeft,
    k: k as "refill" | "watch" | "ok",
    top: Math.max(0, Math.min(r.cold, max - r.at)),
  };
}

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

/** The month's indicators from the register (doses with their due dates) and the clinic's wastage. */
export function indicators(input: {
  clients: readonly { c: Client; plan: readonly PlanItem[] }[];
  /** Doses given this month: antigen and how many days after due. */
  month: readonly { lab: string; lateDays: number | null }[];
  given: number;
  wasted: number;
  zeroStock: number;
  now: number;
}) {
  const n = (lab: string) => input.month.filter((x) => x.lab === lab).length;
  const drop = (a: string, b: string) => (n(a) ? Math.round(((n(a) - n(b)) / n(a)) * 100) : null);
  const children = input.clients.filter((x) => x.c.kind === "child");
  const has = (p: readonly PlanItem[], lab: string) =>
    p.some((x) => x.lab === lab && x.s === "given");
  const yearOld = children.filter((x) => input.now - x.c.dob >= 365 * DAY);
  const fic = yearOld.filter((x) =>
    [
      "BCG",
      "OPV1",
      "OPV2",
      "OPV3",
      "Penta1",
      "Penta2",
      "Penta3",
      "PCV1",
      "PCV2",
      "PCV3",
      "IPV",
      "MR1",
    ].every((l) => has(x.plan, l)),
  ).length;
  const sixWeeks = children.filter((x) => input.now - x.c.dob >= 42 * DAY);
  const timed = input.month.filter((x) => x.lateDays != null);
  return {
    byAntigen: [...new Set(input.month.map((x) => x.lab))]
      .sort()
      .map((lab) => ({ lab, n: n(lab) })),
    dropouts: [
      { label: "Penta1 → Penta3", pct: drop("Penta1", "Penta3") },
      { label: "Penta1 → MR1", pct: drop("Penta1", "MR1") },
      { label: "BCG → MR1", pct: drop("BCG", "MR1") },
      { label: "MR1 → MR2", pct: drop("MR1", "MR2") },
    ],
    fic: { n: fic, of: yearOld.length, pct: pct(fic, yearOld.length) },
    zeroDose: sixWeeks.filter((x) => !has(x.plan, "Penta1")).length,
    td1: n("Td1"),
    protectedAtBirth: input.clients.filter((x) => x.c.kind === "woman" && has(x.plan, "Td2"))
      .length,
    hpv: n("HPV"),
    timeliness: pct(
      timed.filter((x) => x.lateDays! <= RULES.epi.overdueAfterDays).length,
      timed.length,
    ),
    wastage: pct(input.wasted, input.given + input.wasted),
    zeroStock: input.zeroStock,
  };
}
