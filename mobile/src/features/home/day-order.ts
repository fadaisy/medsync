import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * The order of Home's "Here is your day" cards, as the patient dragged them.
 * Kept by kind of card, not by card, since doses and readings change daily.
 * On this phone only, per account: a layout choice, not a record.
 */
export type DayGroup = "medicine" | "reading" | "move" | "eat";

export const DEFAULT_ORDER: DayGroup[] = ["medicine", "reading", "move", "eat"];

const KEY = (userId: string) => `home.day-order.v1.${userId}`;

/** Cards sorted by their group's place in `order`; cards of one group keep theirs. */
export function sortByOrder<T extends { group: DayGroup }>(items: T[], order: DayGroup[]): T[] {
  const rank = (g: DayGroup) => order.indexOf(g);
  return items
    .map((item, i) => ({ item, i }))
    .sort((a, b) => rank(a.item.group) - rank(b.item.group) || a.i - b.i)
    .map((x) => x.item);
}

/**
 * The group order after a drag: groups in the order now on screen, then the
 * ones not shown today, where they were.
 */
export function orderFrom(shown: DayGroup[], previous: DayGroup[]): DayGroup[] {
  const seen = [...new Set(shown)];
  return [...seen, ...previous.filter((g) => !seen.includes(g))];
}

const valid = (v: unknown): v is DayGroup[] =>
  Array.isArray(v) &&
  v.length === DEFAULT_ORDER.length &&
  DEFAULT_ORDER.every((g) => v.includes(g));

export function useDayOrder(userId: string | null): [DayGroup[], (next: DayGroup[]) => void] {
  // Held with the account it belongs to, so a new sign-in starts from the default.
  const [held, setHeld] = useState<{ userId: string | null; order: DayGroup[] }>({
    userId: null,
    order: DEFAULT_ORDER,
  });
  useEffect(() => {
    if (!userId) return;
    let live = true;
    AsyncStorage.getItem(KEY(userId))
      .then((raw) => {
        const v: unknown = raw ? JSON.parse(raw) : null;
        if (live && valid(v)) setHeld({ userId, order: v });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [userId]);
  const save = (next: DayGroup[]) => {
    setHeld({ userId, order: next });
    if (userId) void AsyncStorage.setItem(KEY(userId), JSON.stringify(next)).catch(() => {});
  };
  return [held.userId === userId ? held.order : DEFAULT_ORDER, save];
}
