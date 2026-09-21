import type { SymptomDraft } from "@/components/patient/symptom-picker";
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
