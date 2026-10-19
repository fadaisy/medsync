/**
 * Send-outs board (Lab Workspace v2, prompt 5.6; S21–S23): which column a card sits in. Pure. Columns are views
 * of the referral state the engine projects (lib/lab/referral.ts); nothing here moves a referral, and overdue is
 * RF-5's `overdue()`, never a figure of its own (Law 4).
 */
import type { ReferralState } from "@/lib/exchange/types";

import { overdue } from "@/lib/lab/referral";

export type BoardColumn = "to_refer" | "on_manifest" | "out" | "overdue" | "back";
export const BOARD_COLUMNS: readonly BoardColumn[] = [
  "to_refer",
  "on_manifest",
  "out",
  "overdue",
  "back",
];

/** A referral's column. `backToFile`: an electronic result has arrived and waits to be filed (backToFile()). */
export function boardColumn(
  r: { state: ReferralState; expected: Date | null; backToFile?: boolean },
  now: Date,
): BoardColumn {
  if (r.backToFile) return "back";
  switch (r.state) {
    case "draft":
    case "packed":
      return "on_manifest";
    case "handed_over":
    case "at_hub":
    case "received_by_lab":
    case "accepted":
    case "in_progress":
    case "on_hold":
      return overdue(now, r.expected, r.state).overdue ? "overdue" : "out";
    case "completed":
    case "rejected":
    case "failed":
    case "lost":
    case "cancelled":
      return "back";
  }
}

/**
 * The route a card takes (RF-7, Law 10): a high-risk specimen, or a referral that is not routine, is an outbreak
 * referral. It never goes on a manifest and keeps its own path (the outbreak dialog), with its amber tag.
 */
export const routeOf = (r: { highRisk?: boolean; routine?: boolean }): "manifest" | "outbreak" =>
  r.highRisk || r.routine === false ? "outbreak" : "manifest";

/**
 * A specimen on To refer is a "To refer" card until one of its referrals is live: on a manifest, out or back with
 * a result. A referral that ended without a result (rejected, failed, lost, cancelled) puts it back to refer.
 */
const ENDED_WITHOUT_RESULT: readonly ReferralState[] = ["rejected", "failed", "lost", "cancelled"];
export const stillToRefer = (states: readonly ReferralState[]) =>
  states.every((s) => ENDED_WITHOUT_RESULT.includes(s));

/** Kampala month bounds (UTC+3 all year) for "YYYY-MM". */
export function monthBounds(m: string): { from: Date; to: Date } {
  const [y, mo] = m.split("-").map(Number) as [number, number];
  return {
    from: new Date(Date.UTC(y, mo - 1, 1) - 3 * 3_600_000),
    to: new Date(Date.UTC(y, mo, 1) - 3 * 3_600_000),
  };
}
export const kampalaMonth = (now: Date) =>
  new Date(now.getTime() + 3 * 3_600_000).toISOString().slice(0, 7);
/** The month and the `n - 1` before it, newest first. */
export function recentMonths(now: Date, n: number): string[] {
  const [y, mo] = kampalaMonth(now).split("-").map(Number) as [number, number];
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(y, mo - 1 - i, 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Median of whole numbers, to one decimal; null for none ("No data", never 0). */
export function median(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const mid = s.length >> 1;
  const v = s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
  return Math.round(v * 10) / 10;
}

export type ReferralView = "all" | "sent" | "back" | "waiting" | "overdue" | "rejected";
export const REFERRAL_VIEWS: readonly ReferralView[] = [
  "all",
  "sent",
  "back",
  "waiting",
  "overdue",
  "rejected",
];

interface FigureRow {
  state: ReferralState;
  partner: string;
  sentAt: Date | null;
  completedAt: Date | null;
  overdueDays: number | null;
}
const TERMINAL: readonly ReferralState[] = ["completed", "failed", "lost", "cancelled", "rejected"];

/** The referrals page's sets (Lab Phase 4 §5.3), unchanged: each key figure opens the set behind it. */
export function referralSets<R extends FigureRow>(
  rows: readonly R[],
  from: Date,
  to: Date,
): Record<ReferralView, R[]> {
  const inMonth = (d: Date | null) => !!d && d >= from && d < to;
  return {
    all: [...rows],
    sent: rows.filter((r) => inMonth(r.sentAt)),
    back: rows.filter((r) => r.state === "completed" && inMonth(r.completedAt)),
    waiting: rows.filter((r) => r.sentAt && !TERMINAL.includes(r.state)),
    overdue: rows.filter((r) => r.overdueDays),
    rejected: rows.filter((r) => r.state === "rejected"),
  };
}

/** Sent-to-back days, median overall and by partner (per partner "name 3.1"). */
export function sentToBack(back: readonly FigureRow[]): {
  median: number | null;
  byPartner: { partner: string; days: number }[];
} {
  const days = (r: FigureRow) => (r.completedAt!.getTime() - r.sentAt!.getTime()) / 86_400_000;
  const done = back.filter((r) => r.sentAt && r.completedAt);
  return {
    median: median(done.map(days)),
    byPartner: [...new Set(done.map((r) => r.partner))].map((partner) => ({
      partner,
      days: median(done.filter((r) => r.partner === partner).map(days))!,
    })),
  };
}

/** Count per partner, largest first. */
export function byPartner(rows: readonly { partner: string }[]): { partner: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) m.set(r.partner, (m.get(r.partner) ?? 0) + 1);
  return [...m].map(([partner, n]) => ({ partner, n })).sort((a, b) => b.n - a.n);
}
