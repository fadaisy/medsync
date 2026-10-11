/** Ages are typed in days, months or years and stored in whole days (RR-4). Server and client. */
export type AgeUnit = "days" | "months" | "years";

const PER: Record<AgeUnit, number> = { days: 1, months: 30.4375, years: 365.25 };

export const toDays = (n: string, u: AgeUnit): number | null =>
  n.trim() === "" ? null : Math.round(Number(n) * PER[u]);

/** A stored age back to what was typed: whole years when it is one, else days. */
export function bandFromDays(d: number | null): { n: string; unit: AgeUnit } {
  if (d === null) return { n: "", unit: "years" };
  const years = d / 365.25;
  if (Math.abs(years - Math.round(years)) < 0.01)
    return { n: String(Math.round(years)), unit: "years" };
  return { n: String(d), unit: "days" };
}
