import type { DraftSymptom } from "@/app/patient/book/_lib/booking";

import { MAX_SYMPTOM_LABEL, MAX_SYMPTOMS } from "@/supabase/functions/_shared/symptoms";

/**
 * What the patient tapped under "How are you feeling today?" before choosing
 * a clinic (ADR 0096), carried to the booking wizard in sessionStorage — it
 * survives browsing the clinics and doctors, stays in this tab, and goes
 * with the tab. Client-only; every access is guarded, since storage can be
 * absent or throw (private windows, cleared data).
 */
const KEY = "medsync:pending-symptoms";

export function readPendingSymptoms(): DraftSymptom[] {
  try {
    const raw = window.sessionStorage.getItem(KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as unknown;
    if (!Array.isArray(list)) return [];
    // Entries carry no duration yet (the wizard asks); keep the label + code
    // of anything shaped like a symptom, drop the rest.
    return list
      .filter(
        (x): x is { code: unknown; label: unknown } =>
          !!x && typeof x === "object" && typeof (x as { label?: unknown }).label === "string",
      )
      .map((x) => ({
        code: typeof x.code === "string" && x.code ? x.code : null,
        label: (x.label as string).trim().slice(0, MAX_SYMPTOM_LABEL),
        duration: null,
      }))
      .filter((x) => x.label)
      .slice(0, MAX_SYMPTOMS);
  } catch {
    return [];
  }
}

export function writePendingSymptoms(list: ReadonlyArray<DraftSymptom>): void {
  try {
    if (list.length === 0) window.sessionStorage.removeItem(KEY);
    else window.sessionStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    // Nothing to do: the chips still work for this page; the wizard starts empty.
  }
}

export function clearPendingSymptoms(): void {
  writePendingSymptoms([]);
}
