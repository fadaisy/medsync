/**
 * Clerkship history sections — PURE projections + the derived values that must
 * never be typed (pack-years). Renders the tap-first PMH/PSH/drug structured
 * entries into readable documentation. Explicit negatives are recorded honestly
 * ("nil", "NKDA"), never blank-implied. No fabrication. Decision-support.
 */

import type { ClerkMedication, ClerkPmhItem, ClerkPshItem } from "@/lib/encounter/clerkship";

/** Always-screen "ever had?" toggles (PMH §1c) — high-yield, Uganda-relevant. CSO-signed. */
export const PMH_SCREEN: { key: string; label: string }[] = [
  { key: "diabetes", label: "Diabetes" },
  { key: "hypertension", label: "Hypertension" },
  { key: "tuberculosis", label: "TB (ever treated)" },
  { key: "hiv", label: "HIV status known" },
  { key: "sickle_cell", label: "Sickle-cell" },
  { key: "jaundice_hepatitis", label: "Jaundice / hepatitis" },
  { key: "rheumatic_fever", label: "Rheumatic fever" },
  { key: "asthma", label: "Asthma" },
  { key: "epilepsy", label: "Epilepsy" },
  { key: "blood_transfusion", label: "Blood transfusion (ever)" },
];

/** Quick family-screen toggles (FH §4b). */
export const FH_SCREEN: { key: string; label: string }[] = [
  { key: "heart_disease", label: "Heart disease" },
  { key: "stroke", label: "Stroke" },
  { key: "diabetes", label: "Diabetes" },
  { key: "cancer", label: "Cancer" },
  { key: "sudden_death", label: "Sudden death" },
  { key: "sickle_cell", label: "Sickle-cell" },
  { key: "inherited", label: "Inherited condition" },
];

const STATUS_LABEL: Record<string, string> = {
  well_controlled: "well controlled",
  poorly_controlled: "poorly controlled",
  remission: "in remission",
  resolved: "resolved",
  newly_diagnosed: "newly diagnosed",
};

const ANAESTHETIC_LABEL: Record<string, string> = {
  ga: "GA",
  spinal: "spinal",
  local: "local",
  unsure: "anaesthetic unsure",
};

/** Pack-years = (cigarettes/day ÷ 20) × years. Null if either input is missing/zero. */
export function packYears(
  cigsPerDay: number | undefined,
  years: number | undefined,
): number | null {
  if (cigsPerDay == null || years == null) return null;
  if (!(cigsPerDay > 0) || !(years > 0)) return null;
  return Math.round((cigsPerDay / 20) * years * 100) / 100;
}

function pmhPhrase(p: ClerkPmhItem): string {
  const bits: string[] = [];
  if (p.year?.trim()) bits.push(p.year.trim());
  if (p.status) bits.push(STATUS_LABEL[p.status] ?? p.status);
  if (p.onTreatment) bits.push("on treatment");
  if (p.complications?.length) bits.push(`complications: ${p.complications.join(", ")}`);
  if (p.note?.trim()) bits.push(p.note.trim());
  return bits.length ? `${p.display} (${bits.join(", ")})` : p.display;
}

/** PMH documentation — conditions + the always-screen results (honest negatives). */
export function renderPmhSummary(
  items: ClerkPmhItem[],
  screen: Record<string, "yes" | "no" | "unsure">,
): string {
  const parts: string[] = [];
  const conditions = items.filter((p) => p.display?.trim());
  if (conditions.length) parts.push(conditions.map(pmhPhrase).join("; ") + ".");

  const entries = Object.entries(screen ?? {});
  if (entries.length) {
    const pos = entries.filter(([, v]) => v === "yes").map(([k]) => k);
    const neg = entries.filter(([, v]) => v === "no").map(([k]) => k);
    const unsure = entries.filter(([, v]) => v === "unsure").map(([k]) => k);
    const clauses: string[] = [];
    if (pos.length) clauses.push("reports " + pos.join(", "));
    if (neg.length) clauses.push("denies " + neg.join(", "));
    if (unsure.length) clauses.push("unsure: " + unsure.join(", "));
    if (clauses.length) parts.push("Screen: " + clauses.join("; ") + ".");
  }

  return parts.length ? parts.join(" ") : "No significant past medical history recorded.";
}

function pshPhrase(p: ClerkPshItem): string {
  const bits: string[] = [];
  if (p.year?.trim()) bits.push(p.year.trim());
  if (p.anaesthetic) bits.push(ANAESTHETIC_LABEL[p.anaesthetic] ?? p.anaesthetic);
  if (p.anaestheticComplication) bits.push("anaesthetic complication");
  if (p.complications?.trim()) bits.push(p.complications.trim());
  return bits.length ? `${p.display} (${bits.join(", ")})` : p.display;
}

/** PSH documentation — operations; explicit "no previous operations" when empty. */
export function renderPshSummary(items: ClerkPshItem[]): string {
  const ops = items.filter((p) => p.display?.trim());
  return ops.length ? ops.map(pshPhrase).join("; ") + "." : "No previous operations recorded.";
}

/** Drug history documentation — current medications; explicit "no regular meds" when empty. */
export function renderDrugSummary(meds: ClerkMedication[]): string {
  const list = meds.filter((m) => m.name?.trim());
  if (!list.length) return "No regular medications recorded.";
  return (
    list
      .map((m) => {
        const bits = [m.dose, m.route, m.frequency].filter((x) => x?.trim());
        return bits.length ? `${m.name} ${bits.join(" ")}` : m.name;
      })
      .join("; ") + "."
  );
}
