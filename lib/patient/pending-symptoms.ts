import type { DraftSymptom } from "@/app/patient/book/_lib/booking";
import type { SubmissionAudience, Tier } from "@/supabase/functions/_shared/symptom-catalog/types";

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

/* ── The catalog pre-step's draft (ADR 0098) ──────────────────────── */

/**
 * What the tiered catalog recorded before booking: the audience, the item
 * keys, the qualifier answers, and — once `pt-submit-symptoms` has run —
 * the submission id and the tier the server computed. Carried the same way
 * as the descriptive picks (sessionStorage, this tab, cleared when a booking
 * lands); the two slots never mix because production may run only one.
 */
export interface CatalogDraft {
  audience: SubmissionAudience;
  items: string[];
  qualifiers: Record<string, Record<string, string>>;
  freeText?: string | null;
  submissionId?: string | null;
  tier?: Tier | null;
  catalogVersion: string;
}

const CATALOG_KEY = "medsync:pending-catalog";

export function readPendingCatalogDraft(): CatalogDraft | null {
  try {
    const raw = window.sessionStorage.getItem(CATALOG_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as Partial<CatalogDraft>;
    if (!d || typeof d !== "object" || typeof d.audience !== "string") return null;
    return {
      audience: d.audience as SubmissionAudience,
      items: Array.isArray(d.items)
        ? d.items.filter((x): x is string => typeof x === "string")
        : [],
      qualifiers: d.qualifiers && typeof d.qualifiers === "object" ? d.qualifiers : {},
      freeText: typeof d.freeText === "string" ? d.freeText.slice(0, 500) : null,
      submissionId: typeof d.submissionId === "string" ? d.submissionId : null,
      tier: d.tier === "E" || d.tier === "U" || d.tier === "R" ? d.tier : null,
      catalogVersion: typeof d.catalogVersion === "string" ? d.catalogVersion : "",
    };
  } catch {
    return null;
  }
}

export function writePendingCatalogDraft(draft: CatalogDraft | null): void {
  try {
    if (!draft) window.sessionStorage.removeItem(CATALOG_KEY);
    else window.sessionStorage.setItem(CATALOG_KEY, JSON.stringify(draft));
  } catch {
    // The pre-step still works for this page; the wizard starts without it.
  }
}

export function clearPendingCatalogDraft(): void {
  writePendingCatalogDraft(null);
}
