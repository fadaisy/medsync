/** Wards and beds (phase 2 of ADR 0520): what the list, the panel and the dialogs share. */

export const BASE = "/hospital-admin/departments/wards";

export type Option = { id: string; name: string };

export const label = (list: ReadonlyArray<{ code: string; label: string }>, code: string | null) =>
  list.find((x) => x.code === code)?.label ?? null;

const DAY = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: "Africa/Kampala",
});
/** An instant as the page prints a date: "16 Nov 2026". */
export const dayText = (iso: string) => DAY.format(new Date(iso));
