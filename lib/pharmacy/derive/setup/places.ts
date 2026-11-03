import type { PlaceKind } from "@/content/pharmacy-setup";

import { RULES } from "@/content/pharmacy-rework-patients";

const { low: LOW, high: HIGH } = RULES.cold;

/**
 * Set-up › Places (SETUP-TABS §B, §F): the prototype's `hoToday`, `fState`, `snapSlot`, typed readings, device
 * status, order due, budget, stock flow and close guards. Every number comes from the caller (the signed rules).
 * Times are minutes after midnight, Africa/Kampala. Pure.
 */
export const toMin = (t: string) => +t.slice(0, 2) * 60 + +t.slice(3, 5);
export const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/** Now in Kampala: the ISO date and the minute of the day. */
export function kampalaNow(ms: number) {
  const t = new Date(ms + 3 * 3_600_000);
  return { date: t.toISOString().slice(0, 10), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}

export type SlotState = "done" | "missed" | "now" | "due";
export interface HandoverToday {
  /** "08:00" */
  slot: string;
  from: string;
  to: string;
  /** "08:12" */
  at: string;
  differences: number;
}
export interface SlotChip {
  t: string;
  st: SlotState;
  differences: number;
  handover: HandoverToday | null;
}

/** One chip per slot: done when started, missed `missedMin` after the slot with no start, now, or due. */
export function handoverToday(
  slots: readonly string[],
  today: readonly HandoverToday[],
  nowMin: number,
  missedMin: number,
): SlotChip[] {
  return slots.map((t) => {
    const h = today.find((x) => x.slot === t) ?? null;
    const st: SlotState = h
      ? "done"
      : nowMin >= toMin(t) + missedMin
        ? "missed"
        : nowMin >= toMin(t)
          ? "now"
          : "due";
    return { t, st, differences: h?.differences ?? 0, handover: h };
  });
}

export type FridgeState = "ok" | "near" | "out";
/** Out of `RULES.cold` (Rules › Fridge range, 2–8 °C); near within `near` of either limit. */
export const fridgeState = (temp: number, near: number): FridgeState =>
  outOfRange(temp) ? "out" : temp < LOW + near || temp > HIGH - near ? "near" : "ok";
export const outOfRange = (temp: number) => temp < LOW || temp > HIGH;

/** The typed check a reading counts for: within 90 minutes of 08:00 or 17:00, else none. */
export function readingSlot(time: string, checks: readonly string[] = ["08:00", "17:00"]) {
  const m = toMin(time);
  return checks.find((c) => Math.abs(m - toMin(c)) <= 90) ?? null;
}

export interface TypedCheck {
  t: string;
  temp: number | null;
  st: "ok" | "due" | "late";
}
/** A typed fridge's checks today: read, due, or late `lateMin` after the check with no reading. */
export function typedDue(
  readings: Readonly<Record<string, number>>,
  nowMin: number,
  lateMin: number,
  checks: readonly string[] = ["08:00", "17:00"],
): TypedCheck[] {
  return checks.map((t) => {
    const temp = readings[t] ?? null;
    return { t, temp, st: temp !== null ? "ok" : nowMin >= toMin(t) + lateMin ? "late" : "due" };
  });
}

export type DeviceStatus =
  | { k: "online"; min: number }
  | { k: "offline"; min: number }
  | { k: "none" };
/** Online when seen under 15 minutes ago; offline up to 10 hours; otherwise not in use. */
export function deviceStatus(lastSeenMs: number | null, nowMs: number): DeviceStatus {
  if (lastSeenMs === null) return { k: "none" };
  const min = Math.max(0, Math.floor((nowMs - lastSeenMs) / 60_000));
  return min < 15 ? { k: "online", min } : min < 600 ? { k: "offline", min } : { k: "none" };
}

/** Days until the order is due (the next cycle less the signed `order_due` days); null with no cycle date. */
export function orderDue(nextCycle: string | null, today: string, orderDueDays: number) {
  if (!nextCycle) return null;
  const d = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10));
  return Math.round((d(nextCycle) - d(today)) / 86_400_000) - orderDueDays;
}
/** Shown at 14 days or fewer; "Order now" (red) at 3 or fewer. */
export const orderDueTone = (days: number | null) =>
  days === null || days > 14 ? null : days <= 3 ? "bad" : "warn";

export const budgetPct = (used: number, budget: number) =>
  budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
/** Teal; amber at `warn` %; red at `bad` %. */
export const budgetTone = (pct: number, warn: number, bad: number) =>
  pct >= bad ? "bad" : pct >= warn ? "warn" : "ok";

export interface FlowPlace {
  id: string;
  name: string;
  kind: PlaceKind;
  suppliedFrom: string | null;
  /** Supplier names, for a place supplied directly. */
  suppliers: readonly string[];
}
export interface FlowNode {
  label: string;
  kind: "sup" | "store" | "place";
  arrow: boolean;
  sep: boolean;
}
/** `NMS · JMS → Main store → OPD, Ward 3 | UNEPI → EPI clinic`, from each place's supplied-from. */
export function stockFlow(places: readonly FlowPlace[]): FlowNode[] {
  const stores = places.filter((p) => p.kind === "store");
  const storeSup = [...new Set(stores.flatMap((s) => s.suppliers))];
  const via = places.filter((p) => p.kind !== "store" && p.suppliedFrom);
  const direct = places.filter((p) => p.kind !== "store" && !p.suppliedFrom && p.suppliers.length);
  const out: FlowNode[] = [];
  if (stores.length) {
    if (storeSup.length)
      out.push({ label: storeSup.join(" · "), kind: "sup", arrow: true, sep: false });
    stores.forEach((s, i) =>
      out.push({
        label: s.name,
        kind: "store",
        arrow: i === stores.length - 1 && via.length > 0,
        sep: false,
      }),
    );
  }
  via.forEach((p, i) =>
    out.push({
      label: p.name,
      kind: "place",
      arrow: false,
      sep: i === via.length - 1 && direct.length > 0,
    }),
  );
  for (const p of direct) {
    out.push({ label: p.suppliers.join(" · "), kind: "sup", arrow: true, sep: false });
    out.push({ label: p.name, kind: "place", arrow: false, sep: false });
  }
  return out;
}

/** Why a place cannot be closed now, or null. */
export function canClose(lines: number, handoverOpen: boolean): "stock" | "handover" | null {
  if (lines > 0) return "stock";
  if (handoverOpen) return "handover";
  return null;
}

/** Cold-chain lines kept at a place with no fridge: the Places warning and the Medicines "No fridge" check. */
export const coldWithoutFridge = (coldLines: number, fridges: number) =>
  coldLines > 0 && fridges === 0;

/** Handover times from the opening hours: 24 hours → 08:00 and 17:00; otherwise 08:00. */
export const slotsForHours = (hours: string) => (hours === "24h" ? ["08:00", "17:00"] : ["08:00"]);
