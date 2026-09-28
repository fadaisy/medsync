import { formatClock } from "@/lib/emr/charts/scale";

/**
 * The words a graph's accessible name is made of: the latest value and the trend, stated, never
 * judged ("up from", not "worsening").
 */

export const MINUS = "−";

/** 1250 → "1,250"; −300 → "−300" (a true minus sign). */
export function mlWords(n: number): string {
  const abs = Math.abs(n).toLocaleString("en-GB", { maximumFractionDigits: 1 });
  return n < 0 ? `${MINUS}${abs}` : abs;
}

/** A balance with its sign: "+1,250", "−300", "0". */
export function signedMl(n: number): string {
  return n > 0 ? `+${mlWords(n)}` : mlWords(n);
}

/** "latest 3 at 06:00, down from 5 at 23:00"; one value: "3 at 06:00, the only entry". */
export function trendWords(
  points: readonly { at: string; value: number }[],
  format: (n: number) => string,
): string {
  const last = points.at(-1);
  if (!last) return "no entries yet";
  if (points.length === 1)
    return `${format(last.value)} at ${formatClock(last.at)}, the only entry`;
  const first = points[0]!;
  const way =
    last.value > first.value ? "up from" : last.value < first.value ? "down from" : "the same as";
  return `latest ${format(last.value)} at ${formatClock(last.at)}, ${way} ${format(first.value)} at ${formatClock(first.at)}`;
}

export const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
