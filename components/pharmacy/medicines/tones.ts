import type { Status } from "@/lib/pharmacy/derive/medicines";

/**
 * Stock status colours (MEDICINES-TAB.md §18), always beside their word. Red, amber and green are the status tokens
 * (they carry the dark theme); Over is the spec's blue. A dot is never the only signal.
 */
export const DOT: Record<Status | "none", string> = {
  Out: "bg-status-critical-fg",
  Low: "bg-status-caution-fg",
  OK: "bg-status-stable-fg",
  Over: "bg-[#2563eb]",
  none: "bg-[#c5cbd8]",
};
export const CHIP: Record<Status, string> = {
  Out: "bg-status-critical-bg text-status-critical-fg-aa",
  Low: "bg-status-caution-bg text-status-caution-fg-aa",
  OK: "bg-status-stable-bg text-status-stable-fg",
  Over: "bg-[#dbeafe] text-[#1e40af] dark:bg-[#172554] dark:text-[#bfdbfe]",
};
/** Expiry and cover: amber under the warning line, red under the danger line, both bold. */
export const near = (d: number | null, warn: number, danger?: number) =>
  d === null
    ? ""
    : danger !== undefined && d < danger
      ? "font-semibold text-status-critical-fg-aa"
      : d < warn
        ? "font-semibold text-status-caution-fg-aa"
        : "";
