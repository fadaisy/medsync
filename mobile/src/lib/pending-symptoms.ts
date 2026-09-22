import type { SymptomDraft } from "@/components/patient/symptom-picker";
import type { SubmissionAudience, Tier } from "@shared/symptom-catalog/types";
import { useSyncExternalStore } from "react";

/**
 * What the patient tapped under "How are you feeling today?" before choosing
 * where to book (ADR 0096) — carried in memory to the booking screens, which
 * start from it and write back every change, and cleared when a booking
 * lands. In memory on purpose: it is a draft of one visit, not a record, and
 * a relaunch starts clean.
 */
let pending: SymptomDraft[] = [];
const listeners = new Set<() => void>();

export function getPendingSymptoms(): SymptomDraft[] {
  return pending;
}

export function setPendingSymptoms(next: SymptomDraft[]): void {
  pending = next;
  listeners.forEach((l) => l());
}

export function clearPendingSymptoms(): void {
  setPendingSymptoms([]);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The live value, for the home screen's chips. */
export function usePendingSymptoms(): SymptomDraft[] {
  return useSyncExternalStore(subscribe, getPendingSymptoms, getPendingSymptoms);
}

/* ── The catalog pre-step's draft (ADR 0098) ──────────────────────── */

/** The tiered catalog's record before booking — see lib/patient/pending-symptoms.ts on the web. */
export interface CatalogDraft {
  audience: SubmissionAudience;
  items: string[];
  qualifiers: Record<string, Record<string, string>>;
  freeText?: string | null;
  submissionId?: string | null;
  tier?: Tier | null;
  catalogVersion: string;
}

let catalogDraft: CatalogDraft | null = null;
const catalogListeners = new Set<() => void>();

export function getPendingCatalogDraft(): CatalogDraft | null {
  return catalogDraft;
}

export function setPendingCatalogDraft(next: CatalogDraft | null): void {
  catalogDraft = next;
  catalogListeners.forEach((l) => l());
}

export function clearPendingCatalogDraft(): void {
  setPendingCatalogDraft(null);
}

function subscribeCatalog(listener: () => void): () => void {
  catalogListeners.add(listener);
  return () => catalogListeners.delete(listener);
}

export function usePendingCatalogDraft(): CatalogDraft | null {
  return useSyncExternalStore(subscribeCatalog, getPendingCatalogDraft, getPendingCatalogDraft);
}
