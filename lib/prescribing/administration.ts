import type { PriorAdministration } from "@/lib/prescribing/engine";
import type { TimelineEvent } from "@/lib/resus/types";

/**
 * Emergency-administration projections (GATE C) — PURE reads over the immutable
 * resus timeline. In emergency mode the prescription IS the administration
 * (grab-and-give): a `drug` event carries a `prescribing` payload with the full
 * accountability + pharmacy-reconciliation data. Cumulative dosing and the live
 * in-episode allergy list are projected from the timeline (the same projection
 * pattern as the resus engine) — no new table needed for the record itself.
 */

interface PrescribingPayload {
  drugId?: string;
  drugKey?: string;
  drugName?: string;
  dose?: string;
  concentration?: string;
  route?: string;
  indication?: string;
  amountMg?: number;
  cart?: string;
  giverUserId?: string;
  witnessUserId?: string | null;
  controlled?: boolean;
  overrideReason?: string | null;
  overriddenFlags?: string[];
  source?: string;
}

function prescribingOf(e: TimelineEvent): PrescribingPayload | null {
  if (e.kind !== "drug") return null;
  const p = (e.payload as { prescribing?: PrescribingPayload }).prescribing;
  return p && typeof p === "object" ? p : null;
}

/**
 * The prior emergency administrations as {drugKey, amountMg} — fed to the
 * engine's cumulative/max check (e.g. atropine 3 mg cap across the episode).
 * Only events that carry a numeric amountMg contribute.
 */
export function priorAdministrationsFromTimeline(
  events: readonly TimelineEvent[],
): PriorAdministration[] {
  const out: PriorAdministration[] = [];
  for (const e of events) {
    const p = prescribingOf(e);
    if (p?.drugKey && typeof p.amountMg === "number") {
      out.push({ drugKey: p.drugKey, amountMg: p.amountMg });
    }
  }
  return out;
}

/**
 * The live in-episode allergy list — the latest allergy-capture note wins
 * (a "no known allergies" capture clears it). This makes the prescribe-time
 * allergy check REAL within the resus until the persistent cross-encounter
 * allergies table lands (the clean seam).
 */
export function recordedAllergiesFromTimeline(events: readonly TimelineEvent[]): string[] {
  let latest: { at: string; substances: string[] } | null = null;
  for (const e of events) {
    const cap = (e.payload as { allergyCapture?: { substances?: string[]; nkda?: boolean } })
      .allergyCapture;
    if (!cap) continue;
    if (!latest || e.recordedAt > latest.at) {
      latest = { at: e.recordedAt, substances: cap.nkda ? [] : (cap.substances ?? []) };
    }
  }
  return latest?.substances ?? [];
}

export interface AdministeredDrug {
  drugId: string;
  drugName: string;
  dose: string;
  concentration: string | null;
  route: string | null;
  amountMg: number | null;
  cart: string | null;
  controlled: boolean;
  overrideReason: string | null;
  at: string;
}

/** Administered emergency drugs, newest-first (for the record/cumulative view). */
export function buildAdministeredDrugs(events: readonly TimelineEvent[]): AdministeredDrug[] {
  const out: AdministeredDrug[] = [];
  for (const e of events) {
    const p = prescribingOf(e);
    if (!p?.drugId) continue;
    out.push({
      drugId: p.drugId,
      drugName: p.drugName ?? p.drugId,
      dose: p.dose ?? "",
      concentration: p.concentration ?? null,
      route: p.route ?? null,
      amountMg: typeof p.amountMg === "number" ? p.amountMg : null,
      cart: p.cart ?? null,
      controlled: p.controlled ?? false,
      overrideReason: p.overrideReason ?? null,
      at: e.recordedAt,
    });
  }
  return out.sort((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}
