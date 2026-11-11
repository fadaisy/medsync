import type { Shelf, StoreBatch, StoreRules, StoreWorld } from "./types";

import { fridgeState } from "@/lib/pharmacy/derive/setup/places";

/** Counts and conditions (STORE.md §F4, §F6, §H). Pure. */

/** After the count rule; the controlled cupboard daily. Never counted is due. */
export const shelfDue = (s: Pick<Shelf, "controlled" | "days">, r: StoreRules) =>
  s.days === null || (s.controlled ? s.days >= r.cdCount : s.days > r.countEvery);

/** A bin belongs to the shelf when it is the code or starts with "<code>-". */
export const onShelf = (bin: string | null, code: string) =>
  bin !== null && (bin === code || bin.startsWith(`${code}-`));
export const shelfBatches = (w: StoreWorld, code: string): StoreBatch[] =>
  w.batches.filter((b) => onShelf(b.bin, code));

export const shelvesDue = (w: StoreWorld) =>
  w.shelves.filter((s) => shelfDue(s, w.rules) && !s.countedToday);

/** Every line's |counted − expected| × unit cost. */
export const countDiffValue = (
  lines: readonly { expected: number; counted: number; cost: number }[],
) => lines.reduce((a, l) => a + Math.abs(l.counted - l.expected) * l.cost, 0);
export const needsSignOff = (value: number, r: Pick<StoreRules, "countSign">) =>
  value > r.countSign;

export type Level = "ok" | "warn" | "bad";
export function roomState(
  temp: number,
  humidity: number,
  r: StoreRules,
): { temp: Level; humidity: Level } {
  return {
    temp: temp > r.roomTemp ? "bad" : temp > r.roomTempWarn ? "warn" : "ok",
    humidity: humidity > r.humidity ? "bad" : humidity > r.humidityWarn ? "warn" : "ok",
  };
}
/** Readings inside the limits (temperature at or under, humidity at or under). */
export const insideLimits = (temp: number, humidity: number, r: StoreRules) =>
  temp <= r.roomTemp && humidity <= r.humidity;
export const coldState = (temp: number, r: Pick<StoreRules, "coldNear">) =>
  fridgeState(temp, r.coldNear);
