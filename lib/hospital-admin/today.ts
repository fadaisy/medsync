/**
 * Today (ADR 0517): the admin's home. Counts that each lead somewhere, and a short "Do next" list built from the
 * same records as the menu's badges and the Requests page. Every source is best-effort: a count that could not be
 * read is `null` and prints as a dash, never as zero. Pure and client-safe; the loader is `today-load.ts`.
 */
import { TODAY } from "@/content/hospital-admin/admin-nav";
import { fill } from "@/content/lab-workspace-v2";

export interface TodayInput {
  /** Visits booked for today (not cancelled, declined, void or rescheduled). */
  booked: number | null;
  /** Booking requests waiting for a clinician, with how long each has waited (ms) and whether it is urgent. */
  pending: ReadonlyArray<{ urgent: boolean; waitedMs: number }> | null;
  review: number | null;
  unavailable: number | null;
  /** Emergency and support changes waiting for a second admin. */
  verify: ReadonlyArray<{ byName: string; mine: boolean }> | null;
  /** Open copies of results, soonest due first. */
  copies: ReadonlyArray<{ code: string | null; dueText: string }> | null;
}

export interface TodayStat {
  key: "booked" | "waiting" | "review" | "unavailable";
  value: string;
  label: string;
  sub: string;
  href: string;
  /** Something is waiting here. Tiles stay neutral (a workflow state is never red, amber or green); Do next lists it. */
  attention: boolean;
}

export interface TodayTodo {
  key: string;
  title: string;
  sub: string;
  href: string;
  btn: string;
  icon: string;
}

export const STALE_MS = 2 * 86_400_000;

/** "3 days", "5 hours", "20 minutes": how long something has waited, in the largest whole unit. */
export function waitedText(ms: number): string {
  const m = Math.max(0, Math.floor(ms / 60_000));
  if (m >= 2880) return `${Math.floor(m / 1440)} days`;
  if (m >= 1440) return "1 day";
  if (m >= 120) return `${Math.floor(m / 60)} hours`;
  if (m >= 60) return "1 hour";
  return `${m} minutes`;
}

const n = (v: number | null) => (v === null ? TODAY.unknown : String(v));

export function todayStats(i: TodayInput): TodayStat[] {
  const waiting = i.pending === null ? null : i.pending.length;
  return [
    {
      key: "booked",
      value: n(i.booked),
      label: TODAY.stats.booked[0],
      sub: TODAY.stats.booked[1],
      href: "/hospital-admin/clinics?view=week",
      attention: false,
    },
    {
      key: "waiting",
      value: n(waiting),
      label: TODAY.stats.waiting[0],
      sub: TODAY.stats.waiting[1],
      href: "/hospital-admin/requests",
      attention: !!waiting,
    },
    {
      key: "review",
      value: n(i.review),
      label: TODAY.stats.review[0],
      sub: TODAY.stats.review[1],
      href: "/hospital-admin/staff",
      attention: !!i.review,
    },
    {
      key: "unavailable",
      value: n(i.unavailable),
      label: TODAY.stats.unavailable[0],
      sub: TODAY.stats.unavailable[1],
      href: "/hospital-admin/departments/availability",
      attention: !!i.unavailable,
    },
  ];
}

/** Do next: other admins' changes to verify, people to review, urgent and stale requests, copies, unavailable. */
export function todayTodo(i: TodayInput): TodayTodo[] {
  const out: TodayTodo[] = [];
  const T = TODAY.todo;
  const others = (i.verify ?? []).filter((v) => !v.mine);
  const mine = (i.verify ?? []).filter((v) => v.mine);
  if (others.length)
    out.push({
      key: "verify",
      title: fill(T.verify[0], { n: others.length }),
      sub: fill(T.verify[1], { names: [...new Set(others.map((v) => v.byName))].join(", ") }),
      href: "/hospital-admin/departments/emergency",
      btn: T.verify[2],
      icon: "alert",
    });
  if (mine.length)
    out.push({
      key: "mine",
      title: fill(T.mine[0], { n: mine.length }),
      sub: T.mine[1],
      href: "/hospital-admin/departments/emergency",
      btn: T.mine[2],
      icon: "alert",
    });
  if (i.review)
    out.push({
      key: "review",
      title: fill(T.review[0], { n: i.review }),
      sub: T.review[1],
      href: "/hospital-admin/staff",
      btn: T.review[2],
      icon: "person",
    });
  const urgent = (i.pending ?? []).filter((p) => p.urgent);
  if (urgent.length)
    out.push({
      key: "urgent",
      title: fill(T.urgent[0], { n: urgent.length }),
      sub: fill(T.urgent[1], { t: waitedText(Math.max(...urgent.map((p) => p.waitedMs))) }),
      href: "/hospital-admin/requests",
      btn: T.urgent[2],
      icon: "clock",
    });
  const stale = (i.pending ?? []).filter((p) => !p.urgent && p.waitedMs > STALE_MS);
  if (stale.length)
    out.push({
      key: "stale",
      title: fill(T.stale[0], { n: stale.length }),
      sub: T.stale[1],
      href: "/hospital-admin/requests",
      btn: T.stale[2],
      icon: "clock",
    });
  const copy = i.copies?.[0];
  if (copy)
    out.push({
      key: "copy",
      title: fill(T.copy[0], { code: copy.code ?? "—" }),
      sub: fill(T.copy[1], { date: copy.dueText }),
      href: "/hospital-admin/requests?tab=copies",
      btn: T.copy[2],
      icon: "ticket",
    });
  if (i.unavailable)
    out.push({
      key: "unavailable",
      title: fill(T.unavailable[0], { n: i.unavailable }),
      sub: T.unavailable[1],
      href: "/hospital-admin/departments/availability",
      btn: T.unavailable[2],
      icon: "eye",
    });
  return out;
}
