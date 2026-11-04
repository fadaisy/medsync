/** Validated for colour blindness (STORE.md §B3); do not change them. Text never takes a data colour. */
export const DATA = "#0d9488";
export const DATA2 = "#5b6bd6";
export const STATUS_MARK = {
  bad: "#d03b3b",
  warn: "#fab219",
  ok: "#0ca30c",
  over: "#5b6bd6",
  still: "#b4bccb",
} as const;
export const VEN_RAMP = { V: "#115e59", E: "#0d9488", N: "#14b8a6" } as const;
export const GRID = "var(--ink-100)";
export const ZERO = "var(--ink-500)";
export const REF = "var(--ink-700)";
export const BAND = "rgba(13,148,136,0.08)";
export const AREA = "rgba(13,148,136,0.10)";
export const SPARK = "var(--ink-500)";
