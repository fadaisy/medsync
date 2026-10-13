/**
 * The nurse's chip on the administration record (Pharmacy Phase 1, 5.10, D-PH1-33; gate-a-content B-60).
 * Read-only: it changes nothing a nurse can do, and the first dose is never held (roadmap D-PH-01).
 * Draft wording for the CSO; behind `pharmacyDispensing`, which stays off in production while it is draft.
 */
export type WardChipKind = "not_reviewed" | "reviewed" | "queried" | "standard";

export interface WardChip {
  kind: WardChipKind;
  /** When a pharmacist first reviewed or accepted the line (`reviewed` only). */
  at: string | null;
}

const time = (iso: string) =>
  new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Africa/Kampala",
  });

export function wardChipWords(c: WardChip): string {
  switch (c.kind) {
    case "reviewed":
      return c.at ? `Pharmacy: reviewed ${time(c.at)}` : "Pharmacy: reviewed";
    case "queried":
      return "Pharmacy: query with the prescriber";
    case "standard":
      return "Pharmacy: standard lane, not reviewed";
    default:
      return "Pharmacy: not yet reviewed";
  }
}
