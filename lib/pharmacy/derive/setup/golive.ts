import type { ChecklistItem } from "@/content/pharmacy-setup";

/**
 * Set-up › Going live (SETUP-TABS §A, §F): the prototype's `effStatus`, `frac`, readiness, blockers, overdue and
 * `phaseIdx`, on real dates (ISO, Africa/Kampala). Pure.
 */
export type Phase = "setup" | "practice" | "parallel" | "retired";
export type ItemStatus = "done" | "doing" | "todo";

export interface ItemState {
  /** Record and mark items. */
  status: "todo" | "done";
  /** Auto items: [done, total] from the live query. */
  prog: readonly [number, number] | null;
  dueOn: string | null;
}

/** An automatic item is done when everything is (an empty total is not done); others are what was recorded. */
export function itemStatus(it: Pick<ChecklistItem, "kind">, s: ItemState): ItemStatus {
  if (it.kind !== "auto") return s.status;
  const [d, t] = s.prog ?? [0, 0];
  return t > 0 && d >= t ? "done" : d > 0 ? "doing" : "todo";
}

export function frac(it: Pick<ChecklistItem, "kind">, s: ItemState) {
  if (it.kind !== "auto") return s.status === "done" ? 1 : 0;
  const [d, t] = s.prog ?? [0, 0];
  return t > 0 ? Math.min(1, d / t) : 0;
}

/** The ring: the average of each item's completion, as a whole percentage. */
export function readiness(items: readonly ChecklistItem[], st: (k: string) => ItemState) {
  if (!items.length) return 0;
  return Math.round((items.reduce((a, it) => a + frac(it, st(it.key)), 0) / items.length) * 100);
}

export const blockersLeft = (items: readonly ChecklistItem[], st: (k: string) => ItemState) =>
  items.filter((it) => it.blocks && itemStatus(it, st(it.key)) !== "done");

export const isOverdue = (it: ChecklistItem, s: ItemState, today: string) =>
  itemStatus(it, s) !== "done" && !!s.dueOn && s.dueOn < today;

export const overdue = (
  items: readonly ChecklistItem[],
  st: (k: string) => ItemState,
  today: string,
) => items.filter((it) => isOverdue(it, st(it.key), today));

/** Blockers due after the go-live date. */
export const blockersLate = (
  items: readonly ChecklistItem[],
  st: (k: string) => ItemState,
  target: string | null,
) =>
  target
    ? blockersLeft(items, st).filter((it) => !!st(it.key).dueOn && st(it.key).dueOn! > target)
    : [];

export const canGoLive = (blockers: number, phase: Phase) =>
  blockers === 0 && (phase === "setup" || phase === "practice");

/** Which phase card is "Now": 4 once paper is retired (all done). */
export const phaseIndex = (phase: Phase) =>
  phase === "retired" ? 4 : phase === "parallel" ? 2 : phase === "practice" ? 1 : 0;

const utc = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
/** Whole days from `a` to `b` (ISO dates). */
export const daysBetween = (a: string, b: string) => Math.round((utc(b) - utc(a)) / 86_400_000);

/** The countdown chip turns red with 3 days or fewer left while something blocks. */
export const countdownUrgent = (daysLeft: number, blockers: number) =>
  daysLeft <= 3 && blockers > 0;
